#!/usr/bin/env bash
# PreToolUse(Bash) hook — route hand-probing of the Data Installer API to the
# drift checker.
#
# Why: on 2026-08-12 this session hand-curled the Data Installer to answer a
# "blocking spike", read a stage database as a specification, and turned five junk
# rows into a documented contract — three file edits, two commits and a long letter
# to another team, for a conclusion that was already the safe default.
#
# The instruction to prevent it ALREADY EXISTED. `overview.md`'s contract section
# is titled "The verified contract — do NOT re-derive this", it was read at the
# start of that session, and it lost anyway: the same file also called the spike a
# blocker, and the more specific instruction won. Prose cannot defend against that.
# A hook does not care what you concluded.
#
# Not a block: Stage 2 legitimately needs one-off probes against write endpoints
# that the checker deliberately excludes. This interrupts the reflex once, names
# the tool, and lets you proceed if you have a real reason.
#
# Fires AT MOST ONCE per session.
#
# Contract: reads the tool-call JSON on stdin; exit 2 blocks and shows stderr to
# Claude; exit 0 proceeds.

payload=$(cat)

read -r cmd session <<<"$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    o = json.load(sys.stdin)
except Exception:
    print("  "); raise SystemExit
cmd = (o.get("tool_input", {}) or {}).get("command", "") or "-"
# One line, no spaces — the caller reads two whitespace-separated fields.
print(cmd.replace("\n", " ").replace(" ", "\x1f") or "-", o.get("session_id", "") or "nosession")
' 2>/dev/null)"

[ -z "$cmd" ] || [ "$cmd" = "-" ] && exit 0
cmd=$(printf '%s' "$cmd" | tr '\037' ' ')

# Only an HTTP client aimed at the Data Installer. `datainstallerapi` is the
# service's Runtime namespace; `data-installer-api` its path segment. Running the
# checker itself must never trip this.
case "$cmd" in
    *dataInstallerDrift*|*data-installer:drift*) exit 0 ;;
esac
case "$cmd" in
    *curl*|*wget*|*httpie*) ;;
    *) exit 0 ;;
esac
# Match the ACTION, not just the host. The host is usually in a shell variable
# (`curl "$BASE/get-installed-datapacks"`) — which is exactly how the 2026-08-12
# probe was written, and a host-only match sailed straight past it. Every action
# this API exposes contains "datapack" bar one.
#
# Known gap: `curl "$BASE/logs"` alone matches nothing here. Widening to `logs`
# would fire on half the shell commands in this repo, which is how a hook gets
# disabled. Partial coverage that stays trusted beats total coverage that gets
# switched off.
case "$cmd" in
    *datapack*|*data-installer*|*datainstallerapi*) ;;
    *) exit 0 ;;
esac

marker="${TMPDIR:-/tmp}/.dbv-di-probe-${session}"
[ -f "$marker" ] && exit 0
touch "$marker" 2>/dev/null

cat >&2 <<'MSG'
You are about to hand-probe the Data Installer API.

If the question is "does the live service still match what we recorded?", the
answer is `npm run data-installer:drift`. It checks six read endpoints against the
committed fixtures, reports what moved, and — unlike a hand-rolled curl — treats a
404/401/unparseable body as a FAILURE rather than printing something that reads
like a clean result.

If the question is anything else, read `docs/systems/data-installer.md` first. The
contract is already recorded there and in `dataInstallerParsers.ts`, which is the
only module allowed to see a wire shape.

Two things that a hand probe has repeatedly got wrong here:
  - Stage data is NOT a specification. Junk rows in a stage database say what has
    been written, not what is allowed.
  - Runtime routes on the LAST path segment, so a guessed action name returns a
    bare 404 that parses as an empty result.

Proceed if you have a reason the checker cannot serve — Stage 2's write endpoints
are deliberately outside it. This fires only once per session.
MSG
exit 2
