---
name: dead-mock-scan
description: Find jest.mock calls that do nothing — bare automocks of modules moduleNameMapper already redirects (static, exact), and mocks that can be deleted with no test noticing (dynamic, scoped). Use at a release cut, before extracting a shared testUtils for a split suite family, or when a suite's preamble has grown and nobody knows which lines still matter.
---

# dead-mock-scan

**A mock nothing needs is worse than no mock: it reads as a statement about what the
code touches.** Every one of them is a claim — "this suite would reach the network
without me" — and an unexamined claim in test setup is how a preamble grows to
sixteen lines nobody dares delete.

## Why this exists

The same question was asked twice in 2026-08 and answered the same way both times.

- **28 suites** module-mocked a stateless service. Twenty-two needed the mock
  DELETED, not injected — the collaborator was constructed once and never called.
- **Eleven split-suite families** were then merged into shared harnesses.
  **79 of their shared mocks were dead**, removed from every suite that carried them
  with nothing failing. Ten of the eleven had some; three consisted of almost nothing
  else.

Two working sessions went into designing injection seams for files that only needed a
deletion, because the question asked was *"how would this suite hand the service in?"*
rather than *"does this mock change anything?"*. The second question costs one suite
run.

## Running it

```bash
bash .claude/skills/dead-mock-scan/scan.sh               # static half, whole tests/ tree
bash .claude/skills/dead-mock-scan/scan.sh tests/features/eds
```

Fast, no test runs, safe in a sweep. It reports **bare automocks of modules
`jest.config.js` already redirects through `moduleNameMapper`** — the mapping happens
first, so the line does nothing.

The distinction that makes this exact:

```ts
jest.mock('vscode');                    // redundant — the mapper already handles it
jest.mock('vscode', () => ({ … }));     // NOT redundant — a factory overrides the mapping
```

Conflating them reports 174 findings where there are 43, and 131 of those are
deliberate overrides someone wrote on purpose.

### The dynamic half — opt in, and scope it

```bash
bash .claude/skills/dead-mock-scan/scan.sh --verify \
    'tests/features/mesh/services/meshVerifier*.test.ts' \
    'mesh/services/meshVerifier' \
    @/core/di @/core/logging @/core/utils/meshConfig
```

It deletes each module's mock from every matching file, runs the suite, restores, and
reports. Then it does the whole set together. One jest run per module plus one, which
is why it takes a pattern rather than sweeping.

**It refuses to start against a red or unrunnable baseline**, because "it failed
without the mock" means nothing if it was already failing.

## Reading the output

| Verdict | Means |
|---|---|
| `DEAD` | Removed, nothing failed. A candidate — see the triage below |
| `needed` | Something failed without it |
| `NOT PRESENT` | No file in the glob mocks that module |
| `*** NO SUMMARY ***` | The run did not happen. **Not a result.** |
| `<- N test(s) VANISHED` | Suites failed to LOAD. A bigger fact than any failure count |

The last two exist because of specific wrong answers. Three verdicts in one session
were garbage from a run that never happened — a shell quirk sent the runner one bad
pattern, it matched nothing, and the non-zero exit read as "tests failed, therefore
needed". And removing one mock dropped 34 tests to `6 passed, 6 total`, which reads
like a smaller failure and is actually three suites not running at all.

## Triage — `DEAD` is a lead, not a verdict

**Probe the SET, not one line at a time.** Twice — `meshVerifier` and
`componentManager` — a ServiceLocator mock AND the line wiring a fake into it were
both dead, because the subject takes that fake by constructor. Remove either alone and
the other keeps it alive; the componentManager case was seven declarations and one
line propping each other up. This is why `--verify` always reports the combined run.

**Before deleting, ask what the mock was insuring against.** Some are isolation the
suite has not needed YET — a network call on a path no current test reaches. Those are
a judgement call: keep it with a comment saying it is unproven, or delete it and let
the next person meet the real call. Both are defensible; silence is not.

**A mock the SPEC imports cannot be shared, only deleted or kept.** A `jest.mock`
hoists above the imports of the module it appears in and no further, so moving one to
a shared `testUtils` registers it too late. That cost 23 failing tests to learn in the
`deployMesh` family, on `fs/promises`.

## What it does NOT find

The static half knows exactly one rule. The dynamic half only answers for the pattern
you give it. Neither finds:

- a mock that is load-bearing but WRONG (a stale shape the suite agrees with) — that
  is what `mutation-test-pilot` and reading the thing are for;
- a mock whose absence would only fail a test nobody has written yet.

## The counter-example, and why it belongs here

`aiContextWriter`'s four suites shared 74 lines that were byte-identical and entirely
load-bearing — two project shapes, a component, and the stack list every test passes.
Nothing dead in it.

"Shared setup is usually dead" is a common case, not a rule. A reader who takes only
the headline finding will delete something they need.

## Related

- `tests/sop/test-family-setup.test.ts` — the ratchet on split families without shared
  setup, whose docblock carries the same finding
- `dead-code-scan` — the same idea for production code
- The handbook's convention: *delete the mock and run the suite* before designing a
  way to hand the collaborator in
