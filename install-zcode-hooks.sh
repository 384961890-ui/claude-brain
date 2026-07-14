#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BRAIN_DIR=${CLAUDE_BRAIN_DIR:-"$HOME/.claude-brain"}

for relative in \
  scripts/inject-context.js \
  scripts/track-behavior.js \
  scripts/capture-lesson.js \
  scripts/update-state.js \
  v2/scripts/stop-audit.js \
  v2/scripts/finish-the-work.js \
  v3/scripts/think-detect.js \
  zcode-shim/record-prompt.js \
  zcode-shim/zcode-hook-router.js
do
  if [ ! -f "$ROOT/$relative" ]; then
    printf 'Missing package file: %s\n' "$ROOT/$relative" >&2
    exit 1
  fi
done

mkdir -p "$BRAIN_DIR/scripts" "$BRAIN_DIR/zcode-shim"
cp "$ROOT/scripts/inject-context.js" "$BRAIN_DIR/scripts/inject-context.js"
cp "$ROOT/zcode-shim/record-prompt.js" "$BRAIN_DIR/zcode-shim/record-prompt.js"
cp "$ROOT/zcode-shim/zcode-hook-router.js" "$BRAIN_DIR/zcode-shim/zcode-hook-router.js"
chmod +x "$BRAIN_DIR/scripts/inject-context.js" \
  "$BRAIN_DIR/zcode-shim/record-prompt.js" \
  "$BRAIN_DIR/zcode-shim/zcode-hook-router.js"

CLAUDE_BRAIN_DIR="$BRAIN_DIR" node "$ROOT/install-zcode-hooks.js"
