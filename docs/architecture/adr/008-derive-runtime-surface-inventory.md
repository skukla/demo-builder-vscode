# ADR-008: Derive the Runtime-Surface Inventory from the Boilerplate, Not by Hand

**Status**: Accepted (2026-06-18) — producer half built and in review; consumer wiring pending
**Date**: 2026-06-18
**Decision Maker**: Project Owner (confirmed 2026-06-18)
**Implementer**: Feasibility prototype landed (`scripts/runtime-surfaces/`); producer (drift gate) built in `skukla/eds-demo-patches#1` (B2B ledger); consumer wiring pending.

Related: [ADR-006](006-thin-layer-storefront-customization.md) — the last-known-good (LKG) gate this ADR proposes to extend. Originating bug: the 2026-06 `/customer/nav` silently-dropped-fragment incident.

---

## Context

### The problem

A working EDS demo needs a set of content documents — config spreadsheets, the
nav/footer fragments, customer auth pages, dropin placeholder sheets — that are
**not in the CDN content index** and, for some of them, **not linked from any
copied page**. Content reproduction handles these two ways:

1. **Reference-following discovery** (`copyContentFromSource`) — follows links out
   of copied pages. Reaches *linked* documents (e.g. the `/customer/nav` fragment
   embedded by the account page).
2. **A hand-maintained inventory** (`src/features/eds/services/runtimeSurfaceInventory.ts`)
   — a declared backstop for *orphan* surfaces that nothing links to, so crawling
   can't find them.

The `/customer/nav` bug exposed the failure mode of (1): when discovery's
extraction misses a reference, the surface is silently dropped and the demo ships
with a broken account menu. The fix tightened extraction — but it leaves a
standing question the owner raised directly: **the hand-maintained list in (2) is
exactly the kind of declared artifact that drifts. Can we instead derive a
definitive list from Adobe's boilerplate, so it doesn't need maintaining?**

### What the prototype found

Full findings: `.rptc/research/runtime-surface-derivation/findings.md` (raw run:
`prototype-run-b2b.txt`). A static-analysis prototype (`scripts/runtime-surfaces/`)
was run against a real checkout of `adobe-commerce/boilerplate-b2b-template`
@ `160b453e` — 350 files scanned. Load-bearing facts:

1. **The surfaces live in the boilerplate *code*, not its content.** Orphan
   surfaces are the paths the storefront's JavaScript fetches at runtime:
   `header.js` → `getMetadata('nav')` default `/nav`; `footer.js` → `/footer`;
   `fetchPlaceholders('placeholders/checkout.json')`; `loadFragment('/customer/sidebar-fragment')`;
   dozens of `/customer/*` literals. So "read the boilerplate" means **analyze the
   code**, not the published pages.
2. **Derivation re-derived 14 of the 18 hand-declared surfaces** with zero human
   input.
3. **The hand list is already incomplete.** Derivation found **9 surfaces the
   inventory misses** — including `/customer/sidebar-fragment`, a *code-loaded*
   fragment that nothing in content links to (the `/customer/nav` bug shape,
   latent right now), `/customer/orders`, and seven B2B placeholder sheets
   (`placeholders/company`, `/pdp`, `/purchase-order`, `/quick-order`,
   `/quote-management`, `/requisition-list`, `/search`).
4. **The 4 it can't derive split into two gap classes.** Three are **platform
   conventions** (`/metadata`, `/redirects`, `/sitemap`) — served by Helix itself,
   referenced *nowhere* in the storefront repo, so no scan of that repo can derive
   them (irreducible residual). One (`/customer/create-account`) is **content-linked**
   — reachable by the existing crawl, or it stays in the residual.
5. **Most early misses were prototype narrowness, not a limit of the method.** A
   one-character pattern fix (allow the `.json` suffix real code uses) moved
   agreement from 5 → 14. The genuinely irreducible residual is small and stable.

---

## Decision

**Replace the hand-maintained runtime-surface inventory with a derived-plus-residual
model**, reconciled by a drift gate:

1. **Derive** the code-fetched surfaces by static analysis of the pinned
   boilerplate checkout — the large majority, including the surfaces the hand list
   currently misses.
