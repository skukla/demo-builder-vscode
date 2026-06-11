# Implementation Plan (SCAFFOLD): Commerce-Connect Slice 2 — AEM Sites as a content source

## Status Tracking

- [x] **Scaffold — PM-approved for delegation; four open questions resolved (2026-06-11)**
- [ ] Planned (planner output reviewed + approved)
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
3. **Seam depth → `ContentSource` interface.** PM chose the full abstraction over a thin discriminated branch. Plan to a `ContentSource` boundary (DA.live + AEM as the two implementations), not a `contentSourceType` switch. *Planner note:* this **overrides the YAGNI default** (there are only two sources today), so justify the interface's member surface against the ~115 DA.live couplings — keep it a real seam factored from actual call sites, not ceremony. The DA.live implementation is a refactor-in-place of today's code; AEM is the net-new implementation.
4. **Multi-env: all three from day one.** The config-as-content writer authors `configs` **+ `configs-stage` + `configs-dev`** (full CitiSignal-style `paths.json` mapping), not prod-only.
5. **Content model: point-at, no-copy** (confirmed against `roadmap.md` item 3 + `engagement-modes-and-ownership.md:73`). Slice 2 **wires** the joiner's already-authored AEM instance as the source — the AEM instance *is* the content ("the Content SC's content **lives in** their AEM Sites"). It does **not** copy or scaffold content. The PM's "long-term" option splits into already-planned, **out-of-scope** later work: (a) extension-driven AEM **env setup + `xcom` scaffold** = the **front-door / first-run, Slice 3** (`slice1-discovery.md:76`); (b) **seed brand starter content** = an **optional** step in the Joiner journey that can ride Slice 2's path later but is **not** required for the F5 gate. → **No content-copy step in Slice 2.**

**Scope boundary (PM-stated, unobjected):** Slice 2 = the **joiner's content-source swap** (extends Slice 1's repoless join). It is **NOT** the AEM-SC front-door / first-run (the content-SC who *owns* an AEM storefront) — that remains the separate front-door slice in `aem-sc-first-run.md` (Slice 3/4).

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

1. **Content-source seam (`ContentSource` interface)** — factor the DA.live assumption in `fstabGenerator` / `configurationService` / `edsPipeline` behind a `ContentSource` boundary. DA.live becomes one implementation (refactor-in-place of current code); the Helix `source` payload and `contentSourceType` are produced *through* the interface, not switched inline.
2. **AEM-Sites variant (`ContentSource` impl)** — the AEM implementation: point the satellite at the **already-authored** AEM content tree (no copy), AEM auth/token wiring (`x-content-source-authorization` equivalent), `fstab`/`paths.json` mapping for the AEM source. Net-new, but smaller than the DA.live ops module since there is no content-copy/publish path.
3. **Config-as-content writer (multi-env)** — write `configs` **+ `configs-stage` + `configs-dev`** nodes (commerce wiring: `commerce-core-endpoint`, `x-api-key`, `Magento-Environment-Id`, store headers) into the AEM content tree via the Configuration/Authoring API per the CitiSignal `paths.json` mapping, instead of committing `config.json` repo-side. Include the **manual-author fallback** path for first end-to-end.
4. **Wizard/connect surface** — let the joiner declare an AEM content source (likely a content-source choice on the Connect/Join path); prefill + validation parallel to Slice 1's connect-step.
5. **Dashboard/marker** — reflect content-source type where Slice 1 surfaces share/marker state, if the planner finds it warranted.

---

## Resolved (PM, 2026-06-11) — were open questions

- ✅ **Seam depth** → `ContentSource` interface (decision #3). Planner factors the member surface from real call sites.
- ✅ **Author-in-place vs. copy** → **point-at, no-copy** (decision #5). No content-copy step in Slice 2.
- ✅ **Multi-env** → **all three** `configs` / `configs-stage` / `configs-dev` (decision #4).

## Still open for the planner

- **AEM auth model** — what token/credential the satellite uses to point at the AEM source, and where it comes from in the wizard (the `x-content-source-authorization` equivalent for AEM). **Security-review focal point.**
- **Manual-fallback boundary** — exactly where the writer's automation stops and manual authoring begins for the first F5 (decision #2 allows the fallback; planner pins the line).
- **`ContentSource` member surface** — the concrete interface shape, derived from the DA.live call sites it must cover, kept minimal per the planner-note on decision #3.
- **Wizard surface for the AEM source** — where on the Connect/Join path the joiner declares the AEM content source + its auth, paralleling Slice 1's connect-step.

---

## Verification approach

- TDD headless (unit + integration) for the seam, AEM variant, and writer — matching Slice 1's proven discipline.
- **Live F5 against the available AEM instance** for the end-to-end success criterion above.
- Quality gates: Efficiency + Security (the AEM auth/token handling and the Authoring-API write are the security-review focal points).

---

> **Next action:** PM approved delegation (2026-06-11). Hand this scaffold to the detailed-planning pass — run via the built-in **Plan architect agent** (the RPTC Master Feature Planner agent isn't installed in this session) — for the comprehensive, TDD-ready step breakdown (`step-NN.md` + test strategy + risk map). PM reviews/approves the planner output before saving and starting TDD.
