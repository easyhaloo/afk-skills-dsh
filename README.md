# afk-skills-dsh

[AFK skill suite](https://github.com/easyhaloo/afk) packaged as a
[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)
plugin bundle — installable from GitHub, no local checkout of the AFK repo
required.

## What it ships

24 `afk-*` / utility skills from the AFK repo (`skills/` snapshot, synced by
`sync-skills.sh`). The bundle mounts one isolated
`@deepseek-ai/dsh-skill-filesystem` provider scoped to the packaged `skills/`
directory, so it never collides with project or user skill roots.

Skills whose `SKILL.md` declares `disable-model-invocation: true` (e.g.
`afk-grill-me`, `afk-implement`, `afk-qa`) are user-invocable commands only —
by design, matching upstream.

## Install (any DSH user)

In a DSH session, ask the agent to install the bundle, or use the Web sidebar
**Plugins** page, with a pinned tag (recommended):

```
github:easyhaloo/afk-skills-dsh#v1.2.3
```

or floating to the newest tag:

```
github:easyhaloo/afk-skills-dsh#semver:^1.2.3
```

## Upgrade the whole skill set

The bundle version tracks the AFK plugin version
(`easyhaloo/afk` → `.claude-plugin/plugin.json`). To release a new set:

```bash
./sync-skills.sh                      # snapshot skills from ~/llm/afk/skills
# bump "version" in package.json, then commit + tag
git tag v<version> && git push --tags
```

Users then reinstall the bundle at the new tag (or rely on `#semver:`).

A scheduled GitHub Action (`.github/workflows/sync.yml`) does the same
automatically: syncs from `easyhaloo/afk` default branch, bumps the patch
version, commits, and tags when skills changed.

## Repo layout

```
├── package.json         # dsh.bundle.patch declaration + version
├── cordis.patch.yml     # inserts the afk-skills plugin row
├── lib/index.js         # bundle entry: mounts the isolated skill provider
├── skills/              # snapshot of easyhaloo/afk skills (source of truth: that repo)
└── sync-skills.sh       # local sync from a checked-out AFK repo
```

## Source of truth

`skills/` here is a **snapshot**. Skill edits belong in
[easyhaloo/afk](https://github.com/easyhaloo/afk) (`skills/` directory);
never edit this snapshot directly.
