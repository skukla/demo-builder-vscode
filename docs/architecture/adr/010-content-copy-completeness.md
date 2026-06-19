# ADR-010: Content-Copy Completeness — Follow Document References So Unindexed Fragments Aren't Silently Dropped

**Status**: Accepted
**Date**: 2026-06-19
**Decision Maker**: Project Owner
**Implementer**: 2026-06-12 (content-copy reference-following + completeness audit); account-chrome overlay same slice

Related: [ADR-008 Derive the Runtime-Surface Inventory](008-derive-runtime-surface-inventory.md) (the code-derived inventory / drift gate — the *prevention* layer this fix's bug class motivated), [ADR-009 Storefront config.json Flag Injection](009-storefront-config-flag-injection.md) (the *other half* of making the B2B account nav appear), [ADR-006 Thin-Layer Storefront Customization](006-thin-layer-storefront-customization.md).

---

## Context

### The problem — the "silently-dropped content" bug class

On create/reset, the pipeline copies a storefront's authored content from a
canonical DA.live source to the user's site. That copy was driven by the source's
**content index**. But the index does **not** list every document a storefront
needs at runtime: notably **fragment documents** (the account left-nav
`/customer/nav`, footer, etc.) and some referenced pages are absent from it.

So any document that exists only because another document *references* it was
**silently dropped** — copied content looked complete (no error), but at runtime
the reference resolved to nothing. The concrete incident: the B2B account page
embeds the `/customer/nav` fragment, which wasn't indexed, wasn't copied, and the
account menu rendered empty. The failure is invisible at copy time (the page still
loads) which is what makes the class dangerous.

This is the *content* half of the empty-B2B-nav investigation; ADR-009 is the
*config* half. Both had to be right for the nav to appear: the flag enables the
nav machinery, and this fix guarantees the nav's content is actually present.

### Why references, not just the index

EDS authored content references other documents two ways, and the index captures
neither reliably:

1. **Anchor hrefs** — ordinary links / link-style fragment references.
2. **The EDS fragment-block convention** — a `<div class="fragment">` whose cell
   text *is* the path, with no `<a>`, e.g.
   `<div class="fragment"><div><div>/customer/nav</div></div></div>`.

The account nav uses form (2), authored as a bare text path — exactly the kind the
index misses.

## Decision

Copy by **following references**, not by trusting the index alone, and **audit
completeness after** the copy.

- `daLiveContentOperations.extractInternalReferences` extracts internal,
  site-relative references from each copied page's authored HTML — from anchor
  hrefs **and** from the fragment-block convention (a regex scoped to
  `class="fragment"` blocks so it stays precise to the convention and doesn't
  over-discover stray paths). It drops `#anchors`, `./relatives`, and external/
  `mailto:` targets.
- The copy loop accumulates these into a `discoveredPaths` set and **drains it** —
  pulling referenced documents (e.g. `/customer/nav` and any sub-fragments) from
  the canonical source, no fork required.
- A **post-copy completeness audit** reports references that were discovered but
  never landed, so a future drop surfaces as a logged warning instead of a silent
  empty UI.
- For **branded forks** whose own content legitimately lacks the B2B account pages
  (e.g. CitiSignal), an **account-chrome overlay** (`overlayAccountChrome`, driven
  by a package's `accountContentSource`) copies just the `/customer/*` auth/account
  pages and the `/customer/nav` fragment from the canonical B2B content site after
  the brand content is copied. Same reference-following machinery, second source.

## Alternatives considered (ruled out)

1. **Trust the content index** (status quo) — ruled out: it's the bug. The index
   omits fragments and reference-only documents by design.
2. **Hardcode a list of "always copy these" paths** (e.g. always copy
   `/customer/nav`) — ruled out: brittle and per-brand; it doesn't generalize to
   the next unindexed reference, and it rots as the boilerplate evolves. (The
   durable, code-derived version of "what surfaces must exist" is ADR-008's
   inventory — a *separate, complementary* layer; this ADR is about resolving
   references that actually appear in the copied content.)
3. **Discover any bare path anywhere in the HTML** — ruled out: over-discovers
   stray paths. Scoping to the `fragment`-block convention keeps it precise.

## Evidence (gathered 2026-06)

- Live finding: the B2B account menu is the `/customer/nav` fragment, referenced by
  the account page via the fragment-block convention, and absent from the content
  index (`.rptc/research/content-copy-completeness`,
  `docs/research` lineage; commit `ac280dc8`).
- After the fix, create/reset copy `/customer/nav` from canonical and the
  completeness audit reports zero dropped references for the B2B account chrome.

## Consequences

### The nav needs both halves

Flag (ADR-009) + content (this ADR) together make the B2B account nav appear.
Either missing yields an empty nav, and both fail *silently* — which is why both
now have an audit/guard rather than relying on visual QA.

### Relationship to ADR-008 (no overlap)

- **This ADR (010)** resolves references that *appear in copied content* at
  copy time — a runtime behavior of the copy pipeline.
- **ADR-008** derives, from the boilerplate code, the *inventory* of surfaces a
  storefront must have, and gates drift in `eds-demo-patches` (the "daily check").
  It's the prevention layer: it catches a *new* required surface the upstream
  boilerplate introduces before it can be silently dropped.

Together: reference-following copies what the content points at; the inventory/drift
gate catches what the *code* needs that the content might not point at yet.

### Precision is load-bearing

The fragment-block regex is intentionally scoped to `class="fragment"` blocks.
Loosening it to "any bare path" would over-copy and could pull unintended
documents; tightening it further could miss the convention. The scoping is the
contract — keep the regex and its test fixture in sync if the boilerplate's
fragment authoring convention changes.

### Accepted residual

Reference-following only reaches documents that are *referenced from copied
content*. A runtime-only surface that nothing in the copied content references
(loaded purely by code) is not discoverable this way — that gap is exactly what
ADR-008's code-derived inventory exists to close.
