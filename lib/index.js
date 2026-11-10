import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as fsProvider from "@deepseek-ai/dsh-skill-filesystem";

/**
 * afk-skills-dsh — runtime-reference bundle.
 *
 * Ships NO skill snapshot. On activation it maintains a shallow git clone of
 * the AFK repository (source of truth) in a local cache directory and mounts
 * an isolated skill-filesystem provider scanning the clone's skills/ folder.
 *
 * The provider's missing-root probing bridges the gap: while the cache is
 * being cloned (or is offline-unavailable), the root is absent and skills
 * stay out of the catalog; once present they are discovered automatically.
 * A cached clone keeps working offline; refresh failures are non-fatal.
 *
 * Configuration (patch config > env > defaults):
 *   repo     AFK_SKILLS_REPO      https://github.com/easyhaloo/afk.git
 *   ref      AFK_SKILLS_REF       main
 *   cacheDir AFK_SKILLS_CACHE_DIR ~/.dsh/afk-skills-cache
 *   refreshIntervalMs  AFK_SKILLS_REFRESH_MS  900000 (15 min)
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

async function ensureClone({ repo, ref, cacheDir }) {
  const gitDir = join(cacheDir, ".git");
  if (!existsSync(gitDir)) {
    const cloned = await runGit(["clone", "--depth", "1", "--branch", ref, repo, cacheDir]);
    if (!cloned.ok) {
      // ref may be a raw SHA or the branch name differs — retry bare clone + checkout
      const bare = existsSync(gitDir)
        ? { ok: true }
        : await runGit(["clone", "--depth", "1", repo, cacheDir]);
      if (!bare.ok) return cloned;
    }
  }
  // refresh to the requested ref (cache is plugin-owned; detached checkout is fine)
  const fetched = await runGit(["fetch", "--depth", "1", "origin", ref], cacheDir);
  if (!fetched.ok) return fetched;
  return runGit(["checkout", "-f", "FETCH_HEAD"], cacheDir);
}

function apply(ctx, config = {}) {
  const opts = defaults(config);
  const skillsRoot = join(opts.cacheDir, "skills");
  let refreshing = false;

  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const result = await ensureClone(opts);
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

export { defaults, name, inject, apply };
