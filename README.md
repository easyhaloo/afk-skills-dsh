# afk-skills-dsh

[AFK skill suite](https://github.com/easyhaloo/afk) as a
[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)
plugin bundle — installed from GitHub, **referencing** the AFK repo at
runtime. No skill snapshot is stored here.

## How it works

On activation the bundle maintains a shallow git clone of `easyhaloo/afk` in
`~/.dsh/afk-skills-cache/current` (created on first use, refreshed on
activation and every 15 minutes by default, checked out to the version
selected by `ref`) and mounts an isolated `skill-filesystem` provider
scanning the clone's `skills/` directory. Skill edits land in the AFK repo;
every user picks them up on the next cache refresh — no bundle release
required.

While the cache is being cloned (first run / offline without cache), the
skill root is absent and DSH's missing-root probing keeps polling; skills
appear automatically once the clone lands. A cached clone keeps working
offline; refresh failures are non-fatal warnings.

## Versioning & rollback — aligned with Claude Code plugin versioning

The skill-set version space **is** the AFK repo's Claude plugin version
(`.claude-plugin/plugin.json`, bumped in the same commit as every skill
change per that repo's AGENTS.md). `plugin-v<version>` tags on
`easyhaloo/afk` anchor each released skill set.

| 操作 | 做法 |
|---|---|
| 跟随最新插件版本（默认） | `ref: latest` —— 每次刷新解析远端最高 `plugin-v*` tag 并 checkout |
| 冻结在某个插件版本 | `ref: plugin-v1.2.2` |
| **回滚** | 把 `ref` 改回上一个 `plugin-v` tag，等下个刷新周期或重启会话 |
| 无 plugin tag 时的过渡 | 自动回退 `fallbackRef`（默认 `main`）并告警 |

版本切换是同一缓存目录（`~/.dsh/afk-skills-cache/current`）内的 in-place
checkout，挂载路径恒定，watcher 把版本切换当普通文件变更感知，无需重启。

Rollback is a one-value config change (`patch config` for profile-wide, or
`AFK_SKILLS_REF` for machine-level). Only tags and branches can be pinned
(raw SHAs are not supported by the shallow clone path).

Cutting a version tag on the AFK repo (the release act; once tags exist the
loader auto-follows them):

```bash
git -C ~/llm/afk tag plugin-v1.2.2 && git -C ~/llm/afk push origin plugin-v1.2.2
```

A `release-plugin.yml` workflow (proposed upstream) automates this: on every
push to `main` it tags `plugin-v<plugin.json version>` when the tag does not
exist yet.

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
| `ref` | `AFK_SKILLS_REF` | `latest`（跟随最高 `plugin-v*` tag） |
| `fallbackRef` | `AFK_SKILLS_FALLBACK_REF` | `main`（尚无 plugin tag 时回退） |
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
