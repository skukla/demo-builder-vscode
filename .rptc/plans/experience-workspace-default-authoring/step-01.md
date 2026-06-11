# Step 1: Quick Edit Vendoring Step + Anchor-Match Test

**Purpose:** Wire the EW WYSIWYG dependency (Quick Edit) into every EDS storefront via a single brand-agnostic vendoring step, modeled exactly on `pdp404HandlerPublisher`. Inert under UE; makes the flip seamless. Replace the lost LKG-gate anchor coverage with an extension-side anchor-match test.

**Prerequisites:** Step 0.

**Model file (read first):** `src/features/eds/services/pdp404HandlerPublisher.ts` — copy its `getFileContent` → idempotent-marker-check → `createOrUpdateFile` (SHA-aware) shape, its non-fatal `{ installed, reason }` result, and its create+reset wiring.

---

## What the one step applies (research "Code-patch engine mechanics")

1. `scripts/scripts.js`: add `export` to `loadPage` (read → search/replace on literal anchor → `createOrUpdateFile`, SHA-aware).
2. `scripts/scripts.js`: add the `?quick-edit` dynamic-import branch (composes with #1 — same file write).
3. `tools/quick-edit/quick-edit.js` (net-new file) — `createOrUpdateFile` unconditionally; idempotent via content/SHA.
4. (Sidekick `quick-edit` plugin entry → **Step 2**, Config Service pipeline.)

Apply to ALL EDS projects at create AND reset, every template. Idempotent: re-run = no-op.

---

## Tests to write FIRST (RED)

**New test file:** `tests/unit/features/eds/services/quickEditPublisher.test.ts` (mirrors `tests/unit/features/eds/services/pdp404HandlerPublisher.test.ts`).

- [ ] `installQuickEdit` adds `export` to `loadPage` when the un-exported anchor is present (asserts `createOrUpdateFile` called with transformed `scripts.js` + the existing SHA).
- [ ] `installQuickEdit` adds the `?quick-edit` dynamic-import branch (both `scripts.js` edits land in one write).
- [ ] `installQuickEdit` writes net-new `tools/quick-edit/quick-edit.js` via `createOrUpdateFile`.
- [ ] **Idempotency:** when both `scripts.js` anchors are already transformed (export present + branch present), no `scripts.js` write occurs; returns `{ installed: false, reason: 'already installed' }`.
- [ ] **Idempotency:** when `quick-edit.js` already matches, no redundant write (or a content-equal no-op).
- [ ] **Non-fatal:** `scripts.js` missing → log warn, `{ installed: false, reason: 'scripts.js missing' }`, never throws.
- [ ] **Non-fatal:** `createOrUpdateFile` rejects → caught, `{ installed: false, reason: 'GitHub commit failed: ...' }`.

**New anchor-match guard test:** `tests/unit/features/eds/services/quickEditAnchorMatch.test.ts`.

- [ ] Load the pinned-canonical `scripts.js` boilerplate fixture (the LKG-pinned `hlxsites/aem-boilerplate-commerce` `scripts/scripts.js`) and assert BOTH literal anchors the vendoring step searches for still exist in it. This is the safety net replacing the patches-repo LKG gate's anchor coverage. Document in the test why it exists (anchors left the per-brand ledgers).
  - The canonical fixture should be committed alongside the test (small, pinned to the LKG SHA the extension already uses).

## Implementation (GREEN)

- [ ] Create `src/features/eds/services/quickEditPublisher.ts`:
  - Export literal anchor constants (the un-exported `loadPage` signature; the import branch insertion point) as named consts — stable strings, documented "do not edit without bumping canonical".
  - `buildQuickEditScriptsJs(existing: string): string` — pure transform (both search/replaces). First-match-only, like the patch engine.
  - `QUICK_EDIT_JS` net-new file content constant (the `tools/quick-edit/quick-edit.js` body).
  - `installQuickEdit(githubFileOps, repoOwner, repoName, logger): Promise<{ installed: boolean; reason?: string }>` — read `scripts/scripts.js`, idempotent-check, transform, commit; then unconditionally `createOrUpdateFile` `tools/quick-edit/quick-edit.js`. Non-fatal throughout.
- [ ] Wire into create: `src/features/eds/handlers/storefrontSetupPhase2.ts` — call `installQuickEdit(githubFileOps, repoInfo.repoOwner, repoInfo.repoName, logger)` right beside the existing `installSmart404Handler` call (`:114`). No new params needed (brand-agnostic, no overlay/IMS inputs).
- [ ] Wire into reset: `src/features/eds/services/edsResetRepoHelper.ts` — call beside the `installSmart404Handler` call (`:303`).

## Files

- **Create:** `src/features/eds/services/quickEditPublisher.ts`
- **Modify:** `src/features/eds/handlers/storefrontSetupPhase2.ts`, `src/features/eds/services/edsResetRepoHelper.ts`
- **Create tests:** `tests/unit/features/eds/services/quickEditPublisher.test.ts`, `tests/unit/features/eds/services/quickEditAnchorMatch.test.ts` (+ pinned-canonical `scripts.js` fixture)

## Acceptance Criteria

- Quick Edit step runs at create AND reset for every EDS project; idempotent and non-fatal.
- Both `scripts.js` anchors verified present in pinned-canonical boilerplate by the anchor-match test.
- NO `eds-demo-patches` changes.
- `quickEditPublisher.ts` ≤500 lines; each function ≤50 lines.

## Notes / Constraints

- DRY: reuse `GitHubFileOperations.getFileContent`/`createOrUpdateFile` (SHA-aware) — do not hand-roll GitHub I/O.
- KISS: no patch-engine abstraction; two literal search/replaces + one file write.
- The Sidekick plugin entry is Step 2 (different sink: Config Service, not GitHub files).
