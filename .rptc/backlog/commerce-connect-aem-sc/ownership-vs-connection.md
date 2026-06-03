# Ownership vs connection — the organizing model

**Filed:** 2026-06-03
**Status:** Design (the organizing primitive for the whole feature). Read after [overview](./overview.md); it generalizes [commerce-connection-kit](./commerce-connection-kit.md) and reframes the dashboard work in [aem-sc-first-run](./aem-sc-first-run.md).
**Why this exists:** the federated model quietly assumed *discovery is mandatory*, which forced "every SC must use the extension." That's a lock-in. Making **connection** (not discovery) the primitive removes it and lets one model serve both the federated case **and** a commerce owner who connects outward to Adobe apps that *no one* builds with the extension.

## Two axes, both per-product (neither is a project-level "type")

- **Ownership** — *owned*: the extension provisions/manages it (clone, deploy, sync, start). *connected*: the extension only references it via coordinates and never manages it.
- **Population** (of a connection's coordinates) — *manual entry* (the general path) or *discovery* (a convenience, only when the source publishes a readable contract).

"Every SC must use the extension" was an artifact of making *discovery* mandatory. With connection as the primitive and **manual entry first-class**, discovery is an optional accelerator and the partner SC never touches the extension.

**Manual connection already exists today:** the `settings` / Connect Commerce step + Configure UI is manual entry of a commerce connection into `componentConfigs`. Discovery (Slice 1) is a *second* way to populate the same thing — we generalize an existing mode, we don't invent one.

## Both scenarios = one machinery, different ownership distribution

| Scenario | Owned | Connected (how) |
|---|---|---|
| **Commerce-hub** (v1 anchor) | commerce backend + EDS/DA.live storefront | AEM / AEP / App Builder — **manual** (partners work in their own tools) |
| **AEM-SC federated** (later) | AEM storefront (xcom) | commerce backend — **discovered** (or manual) |
| **Commerce today** | storefront (+ mesh) | commerce backend — *already* connected (config-only, no `source`, never cloned) |

The third row matters: **even today the commerce backend is "connected," not owned** ([`adobe-commerce-paas`/`accs` have no `source`](../../../src/features/components/config/components.json); the executor's install list is frontend + dependencies + appBuilder only). "Connected product" is the existing config-only-backend reality, generalized.

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
- Owned AEM → Author in AEM. Connected AEP / App Builder → status + edit-connection cards.

So the dashboard is **composed per `(product, ownership)`**, not a project-level enum — this *is* the configuration dashboard, and it answers the variant fork better than an enum would. The work: centralize the scattered `isEds` reads into one derived per-product capability.

## v1 decisions (locked 2026-06-03)

- **Anchor: commerce-hub first.** v1 introduces the connection/ownership framework in the **commerce owner's** experience, additive to today's commerce flow. The AEM-SC federated case is a later milestone on the same primitive.
- **Contracts: design all, build commerce.** Sketch the connection-contract shape for AEM / AEP / App Builder now (coordinates → where they land → what the integration does) to validate the model against 4 products; **build only the commerce contract.** Outbound spokes surface as designed "connect …" slots until each is built.
- **Build = framework, not a functional spoke yet** *(working interpretation — confirm before the detailed v1 plan).* Because commerce is *owned* in the hub scenario, "build commerce" = the framework + commerce's owned representation + its (source) connection contract + the per-`(product, ownership)` dashboard surface — **not** a working commerce→other-app wiring. The first functional spoke follows when a spoke contract is built.

## Open questions

- **The three spoke contracts** (AEM / AEP / App Builder): exact coordinates, storefront landing spot, and integration behavior. Research each before building it.
- **Ownership marker:** how far can ownership stay *derived* before a small explicit per-component marker is needed (e.g., a connected commerce backend vs an owned one)?
- **Dashboard refactor depth:** centralize the scattered `isEds` into one per-product capability now (recommended) vs add a second binary and untangle later.
- **Connection health:** what "reachable/configured" means per product for the connected-status card (a HEAD/probe vs presence-of-coordinates).
