# Oversized test-file splits (non-AI areas)

## Provenance

Scoped 2026-05-27 during the chat-first-AI test cleanup. While fixing all
pre-existing test lint issues, 10 test files exceeded the 500-line `max-lines`
rule. The 3 AI-adjacent files were split on `feature/chat-first-ai`
(`AiOverviewScreen`, `aiHandlers`, `mcpServer` — each now a `*.testUtils` +
per-aspect siblings). The remaining 7 span unrelated features; splitting them on
the AI branch would have muddied that PR, so they are deferred here. All lint
**errors** were already fixed across the whole suite — only these `max-lines`
**warnings** remain.

## Goal / Scope

Bring these 7 test files under the 500-line limit by splitting along their
top-level `describe` boundaries, following the established pattern: extract
shared setup (jest.mock calls, fixtures, render/context helpers) into a sibling
`<subject>.testUtils.ts(x)` and carve each concern into `<subject>-<aspect>.test.ts(x)`.

Files (eslint-counted lines; `wc -l` is higher):

| File | Lines |
|------|-------|
| `tests/features/eds/services/blockCollectionHelpers.test.ts` | 1216 |
| `tests/features/dashboard/ui/hooks/useDashboardStatus.test.ts` | 567 |
| `tests/features/eds/services/daLiveContentOperations-library-creation.test.ts` | 540 |
| `tests/features/components/handlers/componentHandlers.test.ts` | 539 |
| `tests/features/eds/ui/components/DaLiveServiceCard.test.tsx` | 524 |
| `tests/features/eds/services/blockCollectionHelpers-multiLibrary-merging.test.ts` | 518 |
| `tests/features/project-creation/ui/components/ConnectStoreStepContent.test.tsx` | 503 |

## Execution plan

1. Per file, list top-level (and one-level-nested) `describe` blocks and the
   shared setup span.
2. Move shared setup into `<subject>.testUtils.ts(x)` — keep `jest.mock` calls
   there (hoisted above the module-under-test import) and re-export the
   module-under-test + mocked collaborators so siblings import through it.
3. Carve each `describe` group into `<subject>-<aspect>.test.ts(x)`; for files
   wrapped in a single top `describe`, re-wrap each sibling with its own top
   `describe` + `beforeEach`.
4. Import only the symbols each sibling uses (avoid unused-import errors).
5. Delete the original; run the new suites + `eslint` on the split files.

`blockCollectionHelpers.test.ts` (1216) and its `-multiLibrary-merging` sibling
are the priority — likely a 3–4-way split sharing one `*.testUtils`.

## Constraints

- Behavior-preserving: no test logic changes, only relocation. Test counts must
  match before/after.
- Follow the precedent set on `feature/chat-first-ai`
  (`AiOverviewScreen.testUtils.tsx`, `mcpServer.testUtils.ts`,
  `aiHandlers.testUtils.ts`).
- `*.testUtils.*` files are not matched by jest's testMatch — no `describe`/`it`
  in them.

## Kickoff prompt

> Split the 7 oversized non-AI test files listed in
> `.rptc/backlog/2026-05-27-oversized-test-file-splits.md` under the 500-line
> `max-lines` limit, following the `*.testUtils` + per-aspect-sibling pattern
> established for the AI tests. Behavior-preserving; verify each split with its
> suite + eslint and confirm test counts are unchanged.
