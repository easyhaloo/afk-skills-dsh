import { fileURLToPath } from "node:url";
import * as fsProvider from "@deepseek-ai/dsh-skill-filesystem";

/**
 * afk-skills-dsh — DeepSeek Harness bundle entry.
 *
 * Mounts a dedicated, isolated instance of the local filesystem skill
 * provider that scans ONLY this package's bundled `skills/` directory.
 * The AFK repo (~/llm/afk, source of truth) is snapshotted into skills/
 * by sync-skills.sh at package build time; the bundle version tracks the
 * upstream `.claude-plugin/plugin.json` version.
 */
const name = "afk-skills";
const inject = ["skills"];

function apply(ctx) {
  const skillsRoot = fileURLToPath(new URL("../skills/", import.meta.url));
  ctx.plugin(fsProvider, {
    providerName: "afk-filesystem",
    includeDefaultRoots: false,
    customSkillDirs: [skillsRoot],
    watch: true,
  });
}

export { name, inject, apply };
