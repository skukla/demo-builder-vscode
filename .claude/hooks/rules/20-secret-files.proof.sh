#!/bin/bash
# Proves 20-secret-files.rule blocks every shape it claims to, and stays quiet on
# the safe ones.
#
# This is the rule guarding the repo's least reversible property: the tree is
# PUBLIC, and a secret that lands in history costs a rotation plus a rewrite.
# It shipped without a harness, so nothing pinned its match shapes, and a
# blocking rule whose patterns nothing checks is indistinguishable from a rule
# that never fires — because nothing bad has happened yet either way.
#
# IT FOUND A LIVE HOLE ON ITS FIRST RUN, 2026-09-08. The rule matches
# sk-(proj|ant)-, and the router's pre-filter admitted no such token, so that arm
# had NEVER RUN since the day it was written. An OpenAI or Anthropic key pasted
# into a source file would have been written without a word. Fixed in the same
# change; the two cases below are what stop it coming back.
#
# NO CREDENTIAL-SHAPED LITERAL APPEARS IN THIS FILE. Every shape is assembled at
# run time from fragments, the same technique `tests/helpers/jwtFake.ts` uses and
# `tests/sop/no-credential-shaped-fixtures.test.ts` requires: GitGuardian matches
# the SHAPE, not the secret, and it has already raised alerts here on strings
# that were provably inert. An alert somebody has to triage by hand teaches people
# to dismiss alerts, so the bar is never-enters rather than nothing-to-rotate.
cd "$(git rev-parse --show-toplevel)" || exit 1
REPO=$PWD

# `rep A 36` -> AAAA… (36 chars). Length matters: every token pattern in the rule
# carries a minimum, and a short lookalike must NOT block.
rep() { printf "%${2}s" '' | tr ' ' "$1"; }

# Fragments, deliberately split so the joined shape exists only in memory.
GHP="gh""p_$(rep A 36)"
GHS="gh""s_$(rep B 36)"
PAT="git""hub_pat_$(rep C 24)"
AWS="AK""IA$(rep D 16)"
SLACK="xo""xb-$(rep E 14)"
OPENAI="sk-""proj-$(rep F 24)"
ANTHROPIC="sk-""ant-$(rep G 24)"
PEM="-----BEG""IN RSA PRI""VATE KEY-----"
MONGO="mongo""db://u:$(rep H 12)@host/db"
# Too short to meet the rule's {30,} floor — a lookalike, not a token.
SHORT="gh""p_$(rep A 8)"

run() {
  # `${5-...}` NOT `${5:-...}`: the colon form substitutes on an EMPTY argument as
  # well as a missing one, so the no-scope case below silently ran WITH a scope and
  # reported the rule broken when it was fine. The proof's own harness lied first.
  local path="$1" content="$2" label="$3" expect="$4" scope="${5-$REPO}"
  local payload out code got verdict
  payload=$(P="$path" C="$content" python3 -c 'import json,os;print(json.dumps({"tool_name":"Write","tool_input":{"file_path":os.environ["P"],"content":os.environ["C"]},"session_id":"proof"}))')
  out=$(printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$scope" bash .claude/hooks/router.sh 2>&1); code=$?
  got="pass"; [ "$code" -ne 0 ] && got="BLOCK"
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-52s expect=%-5s got=%-5s %s\n' "$label" "$expect" "$got" "$verdict"
}

echo "=== a .env file anywhere in the public tree ==="
run "$REPO/.env"                 "X=1"  ".env at the root"                 BLOCK
run "$REPO/src/x/.env.local"     "X=1"  ".env.local (the .env.* arm)"      BLOCK

echo
echo "=== content shapes: each is a separate arm of one grep ==="
run "$REPO/src/a.ts" "const k='$PEM';"       "private key header"          BLOCK
run "$REPO/src/a.ts" "const k='$GHP';"       "github token, ghp_ arm"      BLOCK
run "$REPO/src/a.ts" "const k='$GHS';"       "github token, ghs_ arm"      BLOCK
run "$REPO/src/a.ts" "const k='$PAT';"       "github fine-grained pat"     BLOCK
run "$REPO/src/a.ts" "const k='$AWS';"       "aws access key id"           BLOCK
run "$REPO/src/a.ts" "const k='$SLACK';"     "slack bot token"             BLOCK
run "$REPO/src/a.ts" "const k='$MONGO';"     "credentialed mongo uri"      BLOCK

echo
echo "=== the arm that had never run before 2026-09-08 ==="
run "$REPO/src/a.ts" "const k='$OPENAI';"    "openai key (sk-proj- arm)"   BLOCK
run "$REPO/src/a.ts" "const k='$ANTHROPIC';" "anthropic key (sk-ant- arm)" BLOCK

echo
echo "=== must stay quiet: a guard that cries wolf gets switched off ==="
run "/tmp/somewhere/.env"  "X=1" ".env OUTSIDE the repo scope"             pass
run "$REPO/src/a.ts" "const pw='fake-test-pw-not-a-secret';" \
                                 "the safe fixture convention"            pass
run "$REPO/src/a.ts" "export const x = 1;" "ordinary source"              pass
run "$REPO/src/a.ts" "const k='$SHORT';"   "token lookalike below the floor" pass

echo
echo "=== fails open without a scope, by design ==="
# CLAUDE_PROJECT_DIR empty: the rule cannot tell repo from elsewhere, so it must
# allow rather than block every write in the session.
run "$REPO/.env" "X=1" "no CLAUDE_PROJECT_DIR set"                        pass ""
