# Compositional Adobe demo builder (north star)

**Filed:** 2026-06-04 · **Status:** direction / north-star — *not a single feature*; the umbrella that several features ladder into.

## The shift — packages *within* composition (not instead of)

**Retain prebuilt packages.** Commerce already has them (`demo-packages.json` / `stacks.json`): curated, brand-themed starting bundles (Isle5, CitiSignal, …). They stay — **a package *is* a curated composition** (a preset of owning system + components + brand/content), not the thing we move away from.

**Two additions make packages compositional:**
1. **Extensible** — beyond the package's preset, the SC can **add connected systems** (App Builder instances, AEP, …) to the demo.
2. **Mirrored across owning systems** — the same demo identity (e.g. "CitiSignal") is pickable from **both** the commerce wizard and the content wizard, producing **aligned** demos. When a Commerce SC and a Content SC each pick the mirrored package, their storefronts **share brand/design by construction** — exactly what the synced-storefront flow ("two identical-looking sites") needs, with **no manual coordination.** The package defines the **shared look**; each SC authors their **own content** within it; the compositional layer lets either **add systems** on top.

So the chosen mirrored package effectively **defines the shared upstream's identity** for the synced-storefront feature.

## The model (one line)

A demo = **one owning system** (what the creation wizard provisions and manages) **+ N connected systems** (other Adobe products the demo references and talks to). Ownership is per-product and mostly *derived*. Detailed model: [ownership-vs-connection](./commerce-connect-aem-sc/ownership-vs-connection.md).

- **Owning systems** (creation wizards): **commerce** (today), **content / AEM** (next).
- **Connected systems** the SC adds: **App Builder instances** (API Mesh, the Commerce Prerenderer), **AEP**, other commerce/content backends — each with its own connection contract.

It maps onto the **existing** project model — `componentSelections.{integrations[], appBuilder[]}` + `componentConfigs` ([`src/types/base.ts`](../../src/types/base.ts)) — so each slice is **additive over slots that already exist**, not a framework rebuild.

## The ladder (slices that build toward it)

1. **Synced storefront** — *first instance.* An owning system (each SC's storefront) + a connected commerce backend + optional per-fork App Builder apps, across two orgs. Proves the model in one slice. → [commerce-connect-aem-sc](./commerce-connect-aem-sc/overview.md)
2. **App Builder add-flow** — a wizard step to **specify App Builder instances to add to a demo** (mesh, Commerce Prerenderer), as a surface over the existing `appBuilder[]` slot. The first place "add a connected system" becomes a real UI.
3. **Content-SC wizard** — the second owning-system archetype.
4. **More connected systems** (AEP, …) — each its own connection contract, added as real demand appears.

## Guardrails

- **Neutral spine** — the core asks "what does this archetype *own*?", never "is this commerce?" Commerce is the first owning system *implemented*, not a privileged one.
- **YAGNI on the general composer** — do **not** build a generic plugin/composition framework ahead of its second real user. Each slice extends existing slots; abstractions stay thin until a second implementation actually arrives.
- **One owning system per demo** for now; multi-owner composition is a later question.

## Open design questions

- **Mirroring mechanism:** **paired packages** (a commerce + a content package per identity, kept in sync by curation) vs **one package definition both wizards consume** (each takes its slice — mirror *by construction*, no drift). Lean: the single shared definition; likely an extension of `demo-packages.json`.
- **Curation cost:** each demo identity now needs a **content side** (AEM-authorable themed content + matching design) alongside the commerce side. Who authors/maintains the mirror.
- **Package ↔ upstream:** does selecting a mirrored package *seed* the shared upstream (the synced-storefront code/design), or just configure two aligned forks? (Ties package selection to [storefront-topology](./commerce-connect-aem-sc/storefront-topology.md).)

## Why this is its own entry

The direction is bigger than any one feature — the synced storefront, the App Builder add-flow, and the content-SC wizard all ladder into it. This doc is the **umbrella / north-star**; the entries below it are the concrete, scoped work.

## Pointers

- Detailed per-product model: [ownership-vs-connection](./commerce-connect-aem-sc/ownership-vs-connection.md)
- First feature: [commerce-connect-aem-sc](./commerce-connect-aem-sc/overview.md)
