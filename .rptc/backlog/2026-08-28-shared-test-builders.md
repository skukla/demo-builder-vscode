---
id: PL-16
kind: fix
area: platform
needs: []
value: med
status: backlog
---

# Give StateManager and Project fixtures a shared builder, the way HandlerContext has one

Filed 2026-08-28 from the test-divergence audit the owner asked for after
noticing that suites "do things their own way".

## The measurement

`node .claude/skills/test-divergence-scan/scan.mjs tests` over 1,288 files:

| Collaborator | shared builder | hand-rolled | distinct shapes | most common covers | shapes used once |
|---|---|---|---|---|---|
| HandlerContext | 165 | 4 | 3 | 78% | 2 |
| CommandExecutor | 80 | 81 | 5 | 54% | 2 |
| Logger | 210 | 341 | 30 | 33% | 9 |
| StateManager | 47 | 48 | 26 | 14% | 17 |
| Project fixture | 78 | 38 | 32 | 13% | 25 |

## What it says

**HandlerContext is the control, and it is the whole argument.** 165 suites
import `createMockHandlerContext`; four hand-roll one. That is not superior
discipline in those 165 authors — it is that a shared builder exists, is easy to
find, and covers what suites actually need. Where that holds, divergence does
not happen.

**StateManager and Project fixtures are where it does not hold.** Twenty-six
distinct shapes across forty-eight uses, and thirty-two across thirty-eight.
Seventeen and twenty-five of those shapes have exactly one user — a shape with
one user is a shape nobody agreed to.

## Why it matters, stated at the right strength

This is a **risk**, not a live defect. The audit checked specifically for the
known-wrong Project shape (a `components: [...]` array instead of the real
`componentInstances` record) and found **zero** genuine instances. Nine files
matched the pattern; all nine were read; all nine were legitimate — block
libraries have their own unrelated `components` array, one file deliberately
exercises a legacy manifest, and one contains the string in a comment
*documenting* the mistake after it was fixed.

The mechanism has bitten once. `tests/features/ai/server/projectStatusTool.test.ts`
guessed the Project shape and three tests failed against the real accessors; its
header now records why. It is documented in `mcp-tool-authoring` and
`webview-test-authoring` as a trap. It is contained — and thirty-two independent
Project shapes is how it stops being contained.

## The work

Not a rule telling people to share. A builder, placed where suites already look:

1. **Project fixture** (25 one-off shapes — most urgent). One
   `createMockProject(overrides)` in `tests/helpers/`, built from a REAL
   `.demo-builder.json` per the standing rule, covering the shapes the one-offs
   currently reach for (frontend port on the instance, mesh by `subType`,
   `appBuilderComponents` keyed map).
2. **StateManager** (17 one-offs). Same treatment.
3. **Logger** (9 one-offs, 341 inline). Largest by volume but least dangerous —
   a logger fake that is wrong fails loudly. Lowest priority.

Convert opportunistically rather than in one sweep: a suite moves to the builder
when it is next touched for another reason. The scan's numbers are the progress
measure.

## Guard

Re-run the scan at release cuts (it is in the `test-divergence-scan` skill and
should join the `cut-release` scan list). The baseline table above is what a
later run is compared against.
