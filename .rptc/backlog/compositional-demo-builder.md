# Compositional Adobe demo builder (north star)

**Filed:** 2026-06-04 · **Status:** direction / north-star — *not a single feature*; the umbrella that several features ladder into.

## The shift

**Today:** the extension builds **prebuilt commerce packages** — the SC picks a demo package + stack and gets a predetermined component set (`demo-packages.json` / `stacks.json`). Great for commerce; fixed.

**The direction:** a broader **Adobe demo builder** where the SC composes a demo from **an owning system + the additional systems they choose to connect to it** — instead of receiving a fixed bundle.

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

## Why this is its own entry

The direction is bigger than any one feature — the synced storefront, the App Builder add-flow, and the content-SC wizard all ladder into it. This doc is the **umbrella / north-star**; the entries below it are the concrete, scoped work.

## Pointers

- Detailed per-product model: [ownership-vs-connection](./commerce-connect-aem-sc/ownership-vs-connection.md)
- First feature: [commerce-connect-aem-sc](./commerce-connect-aem-sc/overview.md)
