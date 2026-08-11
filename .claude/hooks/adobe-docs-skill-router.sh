#!/usr/bin/env bash
# PreToolUse hook — route documentation lookups to the `adobe-docs-lookup` skill.
#
# Why: the five doc sources cover DIFFERENT corpora, and picking wrong does not
# fail loudly. On 2026-08-04 a search for `aio app undeploy` returned Commerce
# deployment best-practices, AEM namespace priority, and a 2020 community thread
# — all confident, all off-target. The authoritative page was on
# developer.adobe.com, which NO doc MCP indexes; the right tool was a plain fetch.
#
# Same reasoning as reuse-first-router.sh: routing that depends on remembering to
# look is not routing. A skill description cannot help here, because at the moment
# you reach for a doc tool you have already chosen the source — the choice IS the
# thing that needs routing, and nothing names the skill at that moment.
#
# Fires AT MOST ONCE per session, on the first doc-lookup tool call of any kind.
# One landing loads the routing table for the rest of the session.
#
# Contract: reads the tool-call JSON on stdin; exit 2 blocks and shows stderr to
# Claude; exit 0 proceeds.

payload=$(cat)

read -r tool session <<<"$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    o = json.load(sys.stdin)
except Exception:
    print("- nosession"); raise SystemExit
print(o.get("tool_name", "") or "-", o.get("session_id", "") or "nosession")
' 2>/dev/null)"

[ -z "$tool" ] || [ "$tool" = "-" ] && exit 0

# Every route in the map. Firing on all of them (not just the Adobe-specific ones)
# is deliberate: reaching for Perplexity or a raw fetch when a doc server had the
# answer is the same routing mistake in the other direction.
case "$tool" in
    mcp__adobe-exl__*) ;;
    mcp__fluffyjaws__*documentation_search) ;;
    mcp__helix-mcp-server__aem-docs-search) ;;
    mcp__MCP_DOCKER__fetch) ;;
    mcp__MCP_DOCKER__resolve-library-id|mcp__MCP_DOCKER__get-library-docs) ;;
    mcp__MCP_DOCKER__perplexity_*) ;;
    WebFetch|WebSearch) ;;
    *) exit 0 ;;
esac

marker="${TMPDIR:-/tmp}/.dbv-adobe-docs-${session}"
[ -f "$marker" ] && exit 0
touch "$marker" 2>/dev/null

cat >&2 <<'MSG'
You are about to look something up. Invoke the `adobe-docs-lookup` skill (Skill
tool, skill: "adobe-docs-lookup") first, then retry this call.

The five doc sources cover DIFFERENT corpora and choosing wrong returns confident,
plausible, off-target results rather than an error. In particular: App Builder
concept docs live on developer.adobe.com, which NEITHER adobe-exl NOR fluffyjaws
indexes — searching them for App Builder behaviour returns whichever PRODUCT
happens to mention it.

The skill carries the corpus→source table, the URL shapes that work, the
already-established facts (so you do not re-fetch them), and what to do when a
source returns -32002 or 401. This hook fires only once per session.
MSG
exit 2
