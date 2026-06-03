# Build roadmap — Commerce-connect: connection/ownership model + commerce-hub v1

**Filed:** 2026-06-02 (re-anchored 2026-06-03)
**Status:** Roadmap (build sequence). Detailed TDD plans are produced **just-in-time** per slice.
**Design:** [ownership-vs-connection](./ownership-vs-connection.md) (the organizing model) · [commerce-connection-kit](./commerce-connection-kit.md) (mechanism) · [federated-two-instance-demos](./federated-two-instance-demos.md) (operator model) · [aem-sc-first-run](./aem-sc-first-run.md) (front door / first-run).

## The model in one line

**Connection is the primitive; ownership is a per-product flag.** A connection's coordinates are populated by **manual entry** (general) or **discovery** (convenience, when the source publishes a readable contract) — see [ownership-vs-connection](./ownership-vs-connection.md). One machinery serves both scenarios. **v1 anchors on the commerce-hub** (an *owned* commerce demo that connects *out* to other Adobe apps the partner SCs manage manually); the **AEM-SC federated** case (owned AEM storefront ← discovered commerce) is a later milestone on the same primitive.

**v1 decisions (2026-06-03):** anchor = **commerce-hub first**; contracts = **design all (AEM/AEP/App Builder), build commerce**. Because commerce is *owned* in the hub, "build commerce" delivers the **framework + commerce's owned representation + the per-`(product, ownership)` dashboard surface + designed spoke slots** — *not* a functional commerce→spoke wiring yet (the first spoke follows). *(Working interpretation — confirm before the detailed v1 plan.)*

## Shared connection primitive (built once; every scenario reuses it)

### P1 — Discover a connection from a published source  ← TDD-ready
- **Goal:** a pure service — URL in → typed `CommerceConnection` out (one *population mode*; commerce-storefront-specific).
- **Reuse:** native `fetch()` + `AbortSignal.timeout()`; field names from `configGenerator.ts` / `config-template.json`.
- **Note:** *not* on the commerce-hub critical path (the hub uses manual entry and already owns commerce) — but reusable and ready; build it as the discovery mode and the AEM-SC milestone consumes it.
- **Unknowns:** config-service `public.json` vs root `config.json` precedence.
- **Effort:** S. **Plan:** [discovery](./slice1-discovery.md) (ready for TDD).

### P2 — Apply a connection to a target config
- **Goal:** write a connection's coordinates into a storefront config (`config.json` / Configuration Service) from a **manual or discovered** source.
- **Reuse:** `configGenerator` (emits this shape) + `configurationService` (the PUT); the header↔env-var mapping is already implemented.
- **Effort:** S–M.

## v1 anchor — the commerce-hub experience

### H1 — Connection/ownership model over the existing manifest
- **Goal:** represent a connection as a typed object sourced from `componentConfigs`; **derive ownership** (provisioned → owned; coordinates-only → connected). First instance = commerce's *own* (owned) connection, from today's Connect-Commerce values. **No new top-level field.**
- **Reuse:** `Project.componentSelections.{integrations[], appBuilder[]}`, `componentConfigs` ([`src/types/base.ts:55-63`](../../../src/types/base.ts)) — all existing.
- **Effort:** M.

### H2 — Per-`(product, ownership)` dashboard surface
- **Goal:** centralize the scattered binary `isEds` into one derived per-product capability; render **owned-product actions** + a **Connections** area of **connected-product status/edit cards**. AEM/AEP/App Builder appear as **designed slots** (not yet functional).
- **Touches:** the ~8-10 dashboard files that branch on `isEds` today — centralize, don't duplicate (see [ownership-vs-connection](./ownership-vs-connection.md), "the dashboard principle").
- **Effort:** M–L.

### Design-all (no build): the three spoke contracts
- Sketch the connection contract for **AEM** (author URL + IMS org), **AEP** (datastream/sandbox/org), **App Builder** (runtime URL + creds): coordinates → storefront landing spot → integration behavior. Validates the model against 4 products. **Build none of the spokes in v1.**

## Later milestone — AEM-SC federated (owned AEM storefront ← connected commerce)
- The front-door + AEM-framed flow ([aem-sc-first-run](./aem-sc-first-run.md)): paste URL → **discover** (P1) → **scaffold `xcom`** in their org → **apply** (P2) → guided no-API AEM wiring → author in UE.
- **Reuse:** P1 + P2 + the per-`(product, ownership)` dashboard (H2) + repo-from-template; a new AEM-storefront **frontend** + a **config-only consumed-commerce backend** (clone the ACCS pattern — **not** `external-system`); writes the existing `Project` fields (no new field).
- **Unknowns:** auth to the AEM SC's GitHub org; `xcom` stability/version pinning; the no-API wiring steps; AEM-as-new-`Stack` vs new front-door entry.
- **Effort:** M–L. Plan JIT.

## Deferred — higher cohesion: shared upstream + synced forks + custom-code
- The 3-repo model — a shared **upstream** both SCs' repos sync from, so custom **blocks** (block library) + **drop-ins** (feature pack) land in one storefront. *(NB: "upstream" ≠ ADR-003 "canonical repo" — see federated doc terminology note.)*
- **Reuse:** `templateSyncService`/`componentUpdater`, block-libraries, `featurePackInstaller`.
- **Unknowns:** the two-way contribution flow; multi-fork sync coordination.
- **Effort:** L. Deferred. Plan JIT.

## Optional parallel track (not in the main sequence)

- **Harden the shared canvas** (UE-on-DA): promote the existing `demoBuilder.daLive.aemAuthorUrl`/`IMSOrgId` settings (`applyDaLiveOrgConfigSettings`) into a first-class surface. Separate and smaller; delivers the *shared canvas*, **not** the AEM SC's own instance. See the connection-kit doc's "two meanings of connect."

## Future (out of scope here)

- **Product selection** (AEM as a *standalone* product) — the solution-family refactor; a deliberate later bet (connection-kit "Product-flow context").

## Sequencing principle

Detailed TDD plans are written **just-in-time**. The shared primitive (**P1–P2**) is concrete now; the **commerce-hub anchor (H1–H2)** is plannable after P1–P2; the **AEM-SC milestone** and **higher cohesion** carry real unknowns (the no-API AEM steps, the sync model, the spoke contracts) and stay roadmap-level until reached, to avoid plan rot.