2. **Declare** a tiny explicit residual for what derivation provably cannot see:
   the three Helix **platform conventions** (`/metadata`, `/redirects`, `/sitemap`)
   and any content-only entry points. This residual is small, stable, and
   documented as *why* each entry can't be derived — not a general-purpose dumping
   ground.
3. **Reconcile** the two with a **drift check in the ADR-006 LKG gate**. That cron
   job already clones canonical daily; the same run regenerates the derived set
   from the pinned commit and, when it diverges from what's committed, **opens a PR**
   with the diff and provenance (file:line for every surface) for a human to merge.
   One writer, many readers — identical to how the LKG pointer already works.

The inventory thus becomes a **generated artifact + a justified residual**, tied to
the exact boilerplate commit storefronts build from, regenerated mechanically, and
never silently stale.

### Why the boilerplate version makes this tractable

Per ADR-006, storefronts build from a pinned last-known-good canonical commit. So
the derived inventory is derived **from that same commit** — it is always in sync
with the boilerplate we actually ship, and the drift gate's "boilerplate moved"
signal is the *same* signal that advances the LKG pointer. The two mechanisms share
a clock.

### How it composes with the existing safeguards

This does not replace either existing mechanism — it strengthens the backstop:

- Reference-following discovery still handles linked surfaces at copy time.
- The derived+residual inventory still seeds orphan surfaces into the copy.
- A post-copy outcome check (discussed alongside this work) can assert the derived
  required surfaces actually landed — and because the derived set now *includes*
  `/customer/sidebar-fragment` and the B2B sheets, that check covers surfaces the
  hand list never knew about.

---

## Why not the alternatives

- **Keep the pure hand list.** Rejected by the data: it misses 9 surfaces *today*,
  including a latent `/customer/nav`-class orphan. It duplicates information that
  already lives authoritatively in the boilerplate, and depends on a developer
  remembering to update it when Adobe changes the storefront.
- **Pure derivation, no residual.** Insufficient: it provably cannot see the three
  Helix platform conventions (referenced nowhere in the storefront repo) or
  content-only entry points. A small declared residual is unavoidable — the goal is
  to *minimize and justify* it, not eliminate it.
- **Runtime observation (headless browser, capture every content request).** The
  most definitive method — the storefront itself reveals what it fetches, including
  dynamically-built paths a static scan misses. Rejected as the *primary* mechanism
  for now: it needs auth and flow-exercising (you only see account fetches if you
  log in and navigate), it's heavy and network-bound, and it realistically becomes a
  periodic regenerate job rather than a per-build step — which is what the LKG gate
  already is. Retained as a **future enhancement** to close the static residual
  (see below), not as step one.
- **Parse content metadata to resolve overridable paths.** `/nav` and `/footer` are
  metadata-overridable (the code literal is only the default). Fully resolving them
  needs the content's `<meta>`, not the code. Out of scope for the static
  derivation; the default literal is correct for canonical demos and the residual
  covers exceptions.

---

## What this ADR does not decide

- **The inventory's on-disk format** (generated JSON vs. generated TS module vs.
  committed-with-residual-merged) and how `runtimeSurfaceInventory.ts` consumes it.
- **Where the generator runs in production** — almost certainly the
  `skukla/eds-demo-patches` gate (ADR-006), but the port from prototype `.mjs` to
  the gate's shell/CI is implementation work.
- **Multi-boilerplate coverage.** The prototype validated the B2B template only.
  Canonical (`hlxsites/aem-boilerplate-commerce`) and other templates need their own
  runs; the gate is already multi-canonical, so the structure exists.
- **Whether runtime observation is added** to close the static residual, and if so
  how it's driven.
- **The PR-vs-fail policy** when derived ≠ committed (mirror ADR-006's
  propose-a-PR-for-a-human default, presumably).

---

## Consequences

### Positive

- **The inventory stops drifting silently.** It regenerates from the pinned
  boilerplate; divergence becomes a PR, not a latent bug.
- **It immediately fixes a real, present incompleteness** — 9 missing surfaces,
  including a latent orphan fragment of exactly the bug class that started this.
