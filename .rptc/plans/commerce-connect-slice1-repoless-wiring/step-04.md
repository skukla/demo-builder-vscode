# Step 4: Content Flow → Repoless Satellite via Configuration Service (the Adobe-native path)

**Status: 🟡 Config gate done (2026-06-04).** ✅ `supportedFlows` added to `stacks.json` (EDS=`['commerce','content']`, headless=`['commerce']`), the `Stack` type, `stacks.schema.json`, and the alignment test's field list — 116 template/alignment tests green, lint/typecheck/SOP clean. **Remaining:** the content-flow satellite-creation path + its integration test.

> **2026-06-05 repivot + 2026-06-06 mechanic lock:** The config gate (`supportedFlows`) survives unchanged — it gates which stacks expose the content flow regardless of topology. **The locked satellite-creation mechanic is the dedicated short path (the Adobe-native repoless one):**
>
> **For the content (Content-SC) flow, a repoless satellite has no GitHub repo of its own. The extension does NOT fork the upstream, does NOT install the AEM Code Sync GitHub App on the joiner's side, and does NOT run code-sync verification. It creates the site with a single cross-org Configuration Service registration:**
> ```
> PUT /config/{contentSC-org}/sites/{site}.json
>   code:    { owner: <commerceSC-org>, repo: <upstream> }
>   content: { source: { url: <Content SC's DA.live URL>, type: 'markup' } }
> ```
> **Code Sync stays entirely on the Commerce SC's canonical repo; the satellite reads the upstream code through the Config Service `code` reference.** Verified live 2026-06-05 (HTTP 201 + 45s propagation through the upstream's Code Sync — see [architecture-validation](../../research/2026-06-05-architecture-validation.md)). This is exactly Adobe's documented repoless mechanism ([aem.live/docs/repoless](https://www.aem.live/docs/repoless)); the satellite is a Config Service entry that references upstream code, not a synced fork.
>
> **Why not reuse the full EDS storefront-setup pipeline with `repoInfo = upstream`?** That was the rejected Option A. It would run the GitHub-App-install check, code-sync verification, and the Phase 5 `config.json`-push against a repo the joiner does **not** own — all anti-patterns under repoless (a satellite needs no App install, and config travels as content, never pushed to the code repo). The full discussion is in the decision trail below.

**Purpose:** Make the **content flow create a repoless satellite** through a dedicated,
minimal path — one cross-org `ConfigurationService.registerSite` call plus DA.live
content — driven by **configuration + seeded data**, never forking and never touching
the upstream repo. Three config facts still hold and do real work:

- **No mesh — by config.** Mesh is an `optionalDependencies` entry in `stacks.json`
  (not a default); the content path simply doesn't include it, and `executeMeshPhase`
  **already no-ops when no mesh component is present** (`else if (meshComponent?.path && meshDefinition)`).
  So there is *nothing to skip* there.
- **Backend by URL — not provisioned.** There is no separate "backend deploy" phase;
  the backend is just coordinates in the seeded config (Step 5) consumed by
  `configGenerator`. Nothing to skip there either.
- **Code source is a reference, not a fork.** The satellite reads the upstream via the
  Config Service `code: { owner, repo }` block. **No fork, no `createFromTemplate`, no
  Code Sync App install, no code-sync verification on the joiner's side.**

**What is genuinely net-new in this step:** a **satellite-creation branch** for the
content flow that bypasses the repo-creation + code-sync machinery and calls
`ConfigurationService.registerSite` with the upstream as `code.owner/repo` and the
joiner's own DA.live as the content source. The GitHub `config.json`-push (Phase 5)
does **not** run for a satellite — the joiner owns no repo, and commerce config travels
as content (config-as-content is Slice 2). DA.live content setup (Phase 5b) runs as usual.

> **Supersedes** both the earlier "branch the executor / skip mesh+backend" framing
> *and* the interim Option-A "reuse the pipeline with `repoInfo = upstream`" lean. The
> commerce/EDS path is untouched; the content path is a short, dedicated satellite
> registration.

