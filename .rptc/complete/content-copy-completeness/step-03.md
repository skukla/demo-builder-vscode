# Step 03 — Post-copy completeness audit (Layer 2) · the smoke alarm

**Goal:** After content copy, detect any **referenced-but-not-copied** internal document and surface
it through the existing patch-report toast/log — so this bug class fails **loudly** even when
discovery (Step 01) misses a reference shape.

## Why

Silent drops are the core defect: a missing doc shows as a blank region / 404 in the demo, never as
a copy error. A dangling-reference audit converts that into a named diagnostic and guards future
regressions (new templates, new fragment shapes).

## Test-first (RED)

New `tests/features/eds/services/contentCompletenessAudit.test.ts`:

1. `auditReferences(copiedPaths, refsByPage)` returns the set of referenced internal paths absent
   from `copiedPaths` (e.g. page references `/customer/nav` but it wasn't copied → reported).
2. Returns empty when all references are satisfied (no false positives for external/media/anchor/
   `/products/*`).
3. Integration: `copyContentFromSource` with a source whose page references a fragment that 404s on
   canonical records a content-audit entry in the `PatchReport` (assert via `addContentResult`
   shape) so the pipeline's `reportUnapplied` names it.

## Implement (GREEN)

- Reuse the Step 01 `extractReferencedPaths` to collect references per copied page (no extra
  fetches — parse the HTML we already fetched).
- After the copy loop in `copyContentFromSource`, diff referenced-internal paths against the
  copied/visited set; for each dangling ref, `addContentResult(patchReport, { … kind: 'reference',
  path, applied: false … })` (extend the result shape in `patchReportHelper.ts` minimally, or map
  onto the existing content-result shape with a clear label).
- Ensure `edsPipeline` / `edsResetService` already call `reportUnapplied` (they do) so the audit
  rides the existing toast — no new UI.

## Files

- `src/features/eds/services/daLiveContentOperations.ts` (collect refs + audit call).
- `src/features/eds/services/patchReportHelper.ts` (minimal result-shape extension if needed).
- Test file above.

## Acceptance

- A simulated missing fragment produces a user-visible "referenced but not copied: /customer/nav"
  style report entry; a fully-satisfied copy reports nothing.
- No false positives for external/media/product-overlay/anchor links.

## Notes

- This is the highest-leverage guardrail for least code — prioritize after the fix (01/02).
- Keep the audit advisory (warn), not fatal: a dangling ref shouldn't abort a create, just surface.
