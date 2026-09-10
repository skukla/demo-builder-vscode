#!/bin/bash
# Proves 50-adobe-docs.rule intercepts a documentation lookup and stays out of
# everything else.
#
# THIS RULE IS THE ONE THAT MATCHES ON TOOL NAME, so its whole surface is a list of
# tool names — and a list is exactly the thing that goes stale silently when a tool
# is renamed or a new doc source is added. Every arm is exercised here, because an
# arm nobody exercises is indistinguishable from an arm that cannot match.
#
# THE PRE-FILTER IS HALF THE RULE. `router.sh` runs a cheap substring gate before
# any rule is sourced, and a tool name that no token admits never reaches the
# matcher. `*mcp__*`, `*WebFetch*` and `*WebSearch*` are what admit these payloads;
# rule 20 shipped an arm that was unreachable for weeks for exactly this reason.
#
# ATTRIBUTES BY MESSAGE, not by exit code — twelve rules share one router.
cd "$(git rev-parse --show-toplevel)" || exit 1

fired_rule() {
  case "$1" in
    *"about to look something up"*)         echo adobe-docs ;;
    *"creating a NEW UI component"*)        echo reuse-first ;;
    *"React+Spectrum webview test"*)        echo webview-test ;;
    *"already in this directory"*|*"curated"*) echo registry-dir ;;
    "")                                     echo - ;;
    *)                                      echo other ;;
  esac
}

run() {
  local tool="$1" label="$2" expect="$3"
  local payload out got verdict
  payload=$(T="$tool" S="docs-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"query":"how does app builder state work"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-12s got=%-12s %s\n' "$label" "$expect" "$got" "$verdict"
}

echo "=== every arm of the tool list fires ==="
run WebSearch                                        "WebSearch"                        adobe-docs
run WebFetch                                         "WebFetch"                         adobe-docs
run mcp__adobe-exl__search_experience_league         "adobe-exl search"                 adobe-docs
run mcp__adobe-exl__fetch_article_content            "adobe-exl fetch (prefix arm)"     adobe-docs
run mcp__fluffyjaws__full_documentation_search       "fluffyjaws *documentation_search" adobe-docs
run mcp__helix-mcp-server__aem-docs-search           "helix aem-docs-search"            adobe-docs
run mcp__MCP_DOCKER__fetch                           "MCP_DOCKER fetch"                 adobe-docs
run mcp__MCP_DOCKER__resolve-library-id              "context7 resolve"                 adobe-docs
run mcp__MCP_DOCKER__get-library-docs                "context7 get-docs"                adobe-docs
run mcp__MCP_DOCKER__perplexity_ask                  "perplexity (prefix arm)"          adobe-docs
run mcp__MCP_DOCKER__perplexity_research             "perplexity research"              adobe-docs

echo
echo "=== a lookup-shaped name that is NOT a doc source stays silent ==="
run mcp__fluffyjaws__jira_search                     "jira search — not documentation"  -
run mcp__fluffyjaws__slack_search                    "slack search — not documentation" -
run mcp__MCP_DOCKER__browser_navigate                "a browser tool"                   -
run Bash                                             "Bash"                             -
run Read                                             "Read"                             -

echo
echo "=== the message must NAME the trap it exists for ==="
payload=$(S="docs-msg-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":"WebSearch","tool_input":{"query":"x"},"session_id":os.environ["S"]}))')
msg=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
# The whole reason this rule exists: App Builder concepts live on developer.adobe.com,
# which neither adobe-exl nor fluffyjaws indexes. A message that lost that sentence
# is a nudge with no content.
if printf '%s' "$msg" | grep -q 'adobe-docs-lookup' && printf '%s' "$msg" | grep -q 'developer.adobe.com'; then
  printf '%-58s expect=%-12s got=%-12s %s\n' "names the skill AND the corpus trap" named named OK
else
  printf '%-58s expect=%-12s got=%-12s %s\n' "names the skill AND the corpus trap" named empty '*** WRONG ***'
fi
