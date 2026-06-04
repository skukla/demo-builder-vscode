# Ownership vs connection — the organizing model

> **This doc is the detailed per-product *model* (updated 2026-06-04).** The **direction** it serves — prebuilt packages → a compositional demo builder (owning system + added connected systems) — now has its own north-star home: **[compositional-demo-builder](../compositional-demo-builder.md)** (incl. the slice ladder and the App Builder add-flow). Read that for the *why/where-it's-going*; read **below** for the detailed owned-vs-connected model. The specific *"v1 decisions"* lower in this doc (commerce-hub pulls AEM content; the journey selector; the AEM "spoke") are **superseded** by [storefront-topology](./storefront-topology.md).

**Filed:** 2026-06-03
**Status:** Design (the organizing primitive for the whole feature). Read after [overview](./overview.md); it generalizes [commerce-connection-kit](./commerce-connection-kit.md) and reframes the dashboard work in [aem-sc-first-run](./aem-sc-first-run.md).
**Why this exists:** the federated model quietly assumed *discovery is mandatory*, which forced "every SC must use the extension." That's a lock-in. Making **connection** (not discovery) the primitive removes it and lets one model serve both the federated case **and** a commerce owner who connects outward to Adobe apps that *no one* builds with the extension.

## Two owner archetypes — on one neutral spine

The extension makes an SC the **owner** of a demo via a **creation wizard**. There are two such archetypes:
- **Commerce-SC wizard** (today) → owns a commerce demo.
- **Content-SC wizard** (new — an opportunity to build) → owns an AEM/content demo.

**The owner archetype determines what's *owned*; everything else in the project is *connected*.** So per-product ownership (next section) is mostly *derived from the archetype*, not separately configured — a commerce-owner connects out to content/AEP/App Builder; a content-owner connects out to commerce.

**The connected peer is usually NOT extension-built** — it's the customer's existing external Adobe system, with no readable contract. So **manual entry is the spine; discovery is the lucky special case** (the peer happens to be extension-built / publishes a contract — the *federated* case).

