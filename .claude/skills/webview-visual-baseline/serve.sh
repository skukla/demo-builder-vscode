#!/usr/bin/env bash
#
# Stage the harness and serve it on a port PROVEN to be ours.
#
# WHY THIS EXISTS. The staging was six copy commands and a `python3 -m
# http.server 8899` in SKILL.md, and the port was the problem. `8899` binds fine
# on this machine while `host.docker.internal:8899` — what the containerised
# browser actually reaches — is answered by an unrelated app. The bind succeeds,
# the server logs nothing, and every fetch the browser makes returns someone
# else's 404. That is indistinguishable from a broken instrument: on 2026-09-08
# it read as "the theme switch is inert", and it is the most likely explanation
# for the 2026-09-09 note claiming `CSS.forcePseudoState` does not work through
# the Playwright MCP session. Forcing works; the harness was never reached.
#
# A LOCAL BIND CHECK CANNOT SEE THIS. `lsof -i :8899` is clean, because the
# collision is inside the container's network namespace, not this one. Only a
# fetch from the browser can tell the two apart — which is why the sentinel is
# now enforced by capture.js and capture-interactions.js rather than remembered.
#
# Usage:
#   eval "$(.claude/skills/webview-visual-baseline/serve.sh)"   # sets VR_BASE, VR_SENTINEL
#   .claude/skills/webview-visual-baseline/serve.sh --restage   # rebuild bundles into a running server
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
STAGE="${VR_STAGE:-/tmp/vr}"
SKILL="$ROOT/.claude/skills/webview-visual-baseline"

stage() {
    mkdir -p "$STAGE"
    cp "$ROOT"/dist/webview/*-bundle.js "$STAGE"/
    cp "$ROOT"/src/core/ui/styles/reset.css "$ROOT"/src/core/ui/styles/tokens.css "$STAGE"/
    cp "$SKILL"/harness.html "$STAGE"/h.html
    cp "$SKILL"/capture.js "$SKILL"/capture-interactions.js "$STAGE"/ 2>/dev/null || true
    [ -f "$ROOT/node_modules/axe-core/axe.min.js" ] && cp "$ROOT/node_modules/axe-core/axe.min.js" "$STAGE"/
    node "$SKILL/build-fixtures.mjs" "$STAGE" >/dev/null
}

if [ "${1:-}" = "--restage" ]; then
    # Re-copy bundles under a RUNNING server, for the after-half of a comparison.
    # The sentinel is deliberately left alone: it identifies the server, not the
    # build, and rewriting it would invalidate the captures already taken.
    stage
    echo "restaged $(ls "$STAGE"/*-bundle.js | wc -l | tr -d ' ') bundles into $STAGE" >&2
    exit 0
fi

[ -d "$ROOT/dist/webview" ] || { echo "no dist/webview — run 'npm run compile' first" >&2; exit 1; }

stage
SENTINEL="VR-SENTINEL-$(date +%s)-$RANDOM"
echo "$SENTINEL" > "$STAGE/sentinel.txt"

# A RANDOM high port, not a fixed one. The collision above is invisible from
# here, so the defence is to make it unlikely and then prove it did not happen.
# If the sentinel check in the capture still fails, re-run this: a new port is
# one command, and diagnosing someone else's container app is not.
for _ in $(seq 1 40); do
    PORT=$(( 20000 + RANDOM % 20000 ))
    if ! nc -z 127.0.0.1 "$PORT" 2>/dev/null; then break; fi
done

( cd "$STAGE" && exec python3 -m http.server "$PORT" >/dev/null 2>&1 ) &
SERVER_PID=$!

for _ in $(seq 1 50); do
    if nc -z 127.0.0.1 "$PORT" 2>/dev/null; then break; fi
    sleep 0.1
done
nc -z 127.0.0.1 "$PORT" 2>/dev/null || { echo "server never came up on $PORT" >&2; exit 1; }

# Confirms the LOCAL half only. The browser-side half is the sentinel, enforced
# inside the capture functions.
LOCAL=$(curl -fsS "http://127.0.0.1:$PORT/sentinel.txt" | tr -d '[:space:]')
[ "$LOCAL" = "$SENTINEL" ] || { echo "local fetch returned '$LOCAL', expected '$SENTINEL'" >&2; exit 1; }

cat <<EOF
export VR_BASE='http://host.docker.internal:$PORT'
export VR_SENTINEL='$SENTINEL'
export VR_PID='$SERVER_PID'
export VR_STAGE='$STAGE'
EOF
echo "harness on $PORT, pid $SERVER_PID, sentinel $SENTINEL" >&2
