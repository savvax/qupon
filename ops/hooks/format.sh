#!/usr/bin/env bash
# Claude Code PostToolUse hook (Edit|Write): format the touched file. Never fails the tool call.
f=$(jq -r '.tool_input.file_path // empty'); [ -n "$f" ] || exit 0
case "$f" in
  *.rs) command -v rustfmt >/dev/null && rustfmt --edition 2021 "$f" 2>/dev/null;;
  *.go) command -v gofmt >/dev/null && gofmt -w "$f" 2>/dev/null;;
  *.ts|*.tsx|*.json|*.md) [ -x node_modules/.bin/prettier ] && node_modules/.bin/prettier --write "$f" >/dev/null 2>&1;;
esac
exit 0