**Prerequisites:**
- [ ] Steps 1 (flow/upstream), 2 (join resolve seeds `upstream` + coords), 3 (filtering)
- [ ] `ConfigurationService.registerSite` / `buildSiteConfigParams` understood — already
  separates the Config Service lookup key (`org`/`site` = joiner's DA.live) from the code
  source (`codeOwner`/`codeRepo`); the cross-org case is just `codeOwner = <commerceSC-org>`
- [ ] The EDS storefront-setup pipeline (`executeStorefrontSetupPhases`) understood — esp.
  that Phase 1 forks (`createFromTemplate`) and Phase 3 registers the site; the content
  path takes neither the fork nor the code-sync verification
- [ ] `executeMeshPhase` no-ops without a mesh component; mesh is `optionalDependencies`
- [ ] **Org-level repoless prerequisite:** each `aem.live` org needs a matching `github.com`
  org with at least one Code-Sync-synced "anchor" repo (the `kukla-demos/anchor` pattern).
  This is a one-time org preflight (Risk 3), **not** part of per-satellite creation.

---

## Reuse map (satellite path)
- **`ConfigurationService.registerSite` + `buildSiteConfigParams`** — the satellite-creation
  seam. Already speaks the Admin API and already separates `org`/`site` (joiner's DA.live
  lookup key) from `codeOwner`/`codeRepo` (the code source). Content flow passes the
  **upstream** owner/repo as the code source → cross-org `code.owner`. **Primary reuse.**
- **`stacks.json` dependency set** — content path carries no mesh dependency → existing mesh no-op. No imperative skip.
- **`executeMeshPhase`** — unchanged; no-ops when no mesh present.
- **`configGenerator.generateConfigJson`** — unchanged; consumes seeded coords; direct backend URL when no mesh.
- **`ensureEdsContent`** (Phase 5b) — unchanged; sets up the joiner's **own** DA.live content.
- **NOT reused for the content flow:** `GitHubRepoOperations.createFromTemplate` (no fork),
  the GitHub Code Sync App install check, code-sync verification, and the Phase 5
  `config.json`-push (no owned repo). These remain for the commerce/EDS canonical path and
  the manual fork-and-own escape hatch.
- **Net-new:** the content-flow satellite branch that routes to `registerSite` instead of
  the fork+code-sync sequence; gated so absent-`flow` behavior is byte-identical to today.

## Config gating — `supportedFlows` (config + schema)
- `supportedFlows?: ('commerce' | 'content')[]` on `stacks.json` (+ `stacks.schema.json`)
  expresses *which stacks the content flow may use* as **data**, not a hardcoded predicate.
  EDS stacks support both; non-EDS (headless) support `'commerce'` only. ✅ shipped 2026-06-04.

---

## Tests to Write First

### Characterization (Risk-1 guard): `tests/.../executor-commerce-regression.test.ts`
- [ ] Commerce/EDS path still runs Phase 3 mesh **when a mesh component IS present** (capture current behavior so nothing regresses).
- [ ] Commerce/EDS path still **forks** (`createFromTemplate`), runs code-sync, and registers the site with the joiner's **own** owner (regression baseline for the satellite branch).

### Integration: `tests/.../storefrontSetupPhases-repoless.test.ts` (satellite path)
- [ ] **Content flow registers a cross-org satellite** — `registerSite` invoked with
  `codeOwner = <commerceSC/upstream owner>`, `codeRepo = <upstream>`, and `org`/`site` =
  the joiner's **own** DA.live org/site; `content.source.url` = the joiner's DA.live.
- [ ] **No fork for content flow** — `createFromTemplate` NOT invoked.
- [ ] **No code-sync machinery for content flow** — GitHub App install check / code-sync
  verification NOT invoked (the satellite has no owned repo to sync).
- [ ] **No GitHub config-push for content flow** — Phase 5 `config.json`→repo NOT invoked;
  DA.live content (Phase 5b) DOES run.
- [ ] **Commerce flow unchanged** — fork + code-sync + Phase 5 all still run; `registerSite`
  uses the joiner's own owner (regression).

### Config: `tests/.../stacks-supportedFlows.test.ts` ✅
- [ ] EDS stacks declare `supportedFlows` including `'content'`; non-EDS stacks do not.

---

## Files to Create/Modify
- [ ] `src/features/eds/handlers/storefrontSetupHandlers.ts` — thread `flow?`/`upstream?`
  into `StorefrontSetupStartPayload['edsConfig']` so the satellite branch can see them
- [ ] `src/features/eds/handlers/storefrontSetupPhases.ts` (and/or `storefrontSetupPhase1.ts`)
  — content-flow satellite branch: skip fork + code-sync; build `registerSite` params with
  the upstream as `codeOwner/codeRepo`; skip the GitHub config-push
- [ ] `src/features/project-creation/config/stacks.json` + `stacks.schema.json` — `supportedFlows` ✅
- [ ] `src/features/project-creation/handlers/executor.ts` — ensure the saved content project
  carries `flow:'content'` + `upstream` (Step 1 already added the fields; verify the content
  path persists them) and that Phase 5 (GitHub config-push) is gated off for satellites
- [ ] test files above

---

## Implementation Details

### RED
Characterization (commerce fork + mesh + code-sync) passes against current code. The
satellite integration test fails because the content flow currently has no satellite branch
(it would fork like commerce).

### GREEN
- **Satellite branch:** when `flow === 'content'` (and an `upstream` is present), route the
  content flow to a short sequence: **skip** the fork (`createFromTemplate`), the GitHub App
  install check, and code-sync verification; call `ConfigurationService.registerSite` with
  `buildSiteConfigParams(upstream.owner, upstream.repo, joinerDaLiveOrg, joinerDaLiveSite, …)`
  → cross-org `code.owner`; then run DA.live content (Phase 5b) as usual. Gate Phase 5
  (`config.json`→GitHub) off for satellites. Prefer a predicate-named guard
  (`isContentFlow(...)` / `shouldCreateSatellite(...)`) over inline `if`s.
- Keep every guard gated so **absent `flow` ⇒ today's commerce/EDS behavior exactly**.
- `supportedFlows` config + schema already shipped.

### REFACTOR
- One predicate decides "satellite vs fork"; no scattered conditionals.
- Document inline (brief) + in the plan: the satellite is a Config Service entry referencing
  upstream code — **no fork, no Code Sync App, no config-push** — per Adobe's repoless model.

---

## Acceptance Criteria
- [ ] Commerce characterization test green before + after (fork + mesh + code-sync + Phase 5 intact).
- [ ] Content flow creates a repoless satellite: `registerSite` cross-org (`code.owner = commerceSC`,
  content = joiner's DA.live); **no** fork, **no** code-sync, **no** GitHub config-push.
- [ ] DA.live content (Phase 5b) runs for the satellite; project saved with `flow:'content'` + `upstream`.
- [ ] `supportedFlows` in `stacks.json` + `stacks.schema.json`; non-EDS stacks are commerce-only. ✅
- [ ] Content branching is gated and predicate-named; full build + existing EDS/executor tests green.

**Estimated time:** 5–7 hours
