# Build roadmap — Commerce-connect: connection/ownership model + commerce-hub v1

**Filed:** 2026-06-02 (re-anchored 2026-06-03)
**Status:** Roadmap (build sequence). Detailed TDD plans are produced **just-in-time** per slice.
**Design:** [ownership-vs-connection](./ownership-vs-connection.md) (the organizing model) · [commerce-connection-kit](./commerce-connection-kit.md) (mechanism) · [federated-two-instance-demos](./federated-two-instance-demos.md) (operator model) · [aem-sc-first-run](./aem-sc-first-run.md) (front door / first-run).

## The model in one line

**Connection is the primitive; ownership is a per-product flag.** A connection's coordinates are populated by **manual entry** (general) or **discovery** (convenience, when the source publishes a readable contract) — see [ownership-vs-connection](./ownership-vs-connection.md). One machinery serves both scenarios. **v1 anchors on the commerce-hub** (an *owned* commerce demo that connects *out* to other Adobe apps the partner SCs manage manually); the **AEM-SC federated** case (owned AEM storefront ← discovered commerce) is a later milestone on the same primitive.

**v1 decisions (2026-06-03):** anchor = **commerce-hub first** (the first *implemented* case, **not** privileged). Contracts: **build the AEM spoke live (A1), design AEP + App Builder** (designed slots). V1 also ships a **visible journey selector (H3)** — commerce live, content "coming soon." So **v1 = framework (H1) + per-`(product,ownership)` dashboard (H2) + journey selector (H3) + one live outbound spoke (A1: commerce→AEM) + the shared primitive (P1/P2)**, all on a product-neutral spine.

**Neutrality is a hard constraint.** Build the spine product-symmetric (extend the [ADR-003](../../../docs/architecture/adr/003-multisite-architecture-seam.md) seam; the core asks "what does this archetype own?", never "is this commerce?"). The **content-SC owner wizard** and the **federated peer-to-peer** case become **first-class** later (Team-facing) and must drop in additively. But keep neutrality structural/naming, not a built-ahead framework — implement only commerce in v1 (YAGNI). See [ownership-vs-connection](./ownership-vs-connection.md), "two owner archetypes."

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
- **Goal:** centralize the scattered binary `isEds` into one derived per-product capability; render **owned-product actions** + a **Connections** area of **connected-product status/edit cards**. The **AEM** card is **functional** (A1); **AEP / App Builder** appear as **designed slots** (not yet functional).
- **Touches:** the ~8-10 dashboard files that branch on `isEds` today — centralize, don't duplicate (see [ownership-vs-connection](./ownership-vs-connection.md), "the dashboard principle").
- **Effort:** M–L.

### A1 — The AEM spoke (the one live outbound connection)
- **Goal:** make the commerce owner's storefront consume **AEM-authored content/assets** — the first *functional* outbound connection. Define the **AEM connection contract** (author/publish URL + IMS org), capture it via **manual entry** (AEM is external / not-extension-built → **not discoverable**), **apply** (P2) into the storefront config, and render a **functional** connected-AEM card (status/edit) via H2.
- **Direction note:** this is **commerce-owner → AEM content** (the hub *consuming* AEM). It is *distinct* from the later content-SC milestone, which is **AEM-as-owned**. Same product, opposite ownership — the AEM contract must cover both directions.
- **Reuse:** P2 apply; the manual-entry mechanism (generalized from Connect-Commerce); the connected-product card from H2.
- **Unknowns (this is why AEM carries risk):** research established the **commerce backend is org-agnostic to consume, but AEM content / code-bus is org-bound** — consuming AEM content across orgs may require a same-org AEM or hit auth limits; **re-verify live before building.** Also: how much of the storefront-side rendering (an EDS block fetching AEM content) is extension work vs block-library/storefront work.
- **Effort:** M (capture+apply is contained; the cross-org + storefront-render unknowns are the risk). Plan JIT after P1/P2/H1.

### H3 — Journey selector (front door)
- **Goal:** a **visible front door** where the user picks a journey — **commerce live**, **content "coming soon"** (a designed entry, not functional). Makes the neutral, multi-journey identity visible to Team in v1.
- **Constraint:** a **thin UI surface** routing to the existing commerce wizard — **not** a solution-family framework. The content entry is a placeholder; the content-SC wizard is the later milestone. (Journey = owner archetype.)
- **Reuse:** existing project-creation entry point.
- **Effort:** S–M.

### Design (no build): AEP + App Builder contracts
- Sketch the connection contract for **AEP** (datastream/sandbox/org) and **App Builder** (runtime URL + creds): coordinates → storefront landing spot → integration behavior. Surface as **designed slots** (non-functional cards). Validates the model against the remaining products. *(AEM is built — see A1.)*

## First-class later — the content-SC owner archetype (+ federated)
- **A second owner wizard** (peer to today's commerce wizard): a content SC **owns** an AEM/content demo (e.g. `aem-boilerplate-xcom`). This *lights up the content entry* H3 ships as "coming soon" — built on the *existing* `selectedStack`/`componentSelections`/registry model, **not** a solution-family refactor.
- **Distinct from v1's A1:** A1 is commerce-owner *consuming* AEM content; here AEM is **owned** and *consumes commerce*. The AEM contract from A1 informs this, but the ownership (and the no-API wiring) is new.
- **Federated** is then one connection value: the content owner connects to commerce that's **discoverable** (peer extension-built, via P1) *or* manual — the AEM-framed flow in [aem-sc-first-run](./aem-sc-first-run.md): paste URL → discover (P1) → scaffold `xcom` → apply (P2) → guided no-API AEM wiring → author in UE.
- **Reuse:** P1 + P2 + the per-`(product, ownership)` dashboard (H2) + repo-from-template; a new AEM-storefront **frontend** + a **config-only consumed-commerce backend** (clone the ACCS pattern — **not** `external-system`); writes existing `Project` fields (no new field).
- **Unknowns:** auth to the content SC's GitHub org; `xcom` stability/version pinning; the no-API wiring steps; AEM-as-new-`Stack` vs new front-door entry; how symmetric the front door must be at this point vs later.
- **Effort:** L. Plan JIT.

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

Detailed TDD plans are written **just-in-time**. The shared primitive (**P1–P2**) is concrete now; the **commerce-hub anchor (H1–H2–H3)** is plannable after P1–P2; the live **AEM spoke (A1)** is plannable after H1/H2 but carries the cross-org unknown (re-verify live first); the **content-SC milestone** and **higher cohesion** carry real unknowns (the no-API AEM steps, the sync model) and stay roadmap-level until reached, to avoid plan rot.
