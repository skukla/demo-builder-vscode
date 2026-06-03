# Build roadmap — Commerce-connect for federated AEM Sites demos

**Filed:** 2026-06-02
**Status:** Roadmap (build sequence). Detailed TDD plans are produced **just-in-time** per slice.
**Design:** [commerce-connection-kit](../backlog/2026-06-02-commerce-connection-kit.md) (mechanism) · [federated-two-instance-demos](../backlog/2026-06-02-federated-two-instance-demos.md) (operator model).

## The model in one line

The AEM SC's *own* extension instance: enter the Commerce demo's **published storefront URL** → **discover** the commerce connection (it's public) → **scaffold `xcom`** in their org → **apply** → **guide** the no-API AEM wiring → author in their AEM Sites. **v1 = 2 repos sharing data;** the later higher-cohesion layer = 3 repos (shared upstream + synced forks) for shared custom code.

## Slices

### Slice 1 — Discover the commerce connection from a published storefront URL ← **first**
- **Goal:** a pure service — URL in → typed `CommerceConnection` out.
- **Scope:** fetch `{url}/config.json`, parse, extract the commerce subset (endpoints + headers).
- **Reuse:** native `fetch()` + `AbortSignal.timeout()` (from `commerceStoreDiscovery.ts`); field names from `configGenerator.ts` / `config-template.json`.
- **Unknowns:** config-service `public.json` vs root `config.json` precedence.
- **Effort:** S. **Plan:** [Slice 1 — discovery](./2026-06-02-commerce-connect-slice1-discovery.md) (ready for TDD).

### Slice 2 — Apply a discovered connection to a target storefront's config
- **Goal:** write a `CommerceConnection` into a storefront's config (`config.json` / Configuration Service).
- **Reuse:** `configGenerator` (produces this exact shape) + `configurationService` (the PUT).
- **Milestone:** after 1–2 you have a *demonstrable* result — URL in → working config out.
- **Effort:** S–M. Plannable in detail now (do after Slice 1 lands).

### Slice 3 — Scaffold `xcom` into the AEM SC's org
- **Goal:** template-copy `adobe-rnd/aem-boilerplate-xcom` into the AEM SC's GitHub org.
- **Reuse:** the repo-from-template machinery (project creation).
- **Unknowns:** auth to the AEM SC's GitHub org; `xcom` template stability/version pinning.
- **Effort:** M. Plan JIT.

### Slice 4 — UI surface + guided AEM wiring
- **Goal:** a "Connect to a commerce demo" surface (Configure and/or dashboard) running discover → apply → scaffold, plus a **guided checklist** for the no-API AEM steps (Code Sync install, Cloud Manager site, IMS roles, UE enablement) with verify affordances.
- **Unknowns:** exact AEM-side step list + verification; where the surface lives.
- **Effort:** M. Plan JIT.

### Slice 5 (deferred) — Higher cohesion: shared upstream + synced forks + custom-code contribution
- **Goal:** the 3-repo model — a shared **upstream** both SCs' repos sync from, so both SCs' custom **blocks** (block library) + **drop-ins** (feature pack) land in one storefront. *(NB: "upstream" ≠ ADR-003 "canonical repo" — see federated doc terminology note.)*
- **Reuse:** `templateSyncService`/`componentUpdater` (sync), block-libraries, `featurePackInstaller`.
- **Unknowns:** the two-way contribution flow; multi-fork sync coordination.
- **Effort:** L. Deferred — v1 doesn't need it. Plan JIT when reached.

## Optional parallel track (not in the main sequence)

- **Harden the shared canvas** (UE-on-DA): promote the existing `demoBuilder.daLive.aemAuthorUrl`/`IMSOrgId` settings (`applyDaLiveOrgConfigSettings`) into a first-class surface. Separate and smaller; delivers the *shared canvas*, **not** the AEM SC's own instance. See the connection-kit doc's "two meanings of connect."

## Future (out of scope here)

- **Product selection** (AEM as a *standalone* product) — the solution-family refactor; a deliberate later bet (connection-kit "Product-flow context").

## Sequencing principle

Detailed TDD plans are written **just-in-time**. Slices 1–2 are concrete now; **3–5 carry real unknowns** (cross-org behavior, the no-API AEM steps, the sync model) and depend on learnings from 1–2 — so they stay roadmap-level until reached, to avoid plan rot.
