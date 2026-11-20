# Codebase sweep — 2026-11-16 (beta.153, release-test step 4.5a)

Ran `npm run sweep` (15 scripted checks: 7 clean gates, 8 reported, 0 failing, 0 broken), then the
three scans the scripted sweep leaves out (component-extraction, the boundary-cast audit) and the
triage below. The owner was asleep: every finding is filed for him, nothing applied. None blocks
beta.153.

## Movement since last sweep

| Scan | Last (2026-08-27 baseline) | Now | Verdict |
|---|---|---|---|
| code-duplication (src, jscpd) | 66 clones (59 excluding JSON) | 11 (8 JSON schema structure, 3 ts/tsx) | Far below; `clones:check` gate clean at its pin. Not news |
| tests-tree duplication | 78 service / 13 webview pairs | 17 service / 8 webview (health) | Both floors fell. Not news |
| circular dependencies | 0 | 0 (1,853 files) | At baseline |
| dead-code doc drift | 0 | 0 (66 historical mentions, accurate) | At baseline |
| boundary-cast audit | 40 (6 `as never`, 34 `as unknown as`) | 24 (0 `as never`, 24 `as unknown as`, 0 `as any`) | Fell; no new cast class |
| component-extraction | 3 groups | 30 groups | Mostly shared style classes; one real shell (finding 1) |
| ai-coverage | — | 147 of 208 reachable; 3 judged gaps; 16 untriaged | Finding 2 |
| rptc-hygiene | — | 54 finished items still name work | Finding 3 |
| mutation staleness | — | 377 of 687 rows stale | Logged on PL-70 |
| dead-mock-scan | — | 1 redundant automock | The scan's own fixture (`tests/sop/redundant-automocks.test.ts`). Noise |

## Findings (filed)

### 1. The three batch windows build one question table three times — PL-98
- Sites: `BatchDeleteQuestions.tsx:66`, `BatchResetQuestions.tsx:47`, `UpdatesModal.tsx:97`.
- Shape: the same four classes over the same three files (`batch-confirm`, `batch-delete`,
  `batch-delete-table`, `batch-changes-head batch-project-head`): wrapper, lead line, scroll box,
  "Project" head cell, header checkboxes with all, some and none states.
- Proposal: a `BatchQuestionTable` shell; the columns and body stay with each caller (they differ
  for real: several columns, one optional column, grouped rows).

### 2. 16 handlers a person can reach have no agent-coverage verdict — AI-79
- Mostly the datapack simplification's and the projects batch window's new handlers. Read each,
  add a triage row, file any real gap.

### 3. 54 finished backlog items still name remaining work — PL-99
- Fold into the post-cut backlog reconcile.

### Mutation rows stale — logged on PL-70
- 377 of 687 stale (350 module changes, 27 suite only). `highValueSurvivors` 165 to 1,274 and
  `noCoverage` 87 to 389 rose because `modulesPinned` went 12 to 687, not a regression. Overnight
  re-measure owed: `npm run test:mutation:sweep -- --stale --minutes 480`.

## Considered and rejected

- **`webviewCommunicationManager.ts:360` ↔ `WebviewClient.ts:103` (20 lines).** The extension's and
  the webview's halves of one message protocol, in two runtimes and two bundles (ADR-017). Variant.
- **The 8 JSON clones.** Schema structure shared between `project-file` and `shared-demo`, and between
  the catalog schemas. The inert floor the baseline names.
- **`dialog-problem` (25 files), `dialog-line` (14), `dialog-stack` (9), `page-container-padded` (8)
  and the other wide groups.** Shared style classes doing their job: unrelated files, one class each.
- **Dead-code abandonment markers** ("legacy", "deprecated"). Read: they describe Adobe's own
  deprecations, legacy data a reader still accepts, or history. `commandManager.ts:195` labels
  `demoBuilder.configure` "Legacy", but it is a live, documented palette command; only the comment
  is misleading.
- **The 3 judged agent-coverage gaps** (`check-store-view-products`, `clear-dalive-auth`,
  `github-change-account`). Already judged; unchanged.

## Baselines to carry forward

| Scan | Baseline 2026-11-16 |
|---|---|
| code-duplication (src) | 11 clones (8 JSON, 3 ts/tsx); ratchet held by `clones:check` |
| tests-tree duplication | 17 service / 8 webview pairs, 1,589 duplicated lines |
| circular dependencies | 0 |
| doc drift | 0 |
| boundary casts | 24 (`as unknown as` only) |
| component-extraction | 30 groups, all adjudicated above except PL-98 |
| ai-coverage | 3 judged gaps, 16 untriaged (AI-79) |
