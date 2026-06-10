---
id: 2026-06-10-buildright-eds-disposition
title: Rebuild BuildRight on the thin-layer model (disposition decided 2026-06-10)
status: backlog
created: 2026-06-10
priority: medium
---

# Rebuild BuildRight on the thin-layer model

> **DECIDED 2026-06-10 (owner)**: BuildRight will be **completely rebuilt** — option 1 below. The retain/replace options are off the table, and no audit of the existing `buildright-eds` codebase is needed (it's a from-scratch rebuild, not a migration). Remaining work when picked up: express BuildRight as a Demo Builder package on canonical — branded block library + brand CSS + patches (if any) + DA content — using the ADR-006 mechanisms. Still gated on the ADR-006 implementation (code-patches mechanism + LKG gate) existing first. The old repo archives when the rebuild ships.

## Provenance

Spun out of the thin-layer storefront evaluation (2026-06-10). That audit retired the two citisignal forks in favor of canonical + a thin customization layer (ADR-006), but **explicitly excluded** `skukla/buildright-eds` per owner direction. The prework discovered buildright shares **no git history** with canonical `hlxsites/aem-boilerplate-commerce` — it is a standalone codebase, not a fork, so the audit's diff-against-merge-base method doesn't apply to it. Its nominal drift (589 ahead / 1,541 behind from the 2026-06-09 inventory) is therefore not directly comparable to the citisignal numbers.

The dropped sync project (`.rptc/complete/2026-06-09-storefront-template-sync.md`, Phase 3) had already recommended "fresh fork + reapply customizations" for buildright — directionally consonant with the thin-layer model, but never validated by an audit.

## Goal / Scope

Decide one of:

1. **Rebuild on the thin layer** — express BuildRight as a Demo Builder package on canonical: branded block library + theme patches + DA content, using the ADR-006 mechanisms. Likely the consistent end-state, but requires inventorying buildright's actual customization surface first (no merge-base exists, so the inventory is a file-level comparison against canonical, not a commit audit).
2. **Retain as-is** — keep the standalone repo, accept the drift. Cheapest now; diverges from the ADR-006 model and leaves the 1,541-commit gap growing.
3. **Replace/retire** — if BuildRight demos no longer justify the asset.

Related input: `.rptc/backlog/2026-06-09-dropin-version-coupling.md` noted buildright pins **no** `@dropins/*` packages at all — an architectural oddity to explain during the inventory.

## Execution plan

1. Inventory buildright's customization surface vs canonical HEAD (file-level: new blocks, themed CSS, scripts, content references; clone already at `~/thin-layer-audit/buildright-eds`).
2. Check what Demo Builder config references it (`block-libraries.json`, `demo-packages.json`).
3. Recommend one of the three options with effort estimates; decide with owner.

## Constraints

- Don't start before the ADR-006 implementation workstream has a working code-patches mechanism — option 1's feasibility depends on it.
- Demo Builder downstream impact: existing buildright-based storefronts pick up template changes on reset.

## Kickoff prompt

> Inventory `skukla/buildright-eds` (clone at `~/thin-layer-audit/buildright-eds`) against canonical `hlxsites/aem-boilerplate-commerce` at the file level (no shared git history — don't use merge-base methods). Classify the customization surface using the categories from `.rptc/research/thin-layer-storefront-evaluation/findings.md`, then recommend retain / rebuild-on-thin-layer / replace per `.rptc/backlog/2026-06-10-buildright-eds-disposition.md`. Context: ADR-006 retired the citisignal forks; this decides whether buildright follows.

## Related work

- ADR-006 (`docs/architecture/adr/006-thin-layer-storefront-customization.md`) — the model buildright would converge to under option 1.
- `.rptc/complete/2026-06-09-storefront-template-sync.md` — dropped sync project whose Phase 3 covered buildright.
- `.rptc/backlog/2026-06-09-dropin-version-coupling.md` — buildright's missing `@dropins/*` pins.
