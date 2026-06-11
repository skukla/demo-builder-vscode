# Implementation Plan (SCAFFOLD): Commerce-Connect Slice 2 — AEM Sites as a content source

## Status Tracking

- [ ] **Scaffold — pending PM approval to delegate to Master Feature Planner**
- [ ] Planned (Master Planner output reviewed + approved)
- [ ] In Progress (TDD)
- [ ] Quality gates (Efficiency + Security)
- [ ] Complete

**Created:** 2026-06-11
**Predecessor:** `.rptc/complete/commerce-connect-slice1-repoless-wiring/` (repoless join shipped + F5-verified)
**Design sources:** `.rptc/backlog/commerce-connect-aem-sc/storefront-topology.md`, `verify-aem-sites-spike.md`, `aem-sc-first-run.md`; ADR-006 (`.rptc/plans/thin-layer-storefront-adr-006/`)

---

## Objective

Make the storefront **content source pluggable** and add an **AEM-Sites variant**, so a repoless joiner can author in their **own AEM Sites** instance instead of DA.live. Replace the DA.live assumption baked into `fstabGenerator` / `configurationService` / `edsPipeline` with content-source-neutral calls, and add the **config-as-content writer** so commerce wiring lands where an AEM-authored storefront reads it.

**Success criterion (F5, end-to-end):** an AEM-authored `xcom` page rendered via Edge Delivery shows **live products/prices** and a shopper can **add to cart and reach checkout** — driven by an extension-created repoless satellite whose content source is AEM Sites and whose commerce wiring was written as content.

---

## Locked decisions (PM, 2026-06-11)

1. **Build + F5 end-to-end.** A live AEM-as-Cloud-Service Author instance with an EDS license is available, so Slice 2 is built *and* live-verified — not headless-deferred like Slice 1's interim phase.
2. **Config-as-content writer is IN scope.** Without it the F5 gate (AEM page transacts) can't go green. A **manual-author fallback is allowed for the first end-to-end** so the source-swap seam isn't blocked on the writer being perfect.
3. **Seam depth → Master Planner's call.** Thin discriminated branch (`da-live | aem-sites`) vs. a `ContentSource` interface — the planner decides based on how the ~115 DA.live couplings actually factor (note: there are exactly two sources, so YAGNI pressure is real).

**Scope boundary (PM-stated, unobjected):** Slice 2 = the **joiner's content-source swap** (extends Slice 1's repoless join). It is **NOT** the AEM-SC front-door / first-run (the content-SC who *owns* an AEM storefront) — that remains the separate front-door slice in `aem-sc-first-run.md`.

---

## Architecture context (low-risk — already validated)

- **Existence proof closes the architecture:** `roberttoddhoven/citisignal-one` is an `xcom`-shaped storefront authored via AEM Sites, transacting in production, with multi-env **configs-as-content** (`configs`/`configs-stage`/`configs-dev` via `paths.json`). The spike (`verify-aem-sites-spike.md`) is **not a build gate**.
- **The seam is partially modeled already** — the planner extends, not invents:
  - `configurationService.ts` already threads `contentSourceUrl` + `contentSourceType`; the Helix config API call builds `source = { url, type: 'markup' }` (DA.live). The AEM variant is a different `type`/url here.
  - `helixApiClient.ts` sends a DA.live-specific `x-content-source-authorization: Bearer <daLiveToken>` — AEM needs a different auth/token model (a coupling point).
  - `daLiveContentOperations.ts` (~1200 lines: block-library, content copy/publish) is the DA.live-specific ops module — its AEM counterpart is the main net-new surface.
  - `types/demoPackages.ts` already names `DaLiveContentSource`; the type axis is in place to extend.
- **ADR-006 reconciliation carries forward:** the repoless satellite path already sidesteps code-patch/LKG mechanics (`executeSatelliteSetup` omits `codePatches`/`lkgSource`). Slice 2 stays on that path; AEM changes the *content* axis only.

---

## Known work areas (planner to decompose into TDD steps)

1. **Content-source seam** — factor the DA.live assumption in `fstabGenerator` / `configurationService` / `edsPipeline` behind a content-source-neutral boundary (depth TBD by planner). Extend `contentSourceType` and the Helix `source` payload to carry AEM.
2. **AEM-Sites variant** — the AEM counterpart to `daLiveContentOperations`: point the satellite at the AEM content tree, AEM auth/token wiring (`x-content-source-authorization` equivalent), `fstab`/`paths.json` mapping for the AEM source.
3. **Config-as-content writer** — write `configs*` nodes (commerce wiring: `commerce-core-endpoint`, `x-api-key`, `Magento-Environment-Id`, store headers) into the AEM content tree via the Authoring/Admin API, instead of committing `config.json` repo-side. Include the **manual-author fallback** path for first end-to-end.
4. **Wizard/connect surface** — let the joiner declare an AEM content source (likely a content-source choice on the Connect/Join path); prefill + validation parallel to Slice 1's connect-step.
5. **Dashboard/marker** — reflect content-source type where Slice 1 surfaces share/marker state, if the planner finds it warranted.

---

## Open questions for the Master Planner

- **Seam depth** (decision #3) — recommend thin branch vs. `ContentSource` interface, with the factoring evidence.
- **Author-in-place vs. copy** — does Slice 2 *copy* starter content into the joiner's AEM tree, or *wire* an already-authored AEM instance as the source (no copy)? The repoless/CitiSignal model leans "the AEM instance IS the content," which may eliminate a DA.live-style content-copy step entirely. Resolve early — it reshapes work area 2.
- **AEM auth model** — what token/credential does the satellite use to point at the AEM source, and where does it come from in the wizard?
- **Manual-fallback boundary** — exactly where the writer's automation stops and manual authoring begins for the first F5.
- **Multi-env** — is `configs-stage`/`configs-dev` in Slice 2, or just `configs` (prod) with multi-env as a noted follow-on?

---

## Verification approach

- TDD headless (unit + integration) for the seam, AEM variant, and writer — matching Slice 1's proven discipline.
- **Live F5 against the available AEM instance** for the end-to-end success criterion above.
- Quality gates: Efficiency + Security (the AEM auth/token handling and the Authoring-API write are the security-review focal points).

---

> **Next action:** PM approval to delegate this scaffold to the **Master Feature Planner** for the comprehensive, TDD-ready step breakdown (`step-NN.md` + test strategy + risk map), per RPTC.
