# afk-skills-dsh

[AFK skill suite](https://github.com/easyhaloo/afk) as a
[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)
plugin bundle — installed from GitHub, **referencing** the AFK repo at
runtime. No skill snapshot is stored here.

## How it works

On activation the bundle maintains a shallow git clone of `easyhaloo/afk` in
`~/.dsh/afk-skills-cache` (created on first use, refreshed on activation and
every 15 minutes by default) and mounts an isolated `skill-filesystem`
provider scanning the clone's `skills/` directory. Skill edits land in the
AFK repo; every user picks them up on the next cache refresh — no bundle
release required.

While the cache is being cloned (first run / offline without cache), the
skill root is absent and DSH's missing-root probing keeps polling; skills
appear automatically once the clone lands. A cached clone keeps working
offline; refresh failures are non-fatal warnings.

## Install (any DSH user)

Pin a bundle tag (recommended):

```
github:easyhaloo/afk-skills-dsh#v2.0.0
```

or float: `github:easyhaloo/afk-skills-dsh#semver:^2.0.0`

## Configuration

Set in `cordis.patch.yml` (profile-wide) or per machine via env —
patch config wins over env:

| Field | Env | Default |
|---|---|---|
| `repo` | `AFK_SKILLS_REPO` | `https://github.com/easyhaloo/afk.git` |
| `ref` | `AFK_SKILLS_REF` | `main` |
| `cacheDir` | `AFK_SKILLS_CACHE_DIR` | `~/.dsh/afk-skills-cache` |
| `refreshIntervalMs` | `AFK_SKILLS_REFRESH_MS` | `900000`（15 分钟，最小 60000） |

Pin a stable skill set by pointing `ref` at a tag (e.g. `cli-v0.2.44`) or a
branch. Requirements: `git` on PATH; network for the first clone.

## Versioning of this bundle

Bundle versions (v2.x) track the *loader* only — refresh logic and config.
Skill content is versioned in `easyhaloo/afk` itself; there is nothing to
release here for skill-only changes.

## Source of truth

All skill content lives in
[easyhaloo/afk](https://github.com/easyhaloo/afk) (`skills/` directory).
Never edit skills anywhere else.
