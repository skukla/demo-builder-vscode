---
id: PL-74
kind: fix
area: platform
needs: []
value: low
status: backlog
---

# The jest-concurrent hook proof failed once under the full suite's load

Filed 2026-10-12, from a refused push.

## What happened

A push of five commits (none touching `.claude/hooks/`) was refused by the pre-push gate: 1 of
34,107 tests failed.

```
tests/hooks/rule-proofs.test.ts › every hook rule proof runs, and passes › 15-jest-concurrent.proof.sh
  "a node named by full path still counts    expect=BLOCK got=pass  *** WRONG ***"
```

The other fourteen cases of the same proof were right in that run. Run by itself straight
afterwards, `bash .claude/hooks/rules/15-jest-concurrent.proof.sh` got all fifteen right. The
push was run again, unchanged, and the gate passed: 2,002 suites, 34,107 tests.

So the case failed once, inside a full-suite run, and has not been reproduced.

## What is known and what is not

Known: the case feeds the router a fixture process list (`DBV_JEST_PS`) holding one line,
`99005 /opt/homebrew/bin/node /repo/node_modules/.bin/jest --ci`, and expects a block. `pass`
means the router exited 0.

Not known: why. Two candidates, neither tested:

- The rule skips a process that is one of its OWN ancestors, by pid. The fixture's pid, 99005,
  is made up, and macOS pids run to 99999. If a real ancestor of the hook had pid 99005 during
  that run, the fixture line was skipped. A fixture pid that cannot be a real pid (0, or above
  99999) would rule this out.
- The rule fails open by design (`ps` or the payload unreadable means the run proceeds). Under
  a full suite at 75% of the cores, a failed spawn in the proof's `python3` payload step or in
  the router would read as `pass`.

## Done when

The cause is found by a test that reproduces it, or both candidates are closed off: fixture pids
that cannot collide, and a proof that tells "the router said pass" from "the router did not run".
