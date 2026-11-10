# afk-skills-dsh

[AFK skill suite](https://github.com/easyhaloo/afk) as a
[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)
plugin bundle — installed from GitHub, **referencing** the AFK repo at
runtime. No skill snapshot is stored here.

## How it works

On activation the bundle maintains a shallow git clone of `easyhaloo/afk` in
`~/.dsh/afk-skills-cache/<ref>` (one cache bucket per ref; created on first
use, refreshed on activation and every 15 minutes by default) and mounts an
isolated `skill-filesystem` provider scanning the clone's `skills/`
directory. Skill edits land in the AFK repo; every user picks them up on the
next cache refresh — no bundle release required.

While the cache is being cloned (first run / offline without cache), the
skill root is absent and DSH's missing-root probing keeps polling; skills
appear automatically once the clone lands. A cached clone keeps working
offline; refresh failures are non-fatal warnings.

## Versioning & rollback

The AFK repo's git tags **are** the skill versions — its convention bumps
`.claude-plugin/plugin.json` on every skill change, so a tag pins an exact,
reviewable skill set.

| 操作 | 做法 |
|---|---|
| 冻结在某个版本 | `ref: cli-v0.2.44`（tag） |
| 回滚 | 把 `ref` 改回上一个 tag，等下一个刷新周期或重启会话 |
| 回到最新 | `ref: main` |

Rollback is a one-value config change (`patch config` for profile-wide, or
`AFK_SKILLS_REF` for machine-level). Cache buckets are per-ref, so switching
to a previously used ref re-checks-out from the local cache — no re-clone.
Only tags and branches can be pinned (raw SHAs are not supported by the
shallow clone path).

Cutting a version tag on the AFK repo (the release act):

```bash
git -C ~/llm/afk tag skills-v1.2.3 && git -C ~/llm/afk push origin skills-v1.2.3
```

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
