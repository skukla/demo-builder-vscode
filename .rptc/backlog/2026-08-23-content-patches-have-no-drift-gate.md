# Content patches have no drift gate

**Filed:** 2026-08-23, after two obsolete content patches were caught by a
user reading a toast — the only detector they had.

## The gap

The LKG drift gate (`eds-demo-patches/scripts/lkg-gate.sh`) verifies every
patch in every `*/code-patches.json` against a clonable canonical repo, and
retires patches whose fixes land upstream. **Content patches
(`*/patches.json`) have no equivalent**: they target DA.live-authored pages
the gate never reads — CI has no DA token, and the content sources are
private orgs.

Proven costly the same day: `phones-heading-reorder` and
`smart-watches-category-id(-accs)` were obsolete (the CitiSignal content
source absorbed both fixes — the heading was reordered at the source, and
the hardcoded category row was REMOVED entirely in favor of urlPath
resolution). Nothing surfaced this until a create/reset toast named them and
a user asked. They are now retired; the toast copy no longer promises a gate
that is not watching (it asks for a report instead).

## Fix shapes to weigh at pickup

1. **Publish-side probe**: content sources have PUBLISHED mirrors (the
   template's live aem.live site). A scheduled check could fetch the
   published pages anonymously and test each content patch's searchPattern —
   same OK / OBSOLETE / FIXED_DIFFERENTLY classification as the code gate.
   Caveat: published != authored HTML (the pipeline patches authored DA
   HTML); the pattern would need a published-form equivalent or a
   tolerance for the transform.
2. **Create-time telemetry**: the patch report already knows per-run which
   patches did not apply; a counter (file? log grep?) that notices "this
   patch has not applied in N consecutive runs" turns the toast into data.
3. **Accept the toast as the detector** — but then the report-it ask in the
   toast copy is the contract, and this item just documents that decision.

## Cross-references

- `eds-demo-patches` README ("three roles") — the gate's own scope statement
- `patchReportHelper.ts` — the toast, and the comment recording this gap
