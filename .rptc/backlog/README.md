# Backlog — Future Work

Plans for features, fixes, and improvements that aren't active yet. Each file is a self-contained plan with the context, scope, and kickoff prompt needed to pick the work up later — possibly months later, possibly by a different agent.

This directory is the **single source of truth** for "what's next." If it belongs here it should not also live in TODO files, the CHANGELOG, or scattered code comments.

## Conventions

- **Shape**: a single file `<topic-slug>.md` for an idea, OR a directory `<topic-slug>/` for an already-structured RPTC plan that's paused (overview + step files).
- **Filename**: `<topic-slug>` or `YYYY-MM-DD-<topic>` — date prefix when the deferral date matters (e.g., the item was scoped during an audit and you want the snapshot date visible).
- **Required sections** (for single-file entries): Provenance · Goal/Scope · Execution plan · Constraints · Kickoff prompt.
- **Promotion**: when an item becomes active, move it to `.rptc/plans/<topic-slug>/`.

## Lifecycle

```
draft  →  ready  →  active  →  shipped/dropped
  │         │          │            │
  │         │          │            └─ move the file to .rptc/complete/ (archive;
  │         │          │               git history holds the full implementation record)
  │         │          └─ move to .rptc/plans/<topic-slug>/ (multi-step) OR
  │         │             promote in place when starting work
  │         └─ ready for execution; pick up any time
  └─ idea capture, may still change shape
```

## Active backlog

### Multi-locale storefront — Phase 1 ([`2026-05-19-multisite-multilocale.md`](2026-05-19-multisite-multilocale.md))

Phase 1 implementation plan for serving multiple locales (and eventually multiple brands) from a single Demo Builder project. Repurposes the wizard `settings` step as **Business Structure** with progressive sections for Connection, Primary Store, Regions & Locales, and (Phase 2, reserved) Additional Brands. Covers PaaS, ACCS, and the ACO addon. Research base: [`docs/research/2026-05-19-multisite-multillocale-research.md`](../../docs/research/2026-05-19-multisite-multillocale-research.md). Architecture seam: [ADR-003](../../docs/architecture/adr/003-multisite-architecture-seam.md). Phase 2 (repoless multi-brand) deferred.

### Structural baseline ([`2026-05-21-structural-baseline.md`](2026-05-21-structural-baseline.md))

Numbers-first measurement pass to map the codebase's actual size, complexity, and coupling after ~1 year of AI-assisted development. **Run after Cycle D ships.** Produces a report that informs subsequent trim cycles.

### Legacy / soft-deprecation cleanup ([`2026-05-21-legacy-soft-deprecation.md`](2026-05-21-legacy-soft-deprecation.md))

~30 inventoried items across `src/` — `@deprecated` JSDoc, "Kept for backward compatibility" type variants, deprecated API aliases. Spans many features. **3 zero-caller deletions are ready any time** if a small trim task is wanted between cycles. Full execution plan in batches L1–L5.

Downstream of the structural baseline — the baseline will probably surface higher-leverage trim targets, and the legacy items may rank lower than they appear today.

### Helix `previewCode` race ([`2026-05-21-helix-previewcode-race.md`](2026-05-21-helix-previewcode-race.md))

Spurious `400 Bad Request` warnings from `HelixService.previewCode` fire when the call lands before Helix's code mirror has indexed a just-pushed commit. Non-fatal (caught and logged), but noisy in the Logs channel during project creation. Single-batch fix: retry-with-backoff on `400` only, 3 attempts (1s/3s/7s). Self-contained; pick up any time.

### Monorepo independent release tracking ([`monorepo-independent-release-tracking/`](monorepo-independent-release-tracking/overview.md))

Full RPTC plan (overview + 3 steps) drafted 2025-12-16, never executed. Adds tag-prefix support (`backend@1.0.0`, `optimizer@2.0.0`) so multiple Adobe Commerce components in a single repo can have independent release lifecycles. Paused while the AI Layer Pivot cycles took priority; pick up when monorepo components become a real need.

### Oversized test-file splits — non-AI areas ([`2026-05-27-oversized-test-file-splits.md`](2026-05-27-oversized-test-file-splits.md))

7 test files exceed the 500-line `max-lines` rule (EDS services, components/dashboard, project-creation). Split them along `describe` boundaries using the `*.testUtils` + per-aspect-sibling pattern established for the AI tests on `feature/chat-first-ai`. Behavior-preserving. The 3 AI-adjacent files were already split; all test lint **errors** are already fixed — these are the remaining `max-lines` **warnings**. `blockCollectionHelpers.test.ts` (1216) is the priority. Self-contained; pick up any time.
