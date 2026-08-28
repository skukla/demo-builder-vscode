# Canonical fixture consolidation — the definitive queue

Owner directive 2026-08-28: *"You need to solve every duplication of this type
with canonical fixtures. Make the definitive list and go through it in a loop
until it's solved."*

Grouped by **subject** — what the fake IS — not by function name, because
`makeLogger` and `createMockLogger` are the same thing wearing different labels.
Grouping by name alone hid a third of the duplication.

## The list (measured 2026-08-28)

| # | Subject | Defs | Names in use | Return types | Status |
|---|---|---|---|---|---|
| 1 | Logger | 6 | createLogger, createMockLogger, makeLogger, makeMockLogger | 4 | **canonical exists** (`helpers/loggerFake.ts`) |
| 2 | Github | 2 | makeMockGithub | 1 | queued |
| 3 | ComponentDef | 2 | createComponentDef | 1 | queued |
| 4 | ComponentSelection | 2 | createComponentSelection | 1 | queued |
| 5 | StateManager | 2 | makeStateManager | 1 | queued |
| 6 | SuccessResult | 2 | createSuccessResult | 2 | queued |
| 7 | CommandExecutor | 3 | createMockCommandExecutor | 2 | queued |
| 8 | CommandManager | 5 | createCommandManager, createMockCommandManager | 1 | queued |
| 9 | HandlerContext | 13 | createMockHandlerContext, createMockContext, makeContext | 3 | queued |
| 10 | vscode.ExtensionContext | 3 | createMockContext, makeContext | 1 | queued |
| 11 | Project | 11 | createMockProject, createProject, makeProject | 3 | queued |

**53 definitions across 11 subjects; 42 redundant.**

Subjects 9 and 10 were ONE row (`Context`, 13 defs) until the return types were
read: three build a `vscode.ExtensionContext` and the rest build a handler
context. One name, two unrelated things — which is exactly why name-grouping is
not enough.

## Order, and why

Ascending difficulty, so the mechanics are proven before the risky ones:

1. **Logger** — canonical already written; only redirection left.
2. **The identical pairs** (Github, ComponentDef, ComponentSelection,
   StateManager) — two defs each, one return type, mechanical.
3. **SuccessResult, CommandExecutor, CommandManager** — small, some type variance
   to reconcile.
4. **HandlerContext (13)** — largest, and the one where a canonical already
   exists in `helpers/handlerContextTestHelpers.ts` with 165 consumers.
5. **ExtensionContext (3)** — after the split above.
6. **Project (11)** — LAST and highest-value. A wrong Project fixture typechecks
   and fails only when real code touches it; this one must be copied from a real
   `.demo-builder.json`, not composed.

## Rules for each step (ADR-016 § Fixtures and fakes)

- Read every definition before merging. Same job, or a finding — never assume
  from the name.
- Canonical lives in `tests/helpers/`, typed to the REAL interface.
- Old sites keep their export as a re-export, so no consumer changes. A suite
  that also USES the name locally needs import + re-export.
- Delete the ledger row in `tests/sop/builder-uniqueness.test.ts` — a stale row
  fails.
- Gate after each subject: full jest, both typechecks, whole-repo lint.

## CORRECTION 2026-08-28 — the first list was not definitive

The scan behind the table above matched only `export function createX(`. It
missed every `export const createX = () => ...`, which is about a fifth of the
corpus: 118 builders, not 98. Consequences, both caught by widening it:

- **Logger was declared finished at 6 → 1 while three more existed** in the
  arrow form, including one in `authenticationService.testUtils.ts`.
- `createMockCommandExecutor` is 5, not 3. `createSuccessResult` is 3, not 2.
  `createFailureResult` (2) was entirely invisible.
- The RATCHET inherited the blind spot, so it would have reported clean while
  duplicates accumulated in the form it could not see — a zero from a probe that
  cannot look, which reads exactly like a zero from a probe that found nothing.

Both forms are now matched, in the scan and in
`tests/sop/builder-uniqueness.test.ts`, whose positive control asserts a known
`export const` builder is visible so this cannot regress silently.

## Progress

| Date | Subject | Defs before → after | Redundant remaining |
|---|---|---|---|
| 2026-08-28 | Logger (`createMockLogger`, function form) | 9 → 1 | 43 → 35 |
| 2026-08-28 | Github (shape canonical, builders renamed) | 2 → 2 distinct | — |
| 2026-08-28 | ComponentDef (byte-identical) | 2 → 1 | — |
| 2026-08-28 | Logger (arrow form, after widening the scan) | 3 → 1 | 39 → 37 |

**True baseline after widening: 118 builders, 11 duplicated names, 37 redundant.**