- **Provenance for free.** Every derived surface carries a `file:line`, so review of
  a regeneration PR is mechanical: you can see *why* each path is required.
- **Reuses existing infrastructure.** No new daily job, no new clock — it rides the
  ADR-006 LKG gate.
- **The residual is small, explicit, and self-documenting** about why each entry
  resists derivation — far more reviewable than a flat list of 18.

### Negative

- **A new generator to own**, and a residual that still needs the occasional human
  judgement (a new platform convention, a new content-only entry point). Smaller and
  rarer than maintaining the whole list, but non-zero.
- **Static analysis has a residual blind spot** (dynamically-constructed paths,
  metadata overrides). Bounded and understood, but it means "derived" is not
  "provably complete" without runtime observation.
- **The gate's surface area grows.** More logic in the LKG job means more that can
  break the daily run; it must degrade to "don't advance, log loudly" like the rest
  of the gate.

### Neutral

- **The prototype is throwaway-ish.** It lives in `scripts/runtime-surfaces/` with
  its own `node:test` suite; productionizing means porting the extractor into the
  gate, not shipping the `.mjs` as-is.
- **Reference-following discovery is unchanged** — this hardens the orphan backstop,
  not the link crawler.

---

## Implementation status

| Step | Status | Notes |
|---|---|---|
| Feasibility prototype + unit tests | **Landed** | `scripts/runtime-surfaces/deriveRuntimeSurfaces.mjs` (+ `.test.mjs`, 7 tests, `node:test`); README documents run/scope |
| Empirical validation against real B2B boilerplate | **Done** | `.rptc/research/runtime-surface-derivation/findings.md` — 14/18 re-derived, 9 hand-list gaps found |
| Live-source verification of the 9 derived-only surfaces | **Done** | all 8 added to the inventory (`/customer/sidebar-fragment` + 7 B2B sheets) confirmed `200` on `main--boilerplate-b2b--adobe-commerce.aem.live` — previously silently dropped |
| Stop-gap: add the missing orphans to the hand list | **Landed** | `runtimeSurfaceInventory.ts` (+ `.plain.html` probe fix for `/customer/*`) — keeps demos correct until the consumer half flips to the generated file |
| Owner acceptance | **Confirmed** | 2026-06-18 |
| Producer: surface drift gate in the ADR-006 LKG gate | **In review** | `skukla/eds-demo-patches#1` — `derive-surfaces.mjs` + per-ledger check + `lkg/surface-drift` PR flow; B2B ledger seeded (`b2b/runtime-surfaces.json`). Other ledgers (citisignal/custom) pending their own seed |
| Consumer: wire `runtimeSurfaceInventory.ts` to fetch derived + residual | **Not started** | extension fetches `runtime-surfaces.json` like patches + LKG; merge `derived ∪ residual`, retire the hand-maintained bulk |
| Optional: runtime-observation pass to shrink the static residual | **Not started** | future enhancement |

---

## Cross-References

- **Empirical basis**: `.rptc/research/runtime-surface-derivation/findings.md` (+ `prototype-run-b2b.txt`)
- **Prototype**: `scripts/runtime-surfaces/` (`deriveRuntimeSurfaces.mjs`, `deriveRuntimeSurfaces.test.mjs`, `README.md`)
- **Producer (drift gate)**: `skukla/eds-demo-patches#1` — `scripts/derive-surfaces.mjs`, the per-ledger check in `scripts/lkg-gate.sh`, `b2b/runtime-surfaces.json`, and the `lkg/surface-drift` PR step in `.github/workflows/lkg-gate.yml`
- **Current hand list**: `src/features/eds/services/runtimeSurfaceInventory.ts`
- **Discovery + orphan seeding**: `src/features/eds/services/daLiveContentOperations.ts` (`copyContentFromSource`, reference-following)
- **Production home for the gate**: `skukla/eds-demo-patches` (`scripts/lkg-gate.sh`) per ADR-006
- **Subject boilerplate**: `adobe-commerce/boilerplate-b2b-template` @ `160b453e`