> **Neutrality is a hard constraint.** The federated peer-to-peer case becomes **first-class** eventually, and the whole thing is intended to be offered to **Team** — so the spine must **not lean toward commerce *or* content.** The core never asks "is this commerce?", only "what does this archetype own?"; commerce-hub is merely the first case we *implement*, never a privileged one. Build the seams product-neutral (extend the [ADR-003](../../../docs/architecture/adr/003-multisite-architecture-seam.md) seam; treat commerce as *one* product). **But** neutrality here is *structural/naming* — cheap, reversible — pressure-tested by the *design-all* contracts (sketching the content-owner + federated + AEP/App-Builder shapes is what proves the seam isn't commerce-shaped). It is **not** license to build a plugin framework ahead of its second real user: implement only commerce in v1; keep abstractions thin until the content/federated implementations actually arrive (YAGNI).

## Two axes, both per-product (neither is a project-level "type")

- **Ownership** — *owned*: the extension provisions/manages it (clone, deploy, sync, start). *connected*: the extension only references it via coordinates and never manages it.
- **Population** (of a connection's coordinates) — *manual entry* (the general path) or *discovery* (a convenience, only when the source publishes a readable contract).

"Every SC must use the extension" was an artifact of making *discovery* mandatory. With connection as the primitive and **manual entry first-class**, discovery is an optional accelerator and the partner SC never touches the extension.

**Manual connection already exists today:** the `settings` / Connect Commerce step + Configure UI is manual entry of a commerce connection into `componentConfigs`. Discovery (Slice 1) is a *second* way to populate the same thing — we generalize an existing mode, we don't invent one.

## Scenarios = one machinery, different ownership distribution

| Owner (wizard) | Owns | Connects out to (usually external → **manual**) |
|---|---|---|
| **Commerce SC** (today; first *implemented*) | commerce backend + EDS/DA.live storefront | **AEM (live, v1)** / AEP / App Builder |
| **Content SC** (new wizard; first-class later) | AEM/content storefront (e.g. `aem-boilerplate-xcom`) | commerce backend, AEP, App Builder |
| *either, **federated*** | their owned product | a **peer extension-built** demo → **discoverable** (the special case) |

Two things this table encodes: the connected side is normally an **external, non-extension-built** system (hence manual), and **federated** (the discoverable peer) is one column value, not a separate world.

And it's already partly true today: **the commerce backend is "connected," not owned** ([`adobe-commerce-paas`/`accs` have no `source`](../../../src/features/components/config/components.json); the executor's install list is frontend + dependencies + appBuilder only). "Connected product" is the existing config-only-backend reality, generalized.

## Maps onto the existing model — still no new top-level field

- A connected product = a component in `componentSelections.integrations[]` / `.appBuilder[]` ([`src/types/base.ts:55-61`](../../../src/types/base.ts) — **slots that already exist**) whose coordinates live in `componentConfigs[id]`.
- **Ownership is mostly *derived***: extension scaffolded/cloned/deployed it → owned; only holds coordinates → connected. Where ambiguous, a marker in `componentInstances[id].metadata`. No new schema.
- **Each connected product needs its own connection contract.** Commerce's is built and proven (`configGenerator.ts` ↔ `config-template.json`; the header/env mapping is implemented). AEM (author URL + IMS org), AEP (datastream/sandbox/org), App Builder (runtime URL + creds) each need their own — **the genuinely new design surface** (confidence: low; research items).
- **Discovery is product-specific.** It works for a commerce storefront's published `config.json`; AEP/App Builder likely have *no* discoverable contract → manual-only. This is why manual is the general path.

## The dashboard principle this unlocks (supersedes the "isEds vs isAem" variant fork)

Today the dashboard branches on a **binary `isEds`** (`isEdsStackId` = `eds-` prefix) + `hasMesh`, assuming all non-EDS = headless commerce, with the logic **scattered across ~8-10 files** (`ActionGrid`, `useDashboardActions`, `useDashboardStatus`, `showDashboard`, `typeGuards`, `dashboardHandlers`).

Replace the binary with: **for each product in the composition, render owned-actions or a connected-status card.**
- Owned commerce → Deploy Mesh / Sync / Configure / Author in DA.live.
- Connected commerce → a "commerce connection" status card (reachable? configured? edit) — no management actions.
- Connected AEM → a **functional** content-connection card (v1 / A1). Owned AEM → Author in AEM (later). Connected AEP / App Builder → designed slots (v1).

So the dashboard is **composed per `(product, ownership)`**, not a project-level enum — this *is* the configuration dashboard, and it answers the variant fork better than an enum would. The work: centralize the scattered `isEds` reads into one derived per-product capability.

## v1 decisions (locked 2026-06-03)

- **Anchor: commerce-hub is the first *implemented* case — not a privileged one.** v1 introduces the framework in the **commerce owner's** experience, additive to today's flow, **on a product-neutral spine**. The **content-SC owner wizard** and the **federated peer-to-peer** case are first-class *future* milestones the spine must host **additively** (no rewrite) — so v1 must not bake in commerce-only assumptions even though only commerce + the AEM spoke are built.
- **Contracts: build AEM live, design AEP + App Builder.** The **AEM** spoke is implemented (manual entry → apply → a **functional** connected-AEM card); **AEP / App Builder** stay designed "connect …" slots until built. Plus a **visible journey selector** in v1 (commerce live, content "coming soon").
- **Build includes one live spoke (AEM) — resolved 2026-06-03.** Earlier framing was "framework, no live spoke"; we relaxed "build commerce only" to ship **one functional outbound connection: commerce-owner → AEM content.** **Scoped to a single IMS org** (commerce + AEM co-resident): this clears the org-bound-content auth risk *and* is the precondition for the **shared-storefront** end-state — same-org is also what makes *both* owner experiences extension-buildable. **Design constraint:** A1's storefront-side AEM-content renderer must be a **block-library artifact** (not bespoke extension code) so it can flow through the deferred shared-upstream/synced-fork cohesion model — the runtime *connection* and the build-time *shared storefront* are orthogonal axes that stack.

## Open questions

- **The three spoke contracts** (AEM / AEP / App Builder): exact coordinates, storefront landing spot, and integration behavior. Research each before building it.
- **Owner-archetype representation:** is the archetype derivable from `selectedStack` (the stack already implies the owned product), or does it need an explicit neutral marker? Resolve while keeping the spine product-symmetric.
- **Front-door symmetry:** the journey selector must structurally host commerce / content / federated as peers even while only commerce is lit — without tipping into a built-ahead solution-family framework.
- **Ownership marker:** how far can ownership stay *derived* before a small explicit per-component marker is needed (e.g., a connected commerce backend vs an owned one)?
- **Dashboard refactor depth:** centralize the scattered `isEds` into one per-product capability now (recommended) vs add a second binary and untangle later.
- **Connection health:** what "reachable/configured" means per product for the connected-status card (a HEAD/probe vs presence-of-coordinates).
