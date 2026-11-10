import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as fsProvider from "@deepseek-ai/dsh-skill-filesystem";

/**
 * afk-skills-dsh — runtime-reference bundle, versioned like the Claude plugin.
 *
 * Ships NO skill snapshot. The skill-set version space mirrors the Claude
 * Code plugin versioning of the AFK repo: its AGENTS.md mandates bumping
 * `.claude-plugin/plugin.json` in the same commit as every skill change.
 * Like Claude Code's own per-plugin `gitCommitSha` pinning, any git commit
 * can be fixated as a version:
 *
 *   - ref "latest" (default): resolves the highest `plugin-v*` tag on the
 *     remote each refresh and tracks it — new plugin release => skills
 *     update automatically, in plugin-version terms.
 *   - ref "plugin-v1.2.1" / branch / COMMIT SHA: pinned; set it back (or to
 *     any other commit) to roll the whole skill set back instantly. The
 *     pin is persisted to cacheDir/version.json as {ref, commitSha,
 *     pluginVersion}.
 *   - no plugin-v* tags exist yet: falls back to fallbackRef (main) and
 *     warns.
 *
 * One shallow clone per resolved ref under the cache directory; previously
 * used refs stay cached so pinning back is a checkout, not a re-clone.
 * Offline-safe: a cached clone keeps working; refresh failures are warnings.
 *
 * Configuration (patch config > env > defaults):
 *   repo     AFK_SKILLS_REPO      https://github.com/easyhaloo/afk.git
 *   ref      AFK_SKILLS_REF       latest
 *   fallbackRef  AFK_SKILLS_FALLBACK_REF  main   (used when ref=latest and
 *                                                no plugin-v* tag exists)
 *   cacheDir AFK_SKILLS_CACHE_DIR ~/.dsh/afk-skills-cache
 *   refreshIntervalMs  AFK_SKILLS_REFRESH_MS  900000 (15 min, min 60000)
 */

const name = "afk-skills";
const inject = ["skills"];

const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const PLUGIN_TAG_PREFIX = "plugin-v";

function parseInterval(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 60_000 ? n : undefined;
}

function defaults(config = {}) {
  return {
    repo: config.repo ?? process.env.AFK_SKILLS_REPO ?? "https://github.com/easyhaloo/afk.git",
    ref: config.ref ?? process.env.AFK_SKILLS_REF ?? "latest",
    fallbackRef: config.fallbackRef ?? process.env.AFK_SKILLS_FALLBACK_REF ?? "main",
    cacheDir: config.cacheDir ?? process.env.AFK_SKILLS_CACHE_DIR ?? join(homedir(), ".dsh", "afk-skills-cache"),
    refreshIntervalMs:
      config.refreshIntervalMs ??
      parseInterval(process.env.AFK_SKILLS_REFRESH_MS) ??
      DEFAULT_REFRESH_INTERVAL_MS,
  };
}

function compareVersions(a, b) {
  const pa = a.replace(/^[^0-9]*/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^[^0-9]*/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Resolve ref "latest" to the highest plugin-v* tag on the remote. */
async function resolveRef({ repo, ref, fallbackRef }) {
  if (ref !== "latest") return { ref };
  const listed = await runGit(["ls-remote", "--tags", "--refs", "origin", `refs/tags/${PLUGIN_TAG_PREFIX}*`]);
  if (!listed.ok) return { ref: fallbackRef, resolved: false, problem: listed.output.split("\n")[0] };
  const tags = listed.output
    .split("\n")
    .map((line) => line.trim().split("\t")[1])
    .filter((r) => r?.startsWith(`refs/tags/${PLUGIN_TAG_PREFIX}`))
    .map((r) => r.slice("refs/tags/".length));
  if (tags.length === 0) return { ref: fallbackRef, resolved: false, problem: "no plugin-v* tags on remote yet" };
  const latest = tags.sort(compareVersions).at(-1);
  return { ref: latest, resolved: true };
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
    // default-branch clone first; any ref (tag / branch / COMMIT SHA) is then
    // fetched and checked out — GitHub serves reachable SHAs over fetch, so
    // pinning works exactly like Claude Code's per-plugin gitCommitSha.
    const cloned = await runGit(["clone", "--depth", "1", repo, bucket]);
    if (!cloned.ok && !existsSync(gitDir)) return cloned;
  }
  const fetched = await runGit(["fetch", "--depth", "1", "origin", ref], bucket);
  if (!fetched.ok) return fetched;
  return runGit(["checkout", "-f", "FETCH_HEAD"], bucket);
}

/** Read the checked-out skill set's plugin version + commit SHA. */
function readPinnedState(bucket) {
  try {
    const plugin = JSON.parse(readFileSync(join(bucket, ".claude-plugin", "plugin.json"), "utf8"));
    return { pluginVersion: plugin.version ?? null };
  } catch {
    return { pluginVersion: null };
  }
}

function apply(ctx, config = {}) {
  const opts = defaults(config);
  // ONE bucket, checked out in place to whatever the resolved ref is — the
  // mounted skills path never changes, so the provider's watcher sees every
  // version switch (tag bump or rollback) as ordinary file changes.
  const bucket = join(opts.cacheDir, "current");
  const skillsRoot = join(bucket, "skills");
  let lastResolved;
  let lastPinSha;
  let refreshing = false;

  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const { ref, resolved, problem } = await resolveRef(opts);
      if (!resolved && problem) console.warn(`[afk-skills] ${problem}; falling back to ${ref}`);
      if (resolved && lastResolved && ref !== lastResolved) {
        console.log(`[afk-skills] skill set ref changed: ${lastResolved} -> ${ref}`);
      }
      if (resolved) lastResolved = ref;
      const result = await ensureClone({ repo: opts.repo, ref, bucket });
      if (!result.ok) {
        console.warn(`[afk-skills] cache refresh failed (${ref}): ${result.output.split("\n")[0]}`);
        return;
      }
      // persist the pin (commit SHA + Claude plugin version) for inspection
      const sha = (await runGit(["rev-parse", "HEAD"], bucket)).output.trim();
      const { pluginVersion } = readPinnedState(bucket);
      writeFileSync(
        join(opts.cacheDir, "version.json"),
        JSON.stringify({ ref, commitSha: sha, pluginVersion, updatedAt: new Date().toISOString() }, null, 2) + "\n",
      );
      if (lastPinSha !== sha) {
        console.log(`[afk-skills] pinned ${ref} @ ${sha.slice(0, 12)} (plugin ${pluginVersion ?? "?"})`);
        lastPinSha = sha;
      }
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
