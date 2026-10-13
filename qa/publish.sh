#!/usr/bin/env bash
# Publish sanitized QA results to the dedicated qa-results branch.
# NEVER the default branch. Runs only after qa/scan.mjs exits 0.
set -euo pipefail

BRANCH="qa-results"
RETENTION="${QA_RETENTION:-14}"          # max run directories kept
STAMP="${QA_STAMP:?QA_STAMP required}"    # deterministic: run id + attempt
WORK="$(mktemp -d)"

node qa/scan.mjs   # fail-closed secret/PII gate; publish aborts on any finding

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Orphan working tree: branch history is rewritten to a single commit every run,
# so qa-results history can never grow unbounded.
git fetch origin "$BRANCH" --depth=1 || true
mkdir -p "$WORK/runs"
if git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
  git archive "origin/$BRANCH" | tar -x -C "$WORK" || true
fi

DEST="$WORK/runs/$STAMP"
rm -rf "$DEST"; mkdir -p "$DEST"
cp qa-output/results.json "$DEST/results.json"
if [ -d qa-output/screenshots ]; then
  mkdir -p "$DEST/screenshots"
  cp qa-output/screenshots/*.png "$DEST/screenshots/" 2>/dev/null || true
fi

# Retention: keep only the newest $RETENTION run directories.
( cd "$WORK/runs" && ls -1 | sort | head -n -"$RETENTION" | while read -r old; do rm -rf -- "$old"; done )

printf '# Circle sanitized QA results\n\nMachine-published. Latest run: %s\nRetention: newest %s runs.\n' "$STAMP" "$RETENTION" > "$WORK/README.md"

git -C "$WORK" init -q -b "$BRANCH"
git -C "$WORK" config user.name "github-actions[bot]"
git -C "$WORK" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "$WORK" add -A
git -C "$WORK" commit -q -m "[skip ci] sanitized public QA results $STAMP"
git -C "$WORK" push --force "https://x-access-token:${GITHUB_TOKEN:?}@github.com/${GITHUB_REPOSITORY:?}.git" "$BRANCH"
echo "published $STAMP to $BRANCH"
