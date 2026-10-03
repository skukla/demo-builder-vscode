#!/usr/bin/env bash
# AI-surface coverage scan: which extension features can an AGENT reach?
#
# The extension's feature spine is its handler maps — every webview button
# dispatches into one, and MCP descriptors dispatch into the SAME maps. So
# coverage is computable: a handler type an agent cannot reach is a feature the
# AI surface does not have.
#
# Handler keys come from `handler-keys.mjs`, NOT from a regex over the map body.
# This script used to run its own inline regex that matched any indented
# `key:` inside the brace-matched block, so nested option objects and returned
# literals counted as handlers: `importHandlers` reported ~30 keys — `context`,
# `success`, `data`, `begin`, `code` — where the map has 7. That inflation is
# the exact failure `handler-keys.mjs` was written to fix, and it shipped
# alongside the broken regex without ever being wired in (found 2026-08-24).
# Every figure taken before that date is inflated; re-measure before citing.
#
# The count is TRIAGED (AI-1r): `triage.json` beside this script says which
# uncovered handlers are reachable under another tool name, which an agent has
# no business calling, and which were read and judged a real gap. `coverage.py`
# applies it, checks every row is still true, and reports what nobody has read.
#
# Usage: bash .claude/skills/ai-coverage-scan/scan.sh [--list]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Fail loudly if the extractor itself is broken — a scan built on a broken
# extractor reports a clean-looking number.
node .claude/skills/ai-coverage-scan/handler-keys.mjs --self-test >/dev/null
python3 .claude/skills/ai-coverage-scan/coverage.py --self-test >/dev/null

# file<TAB>key for every top-level handler-map key in the repo.
node .claude/skills/ai-coverage-scan/handler-keys.mjs \
    $(find src -path '*/handlers/*.ts' -not -name '*.test.ts' | sort) \
    > /tmp/ai-coverage-keys.tsv

python3 .claude/skills/ai-coverage-scan/coverage.py /tmp/ai-coverage-keys.tsv "${1:-}"
