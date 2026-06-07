# Step 4: Repoless Satellite Site Creation — the general primitive (content flow is its first caller)

**Status: 🟡 Primitive + satellite registration shipped (2026-06-06).**
- ✅ `supportedFlows` config gate (2026-06-04) — 116 template/alignment tests green.
- ✅ **`resolveSiteCodeSource`** primitive (pure; gates on `upstream`, not `flow`) — 4/4 unit tests; multisite-shape guards included.
- ✅ **Dedicated satellite branch** `executeSatelliteSetup` in `storefrontSetupPhases.ts` (early-return; canonical pipeline byte-identical) + `upstream` threaded into `edsConfig` + `registerConfigurationService` exported/reused. Satellite: **no fork, no Code Sync, no CDN code preview, cross-org `registerSite`** (`code.owner` = upstream, `org/site` = joiner's DA.live). 4/4 integration (incl. canonical regression characterization) + 86/86 storefront-setup suite + eslint/tsc/SOP green.
- **Architectural finding (logged):** a satellite's **site identity** (`daLiveOrg/daLiveSite`) is **decoupled** from its **code source** (upstream); the canonical pipeline conflates them (repo == site). So satellite **content population** (Helix preview/publish must target the satellite's site, not the upstream) is a **separate increment**, not the existing content pipeline run as-is.
- **Remaining:** (a) satellite content population (Phase 5b for the satellite's own site identity); (b) executor Phase 5 (`config.json`→GitHub) gated off for satellites; (c) persist `flow`/`upstream` on the saved content project; (d) thread `upstream` from the join descriptor into the wizard→`edsConfig` payload (F5 path).

> **2026-06-05 repivot + 2026-06-06 mechanic lock + 2026-06-06 multisite-alignment:** The config gate (`supportedFlows`) survives unchanged. The locked satellite-creation mechanic is the Adobe-native repoless one (Option B), and — per the multisite-alignment decision below — it is built as a **general primitive**, not a content-flow special case.
>
> **A repoless satellite is any site whose code references an *existing* repo it did not just create.** The extension creates it with a single cross-org-capable Configuration Service registration:
> ```
> PUT /config/{org}/sites/{site}.json
>   code:    { owner: <codeOwner>, repo: <codeRepo> }   ← a referenced repo, not a fresh fork
>   content: { source: { url: <site's content source>, type: 'markup' } }
> ```
> For a satellite the extension **does NOT** fork (`createFromTemplate`), install the AEM Code Sync App, run code-sync verification, or push `config.json` to the code repo. Code Sync lives only on the **canonical** repo (the one whose `org/site` matches `owner/repo`); the satellite reads that repo's code through the `code` reference. Verified live 2026-06-05 (HTTP 201 + 45s propagation — [architecture-validation](../../research/2026-06-05-architecture-validation.md)).

## Multisite alignment (why this is a *general* primitive — see [ADR-003](../../../docs/architecture/adr/003-multisite-architecture-seam.md))

The repoless-satellite mechanism this step builds is **the same primitive multisite needs.** ADR-003 (Multisite Architecture Seam, Accepted/deferred) defines multisite as *one repo → many `aem.live` sites*, each its own Configuration Service registration. The **content satellite** (Slice 1) is the **cross-org** instance (`code.owner` = a different org); **multisite** (future) is the **same-org, multi-env** instance (`code.owner` = your own canonical). One primitive, two callers.

**This step trips ADR-003's own trigger criterion #4** — *"an RPTC cycle proposes touching `buildSiteConfigParams` / `registerSite` in a way that would benefit from the multi-env shape."* The response is **not** to implement full multisite (heavy 5-step lift; YAGNI until a customer asks), but to honor ADR-003's two disciplines so the seam is multi-env-ready:

- **Function-signature discipline (already satisfied):** `buildSiteConfigParams(repoOwner, repoName, daLiveOrg, daLiveSite)` is already fully parameter-driven. We **reuse it unchanged**, passing the referenced repo as the code coords. ADR-003's future list variant (`buildSiteConfigParamsForEnvironments → SiteRegistrationParams[]`) is added *alongside* it later; our single-satellite call is the n=1 case.
- **Gate on "code reference", not "content flow":** the satellite decision keys on the **presence of an `upstream` code reference**, not on `flow === 'content'`. The content flow is one caller that supplies an upstream; future multisite is another caller that supplies same-org per-env coords. Gating on the code reference is what keeps the primitive general.

**Down-payment on multisite:** once this ships, ADR-003's deferred *"Step 2 — Config Service per-env registration"* is mostly done — the "register a site whose code lives in a referenced repo" path exists and is tested. Multisite then needs only the env **loop** (`Promise.all(envs.map(registerSite))`) and the load-bearing **Step 1 state migration** (`environments` map) — not a re-derivation of the registration mechanic.

**What this step does NOT build (YAGNI / ADR-003 deferral):** the per-env list variant, the `environments` state map, per-env mesh, per-env preview URLs. Single-satellite primitive only.

## The primitive: `resolveSiteCodeSource(edsConfig)`

A small **pure function** (no class, no registry — "neutral but thin") that decides a site's code source:

```ts
type SiteCodeSource = { codeOwner: string; codeRepo: string; createRepo: boolean };

resolveSiteCodeSource(edsConfig): SiteCodeSource
//  canonical (no upstream):  { codeOwner: githubOwner, codeRepo: repoName,        createRepo: true  }
//  satellite (has upstream): { codeOwner: upstream.owner, codeRepo: upstream.repo, createRepo: false }
```

`createRepo` gates Phase 1's fork; `codeOwner/codeRepo` feed `buildSiteConfigParams` in Phase 3. The content flow makes it a satellite by carrying an `upstream`; the commerce flow (no upstream) stays canonical and byte-identical to today. A future multisite caller produces a satellite with a same-org `codeOwner` — the same shape.

**Purpose:** Make site creation honor `resolveSiteCodeSource`: a **canonical** site forks + installs Code Sync + registers (today's behavior, unchanged); a **satellite** skips all of that and does one cross-org-capable `registerSite` against the referenced repo, plus DA.live content. Three config facts still hold:

- **No mesh — by config.** Mesh is `optionalDependencies` in `stacks.json`; the content path omits it and `executeMeshPhase` already no-ops. Nothing to skip.
- **Backend by URL — not provisioned.** Backend is coords in seeded config (Step 5), consumed by `configGenerator`. Nothing to skip.
- **Code source is a reference, not a fork** — expressed by `resolveSiteCodeSource` returning `createRepo: false`.

**Prerequisites:**
- [ ] Steps 1 (flow/upstream), 2 (join resolve seeds `upstream` + coords), 3 (filtering)
- [ ] `buildSiteConfigParams` / `registerSite` understood — already separate the lookup key (`org`/`site`) from the code source (`codeOwner`/`codeRepo`); reused unchanged
- [ ] ADR-003 read — the multi-env shape this primitive must not foreclose
- [ ] `executeStorefrontSetupPhases` understood — Phase 1 forks, Phase 3 registers; the satellite path takes neither the fork nor code-sync
- [ ] **Org-level repoless prerequisite (one-time, not per-site):** each `aem.live` org needs a matching `github.com` org with at least one Code-Sync-synced "anchor" repo (the `kukla-demos/anchor` pattern). A preflight (Risk 3), separate from per-satellite creation.

---

## Reuse map (satellite path)
- **`buildSiteConfigParams` + `registerSite`** — reused **unchanged**; the satellite passes the referenced repo as code coords → cross-org `code.owner`. ADR-003-aligned (parameter-driven).
- **`stacks.json` dependency set / `executeMeshPhase`** — content omits mesh → existing no-op. No imperative skip.
- **`configGenerator.generateConfigJson`** — unchanged; direct backend URL when no mesh.
- **`ensureEdsContent`** (Phase 5b) — unchanged; sets up the site's own DA.live content.
- **NOT reused for a satellite:** `createFromTemplate` (no fork), the GitHub Code Sync App install check, code-sync verification, the Phase 5 `config.json`-push. These remain for the canonical path + the manual fork-and-own escape hatch.
- **Net-new:** `resolveSiteCodeSource` (the one pure primitive) + the orchestration honoring `createRepo` / code coords. Gated so a canonical (no upstream) is byte-identical to today.

---

## Tests to Write First

### Unit: `tests/.../resolveSiteCodeSource.test.ts` (the primitive)
- [ ] **No upstream → canonical** — `{ codeOwner: githubOwner, codeRepo: repoName, createRepo: true }`.
- [ ] **Upstream present → satellite** — `{ codeOwner: upstream.owner, codeRepo: upstream.repo, createRepo: false }` (cross-org: `upstream.owner` ≠ `githubOwner`).
- [ ] **Decision keys on `upstream`, not `flow`** — an upstream with `flow` absent still resolves to a satellite (the primitive is flow-agnostic; multisite-forward-compat).
- [ ] **Same-org upstream still a satellite** — `upstream.owner === githubOwner` → `createRepo: false` (the multisite shape; documents that the primitive already supports it).

### Integration: `tests/.../storefrontSetupPhases-repoless.test.ts` (the seam honors it)
- [ ] **Satellite registers cross-org** — upstream present → `registerSite` called with `codeOwner = upstream.owner`; `org`/`site` = the site's own DA.live.
- [ ] **No fork / no code-sync for a satellite** — `createFromTemplate` and the App-install / code-sync verification NOT invoked.
- [ ] **No GitHub config-push for a satellite** — Phase 5 `config.json`→repo NOT invoked; DA.live content (Phase 5b) DOES run.
- [ ] **Canonical (no upstream) unchanged** — fork + code-sync + Phase 5 all run; `registerSite` uses `githubOwner` (regression).

### Config: `tests/.../stacks-supportedFlows.test.ts` ✅

---

## Files to Create/Modify
- [ ] **New:** `resolveSiteCodeSource` (pure primitive) — co-located with the storefront-setup phases (or `configurationService.ts` beside `buildSiteConfigParams`)
- [ ] `src/features/eds/handlers/storefrontSetupHandlers.ts` — thread `upstream?` into `StorefrontSetupStartPayload['edsConfig']`
- [ ] `src/features/eds/handlers/storefrontSetupPhases.ts` / `storefrontSetupPhase1.ts` — honor `resolveSiteCodeSource`: `createRepo: false` skips the fork + code-sync; Phase 3 builds params from the resolved code coords
- [ ] `src/features/project-creation/handlers/executor.ts` — persist `flow`/`upstream`; gate Phase 5 (config-push) off for satellites
- [ ] test files above

---

## Implementation Details

### RED
The primitive's unit tests fail (function doesn't exist). The satellite integration test fails (no satellite path — content flow currently forks like canonical). Canonical/commerce characterization passes against current code.

### GREEN
- Add `resolveSiteCodeSource(edsConfig)` — returns canonical when no `upstream`, satellite (`createRepo: false`, referenced code coords) when an `upstream` is present.
- Phase 1: `if (!codeSource.createRepo) { skip fork + waitForContent + App-install/code-sync }`.
- Phase 3: `buildSiteConfigParams(codeSource.codeOwner, codeSource.codeRepo, daLiveOrg, daLiveSite)` — unchanged function, resolved coords.
- Gate Phase 5 (`config.json`→GitHub) off when `!createRepo`.
- All gated so **no `upstream` ⇒ today's canonical/commerce behavior exactly.**

### REFACTOR
- Keep `resolveSiteCodeSource` a one-function pure predicate (no abstraction layers).
- Inline + plan docs: a satellite references upstream code — no fork / no Code Sync / no config-push — per Adobe repoless; and the primitive is multi-env-ready per ADR-003 (don't build the list variant yet).

---

## Acceptance Criteria
- [ ] `resolveSiteCodeSource`: canonical without upstream; satellite (`createRepo: false`, referenced coords) with upstream; decision keys on `upstream`, not `flow`.
- [ ] Canonical characterization green before + after (fork + code-sync + Phase 5 intact).
- [ ] Satellite: `registerSite` cross-org (`code.owner` = referenced repo); no fork, no code-sync, no config-push; Phase 5b content runs; project saved with `flow`/`upstream`.
- [ ] `buildSiteConfigParams` signature unchanged (ADR-003 list variant deferred); no per-env state/list built.
- [ ] Branching gated + predicate-named; full build + existing EDS/executor tests green.

**Estimated time:** 5–7 hours
