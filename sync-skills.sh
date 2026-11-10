#!/usr/bin/env bash
# Sync skills from the AFK source repo into this bundle package.
# Usage: ./sync-skills.sh [source-skills-dir]
#   source default: ~/llm/afk/skills
# Only directories containing a SKILL.md are synced (flat README/GUIDE files
# would be discovered as bogus skills by the one-level scanner).
set -euo pipefail

SRC="${1:-$HOME/llm/afk/skills}"
DST="$(cd "$(dirname "$0")" && pwd)/skills"

[ -d "$SRC" ] || { echo "source skills dir not found: $SRC" >&2; exit 1; }
mkdir -p "$DST"

# remove previous skill dirs (keep nothing stale)
find "$DST" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +

count=0
for d in "$SRC"/*/; do
  name="$(basename "$d")"
  [ -f "$d/SKILL.md" ] || continue
  cp -R "$d" "$DST/$name"
  count=$((count + 1))
done

echo "synced $count skills from $SRC -> $DST"
