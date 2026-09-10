#!/usr/bin/env bash
# PreToolUse dispatcher — one process, N rules.
#
# Five hooks had accumulated the same twelve lines of scaffolding: read the
# payload, parse it with python3, match a pattern, drop a session marker, print a
# message, exit 2. `reuse-first-router` and `webview-test-skill-router` were
# character-identical apart from a `case` pattern, a marker name and the message.
# Bash carried two separate entries, so every Bash call spawned two processes and
# parsed the same JSON twice.
#
# Rules now live in `rules/*.rule` and declare only what differs. Adding a guard
# is dropping a file — no settings.json edit, no extra process.
#
# Contract (unchanged): reads the tool-call JSON on stdin; exit 2 blocks the call
# and shows stderr to Claude; exit 0 proceeds.
#
# FAIL OPEN everywhere. This runs before every matched tool call, so a bug here
# reaches every guard at once — which is why `tests/hooks/router.test.ts` exists
# and why every unexpected condition exits 0.

payload=$(cat)
[ -z "$payload" ] && exit 0

# Cheap pre-filter. Nearly every tool call matches no rule, and python3 startup is
# ~55ms — worth avoiding when a substring test costs nothing. Every token below
# MUST appear in the payload of anything a rule can fire on; adding a rule that
# needs a new token means adding it here too.
case "$payload" in
    *jest*|*curl*|*wget*|*httpie*|*.tsx*|*mcp__*|*WebFetch*|*WebSearch*) ;;
    # 20-secret-files. `.env` admits the path guard; the rest are NECESSARY
    # substrings of each content pattern the rule can block on.
    *.env*|*"PRIVATE KEY"*|*ghp_*|*ghs_*|*github_pat_*|*AKIA*|*xox*|*mongodb*) ;;
    # Rule 20's OpenAI/Anthropic arm. It was UNREACHABLE from the day it was written
    # until 2026-09-08: the rule matches sk-(proj|ant)- and no token here admitted it,
    # so a write carrying that shape exited 0 at this gate and the pattern had never
    # once run. Found by writing the rule's proof, which is the argument for proofs.
    # Both spellings, because the alternation in the rule is the necessary condition.
    *sk-proj-*|*sk-ant-*) ;;
    # `npm test` / `npm run test:*` start jest without the string "jest" anywhere
    # in the command, so 15-jest-concurrent would never see them. Matched on the
    # two-word literal rather than a bare *test* — that would drag in every path
    # with "test" in it, which is most of this repo.
    *"npm test"*|*"npm run test"*) ;;
    # 14-commit-backtick. NECESSARY condition for that rule: it only fires on a
    # git commit. Without this token the rule would never run and would look
    # exactly like a guard that simply never matches — the failure this
    # pre-filter has already caused once (see the --exclude note below).
    *"git commit"*) ;;
    # 32-test-authoring, 33-new-instrument, 34-css-baseline (added 2026-09-10).
    # NECESSARY conditions for each, and the reason these rules exist at all: none
    # of these tokens was admitted before, so a Write to a `.test.ts`, a new script
    # or a stylesheet exited HERE and no rule could ever have seen it. That gate is
    # why a test-file splitter was invented while the splitting playbook sat unread.
    #
    # `.test.ts` also covers `.test.tsx` (substring), which rule 40 already claims —
    # the rules sort it out, the gate only has to let it through.
    *.test.ts*|*.testUtils.ts*) ;;
    *.mjs*|*/scripts/*) ;;
    *.css*) ;;
    # 35-wizard-step, 36-ai-bundle, 37-mcp-tool (added 2026-09-10). NECESSARY
    # conditions for each — every one is a literal from the rule's own matcher, so
    # the gate cannot hide a real hit. Kept this narrow deliberately: a bare *.ts*
    # would admit most of the repo and make the pre-filter pointless.
    *wizard-steps.json*|*buildYourProjectAreas*|*commerceSections*) ;;
    *aiBundle*|*RegenerateAiFiles*) ;;
    *Descriptors.ts*|*mcp-server.ts*) ;;
    # 21-push-no-verify. NECESSARY: the rule only fires on a push.
    *"git push"*) ;;
    # 38/39/41/42/43/44 (added 2026-09-10). The four directory tokens are the kinds
    # 41-god-file has a limit for, and they also admit 42/43/44, whose files all sit
    # under services/. Broad on purpose: correctness before the ~55ms python parse
    # this gate exists to avoid, and 41 has to measure a file before it can judge it.
    */services/*|*/handlers/*|*/ui/components/*|*/utils/*|*/helpers/*) ;;
    *messages.ts*|*app-builder-components.json*) ;;
    # Two files the directory tokens above do NOT reach, each found by its rule's
    # own proof rather than by review: `src/types/handlers.ts` has no `/handlers/`
    # segment, and `core/shell/orgContextEnv.ts` is not under `/services/`. Both
    # rules matched them and both were gated out — the fourth and fifth instance of
    # the failure this pre-filter's docblock describes.
    *handlers.ts*|*orgContextEnv*) ;;
    # 12-unquoted-glob. Each of these is a NECESSARY condition for that rule to
    # fire, so the gate cannot hide a real hit. Kept as the specific flag spellings
    # rather than a bare `*"*"*` (an asterisk appears in most payloads) — this stays
    # cheap while still admitting everything the rule can match.
    # `--exclude` without the `=` on purpose: `--exclude-dir=` does NOT contain
    # `--exclude=`, so gating on the latter silently dropped every exclude-dir
    # call. Caught by a test; it looked exactly like a rule that simply never
    # matched.
    *"--include="*|*"--exclude"*|*"-name "*|*"-iname "*|*"-path "*|*"-ipath "*) ;;
    # 16-unsplit-var. The rule requires a variable assigned from a command
    # substitution, so `=$(` is a NECESSARY condition and the gate cannot hide a
    # real hit. Both spellings, because `F="$(ls)"` is as common as `F=$(ls)`.
    #
    # This rule's proof script failed 3 of its 4 blocking cases before this line
    # existed, and the one that "passed" did so by ACCIDENT — its payload happened
    # to contain `-name "x"`, a token rule 12 had already registered. Exactly the
    # failure the note above predicts: a rule that is never reached is
    # indistinguishable from a rule that never matches.
    #
    # SINGLE quotes, both. Written as *"=$("* first, which bash parses as the
    # START of a command substitution inside the double quotes — the router
    # stopped parsing and EVERY Bash, Edit and Write call in the session failed
    # with "unexpected EOF". A broken router fails CLOSED against its own stated
    # contract, and it gates the very tools needed to edit it back.
    # The THIRD spelling is the JSON-escaped one. This gate reads the raw payload,
    # where a command containing F="$(ls)" arrives as F=\"$(ls)\" — so the plain
    # ="$( never appears and that case silently never reached the rule.
    #
    # `; do` admits the LOOP form, which carries no command substitution at all and
    # so matched none of the tokens above. That gap made this rule's own proof PASS
    # a case it must block — the third time a rule has been silently unreachable at
    # this gate. `tests/hooks/rule-proofs.test.ts` now runs every proof on each
    # build, which turns a recurring surprise into a red test.
    *'=$('*|*'="$('*|*'=\"$('*|*'; do'*) ;;
    # 13-piped-exit-code. The rule requires a pipe INTO head/tail/wc, so the pipe
    # must be part of the token — a bare *head* would admit every path containing
    # the word. Both spacings, because `|wc` and `| wc` are equally common.
    *"| head"*|*"|head"*|*"| tail"*|*"|tail"*|*"| wc"*|*"|wc"*) ;;
    # Same rule, its `grep -c` arm (added 2026-09-01). `grep -c` is a NECESSARY
    # substring of every shape that arm matches, and it covers clusters like
    # `grep -cE` too. `--count` spelled separately.
    #
    # THIRD time in one session that a rule was written, proved against its own
    # harness, and found dead at this gate. Note what makes this one different and
    # worse: rule 13 ALREADY had a passing probe in router.test.ts (the `| wc`
    # case), so the reachability test stayed green while a whole new arm of the
    # same rule was unreachable. That test proves one payload per RULE reaches it;
    # it cannot prove every SHAPE does. The .proof.sh files are what cover that,
    # which is the argument for running them rather than trusting them.
    *"grep -c"*|*"grep --count"*) ;;
    # 31-registry-dir. The rule fires on a Write whose path is under tests/sop/ or
    # tests/helpers/ — plain .ts files, which the *.tsx* token above does NOT admit
    # (".tsx" is not a substring of ".ts"). Without this line the rule would be the
    # FOURTH written, proved, and found dead at this gate. The directory names are
    # necessary conditions for it, so the gate cannot hide a real hit.
    *tests/sop/*|*tests/helpers/*) ;;
    *) exit 0 ;;
esac

# Parse ONCE for all rules. \x1f (unit separator) delimits; it cannot appear in a
# real command or path, and any that did is stripped.
fields=$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    o = json.load(sys.stdin)
except Exception:
    raise SystemExit
ti = o.get("tool_input") or {}
def g(v):
    return (v or "").replace("\x1f", " ").replace("\n", " ")
print("\x1f".join([
    g(o.get("tool_name")),
    g(ti.get("command")),
    g(ti.get("file_path")),
    g(ti.get("content")) or g(ti.get("new_string")),
    g(o.get("session_id")) or "nosession",
]))
' 2>/dev/null) || exit 0
[ -z "$fields" ] && exit 0

IFS=$'\037' read -r TOOL CMD FILE CONTENT SESSION <<<"$fields"
[ -n "$SESSION" ] || SESSION=nosession

RULES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rules"
[ -d "$RULES_DIR" ] || exit 0

for rule in "$RULES_DIR"/*.rule; do
    [ -f "$rule" ] || continue

    # Each rule redefines these; clear them so a malformed rule cannot inherit
    # the previous one's matcher and fire on its behalf.
    unset -f rule_match rule_message 2>/dev/null
    rule_id=""
    rule_once=1

    # shellcheck disable=SC1090
    . "$rule" 2>/dev/null || continue
    [ -n "$rule_id" ] || continue
    declare -f rule_match >/dev/null 2>&1 || continue
    declare -f rule_message >/dev/null 2>&1 || continue

    rule_match "$TOOL" "$CMD" "$FILE" "$CONTENT" || continue

    if [ "$rule_once" = "1" ]; then
        marker="${TMPDIR:-/tmp}/.dbv-${rule_id}-${SESSION}"
        # Already spent this session — fall through to the remaining rules rather
        # than returning, so one rule's marker cannot suppress another's.
        [ -f "$marker" ] && continue
        touch "$marker" 2>/dev/null
    fi

    rule_message >&2
    exit 2
done

exit 0
