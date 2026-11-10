import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as fsProvider from "@deepseek-ai/dsh-skill-filesystem";

/**
 * afk-skills-dsh — runtime-reference bundle with ref-pinned rollback.
 *
 * Ships NO skill snapshot. Maintains one shallow git clone PER configured
 * ref of the AFK repository (source of truth) under the cache directory and
 * mounts an isolated skill-filesystem provider scanning that clone's
 * skills/ folder.
 *
 * Versioning & rollback: the AFK repo's git tags ARE the skill versions
 * (its convention bumps .claude-plugin/plugin.json on every skill change).
 * Pin `ref` to a tag (e.g. `cli-v0.2.44`) to freeze; change `ref` and let
 * the refresh cycle (or a restart) roll forward/back. Per-ref cache buckets
 * make switching cheap — previously fetched refs are kept and re-checked
 * out without a new clone.
 *
 * While a clone is being created (or is offline-unavailable) the skill root
 * is absent; DSH's missing-root probing polls until it appears. A cached
 * clone keeps working offline; refresh failures are non-fatal warnings.
 *
 * Configuration (patch config > env > defaults):
 *   repo     AFK_SKILLS_REPO      https://github.com/easyhaloo/afk.git
 *   ref      AFK_SKILLS_REF       main
 *   cacheDir AFK_SKILLS_CACHE_DIR ~/.dsh/afk-skills-cache
 *   refreshIntervalMs  AFK_SKILLS_REFRESH_MS  900000 (15 min, min 60000)
 */

const name = "afk-skills";
const inject = ["skills"];

const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 min

function parseInterval(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 60_000 ? n : undefined;
}

function defaults(config = {}) {
  return {
    repo: config.repo ?? process.env.AFK_SKILLS_REPO ?? "https://github.com/easyhaloo/afk.git",
    ref: config.ref ?? process.env.AFK_SKILLS_REF ?? "main",
    cacheDir: config.cacheDir ?? process.env.AFK_SKILLS_CACHE_DIR ?? join(homedir(), ".dsh", "afk-skills-cache"),
    refreshIntervalMs:
      config.refreshIntervalMs ??
      parseInterval(process.env.AFK_SKILLS_REFRESH_MS) ??
      DEFAULT_REFRESH_INTERVAL_MS,
  };
}

/** Filesystem-safe bucket name for a ref (tags, branches; SHAs tolerated). */
function refBucket(ref) {
  return ref.replace(/[^A-Za-z0-9._-]+/g, "-") || "default";
}

function runGit(args, cwd, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, output: String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output });
    });
  });
}

async function ensureClone({ repo, ref, bucket }) {
  const gitDir = join(bucket, ".git");
  if (!existsSync(gitDir)) {
    const cloned = await runGit(["clone", "--depth", "1", "--branch", ref, repo, bucket]);
    if (!cloned.ok && !existsSync(gitDir)) return cloned; // ref must be a tag or branch
  }
  // refresh the bucket to the requested ref (cache-owned; detached checkout)
  const fetched = await runGit(["fetch", "--depth", "1", "origin", ref], bucket);
  if (!fetched.ok) return fetched;
  return runGit(["checkout", "-f", "FETCH_HEAD"], bucket);
}

function apply(ctx, config = {}) {
  const opts = defaults(config);
  const bucket = join(opts.cacheDir, refBucket(opts.ref));
  const skillsRoot = join(bucket, "skills");
  let refreshing = false;

  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const result = await ensureClone({ ...opts, bucket });
      if (!result.ok) console.warn(`[afk-skills] cache refresh failed (${opts.ref}): ${result.output.split("\n")[0]}`);
    } finally {
      refreshing = false;
    }
  };

  // fire-and-forget: provider probes for the missing root until the clone lands
  void refresh();
  const timer = setInterval(() => void refresh(), opts.refreshIntervalMs);
  timer.unref?.();

  ctx.effect(function* () {
    yield async () => clearInterval(timer);
  }, "afk-skills refresh timer");

  ctx.plugin(fsProvider, {
    providerName: "afk-filesystem",
    includeDefaultRoots: false,
    customSkillDirs: [skillsRoot],
    watch: true,
  });
}

export { defaults, refBucket, name, inject, apply };
