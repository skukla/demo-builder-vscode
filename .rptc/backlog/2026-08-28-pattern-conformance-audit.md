---
id: PL-12
kind: question
area: platform
needs: []
value: med
status: shipped
---

# Pattern-conformance audit — one architecture, or one per feature?

Filed 2026-08-28 from the owner's question: *"is there one recognizable set
of patterns that we use consistently, or does every feature use its own
architectural pattern to accomplish its task?"*

## What is already known (so the audit starts from evidence)

**The one pattern that stayed consistent is the one a TEST enforces.** The
MCP response envelope was extracted in July, had regrown hand-rolled copies
in 10 of 23 registrar modules by August, and became durably consistent only
when `responseEnvelope.test.ts` started failing on deviation. That is the
whole thesis: consistency holds where a mechanical check holds it.

**Known variety, measured not hypothesized:**
- The SOP table itself lists "inconsistent DI" and "inconsistent service
  layer" as HIGH-priority patterns — drift was observed when it was written.
- 2026-08-28, same day, both styles live: `appBuilderComponentRunner` takes
  fully injected deps (`AppBuilderComponentRunnerDeps`); dashboard handlers
  reach into `ServiceLocator` at call time. Both work; nothing says which is
  canon where.
- Two fixture-factory styles coexist in tests; 59 `.testUtils.*` files follow
  the shared-preamble convention while whole suite families do not (PL-9/10
  own the test half).

## The audit's method (the envelope story generalized)

1. **Inventory the claimed canon** from the docs that state it (core/CLAUDE.md
   handler pattern, features/CLAUDE.md import rules, mcp-tool-authoring,
   ADRs, the SOP tables).
2. **Write the mechanical adherence count per pattern** where one is
   possible: handler maps through `defineHandlers`/`dispatchHandler`;
   constructor injection vs `ServiceLocator` reach-ins per layer; envelope
   builders (already enforced — the reference); direct `writeFile` in bundle
   writers (already a review grep); `vscode.window` calls outside
   handler/command layers.
3. **Adjudicate each pattern three ways**: ENFORCE (add a check in the
   envelope test's mold), ACCEPT (documented legitimate variety — say where
   each style belongs), or CONVERGE (backlog the migration). A scan proposes;
   a human adjudicates; only adjudicated conventions get enforcement.

## Should a standing scan skill exist?

Not before the audit answers which patterns deserve one. Building a
conformance scanner first manufactures violations for unadjudicated
conventions. If the audit yields ≥3 ENFORCE verdicts with stable detectors,
a `pattern-conformance-scan` skill in the release-cut family is the natural
follow-on; the SOP scans and `architecture-duplication-scan` are siblings,
not substitutes (they find duplicated JOBS; this measures divergent STYLES
for the same job-shape).

## Related

- `architecture-duplication-scan`, `call-path-audit` (the job-level halves)
- `docs/development/sop/consistency-patterns.md` (the SOP this would give teeth)
- PL-11 (test health) owns the test-side conventions

## Shipped so far

- 2026-08-28  ANSWERED AND ENFORCED (2026-08-28). The question ('one architecture or one per feature?') resolved: one architecture, one fault line. Owner-ratified ruling: ADR-015 (fetch at the boundary, inject below, construct in the root or create...Deps; responsibility contracts; the 11-row where-code-goes table). Enforcement live: tests/sop/architecture-rules.test.ts, six checks, positive controls, 75-entry reasoned ledger that only shrinks. The instrument earned its keep twice: the done-gate caught planted holes, and the enforcement suite's positive control caught the audit's OWN coverage bug (the ls-files glob silently excluded the three top-level src files incl. extension.ts — corrected everywhere, 899/899 kinded, re-verified). Cleanup queue: PL-13.
