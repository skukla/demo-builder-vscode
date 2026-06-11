# Implementation Plan: Commerce-Connect Slice 2 — AEM Sites as a content source

## Status Tracking

- [x] Scaffold — PM-approved for delegation; four open questions resolved (2026-06-11)
- [x] **Planned — detailed pass complete; step-01..08 written; PM reviewed (2026-06-11)**
- [x] **Reshaped around reuse + verified auth research (2026-06-11)** — R1 resolved (two auth legs: read=AEM-owned/null, write=reuse IMS token); `aemAuth` field/secret/auth-card dropped; capability map confirms reuse-and-extend of `src/features/eds/`. Steps 03/04/06/07 + risk map updated.
- [~] **In Progress (TDD) — Steps 01–08 ALL DONE + committed + pushed (2026-06-11; Step 08 PM-approved same day). Only the live F5 + quality gates remain.** See "Session handoff" below.
- [ ] Quality gates (Efficiency + Security)
- [ ] Complete

> **Planner corrections folded into this plan (override the scaffold's earlier framing):**
> - **`fstabGenerator.ts` is OUT of scope.** Code review showed it is canonical-only DA.live cleanup plumbing that never runs on the satellite path. Do **not** factor it behind `ContentSource`. (Scaffold's "factor fstabGenerator" was wrong.)
> - **`ContentSource` is a 2-method interface** (`buildRegistrationSource` + `getContentSourceAuthorization` + `type`). Point-at means no content-copy/publish members — those stay on `DaLiveContentOperations`, off the interface.
> - The real DA.live coupling on the satellite content axis is narrow: the registration `source` payload (`configurationService.ts:181`) and the Helix auth header (`helixApiClient.ts:45`).
>
> **PM decisions on planner recommendations (2026-06-11):**
> - **R2 (manual-fallback boundary):** ACCEPTED — automation owns registration + best-effort 3-node authoring; on missing auth or 401/403 the writer returns `manualFallbackRequired` with exact paths+payloads and setup completes green.
> - **R3 (interface surface):** ACCEPTED — the 2-method minimum.
> - **R4 (wizard surface):** ACCEPTED — extend `ConnectServicesStep` (not a standalone step).
> - **R1 (AEM auth model):** ✅ **RESOLVED — verified + reshaped around reuse (2026-06-11). Research: `.rptc/research/aem-content-source-auth/research.md` + `.rptc/research/aem-setup-automatability/research.md`.** The native AEM-Sites flow is **push-based**: on publish AEM pushes content into the EDS pipeline, which reads back markup from `…/bin/franklin.delivery/<owner>/<repo>/main` on the AEM **author** host. The decisive insight is that Slice 2 has **two auth legs that resolve oppositely**:
>   - **Content READ (EDS ← author markup): AEM-owned, extension passes NO token.** Authorized by a Site Authentication Token / OAuth S2S **technical account configured inside AEM** (auto-provisioned by Cloud Manager on first publish). → `getContentSourceAuthorization()` returns **`null`** for AEM. No token, no `secrets` storage, no read-token redaction. The earlier "(A) reuse `aio` / (B) S2S card" question **dissolves** — neither is needed for read.
>   - **Content WRITE (config-as-content writer → AEM author JCR): reuse the existing `aio`/IMS identity.** Per the verified dual-token model, JCR write-back uses the author's **own IMS token** — the identity the extension already holds. So the writer authenticates with the **existing Adobe login**; **no new credential UX, no new secret, no new wizard auth field.** The **R2 manual-fallback** already covers write 401/403.
>   - **JWT Service Account is fully EOL** (past 2025-06-30) → any S2S is OAuth S2S (only relevant to the front-door, not Slice 2).
>   - **In-AEM Authentication-tab setup is Slice-3 front-door work, NOT Slice 2.** In the point-at model the joiner's AEM instance is *already* authored and EDS-configured (already transacting), so its read auth is already wired. Slice 2 only **verifies the connection** (does the registered satellite render), it does not set up the auth tab.
>   - **Net effect on the plan:** *simpler* than the scaffold assumed — drop `aemAuth` field/secret/read-token redaction; writer reuses existing IMS token; no auth card in the wizard.
>   - **Live-test items (against the available AEM instance):** (1) can the extension author config nodes into AEM author via the authoring API using the user's IMS token (else R2 fallback)? (2) does the AEM author URL + `franklin.delivery` mountpoint register + render via `configurationService` (`admin.hlx.page/config`)? (3) exact `content.source` body shape for an AEM-author markup source vs DA.live. Full list in the research docs.
> - **Cloud Manager access:** **OUT of Slice 2 (PM, 2026-06-11).** Provisioning/env-discovery plane → **Slice 3 front-door** (`aem-sc-first-run.md`). In Slice 2 the **AEM author URL comes from the wizard field** (`aemContentSource.authorUrl`, Step 03/07); Cloud-Manager-API auto-discovery of the author host (read-only `GET /api/program/{id}/environments` → HAL `rel/author`) is a **Slice-3 convenience**, not required here. Verified capability map: `.rptc/research/aem-setup-automatability/research.md`.

**Created:** 2026-06-11
**Predecessor:** `.rptc/complete/commerce-connect-slice1-repoless-wiring/` (repoless join shipped + F5-verified)

---

## Session handoff (resume here) — 2026-06-11 (session 2)

**Branch:** `claude/commerce-connect-slice-1-plan-bgVlb` (fully pushed through Step 07). **Baseline:** EDS regression green at **1062 tests** + project-creation at **1114**; `npm run test:typecheck` + lint clean.

> **Working-copy note:** development on this branch happens in the dedicated worktree `adobe-demo-system/demo-builder-slice2-worktree` (pinned to this branch) — the main `demo-builder-vscode` checkout is in use by other in-flight work. Don't switch branches in the main checkout.

### Done (committed, TDD'd, green) — Steps 01–07
| Step | Commit summary | Key files |
|---|---|---|
| 01 | ContentSource seam + DaLiveContentSource (refactor-in-place) | `src/features/eds/services/contentSource/{contentSource,daLiveContentSource}.ts`; `configurationService.ts` (buildSiteConfigParams routes through it) |
| 02 | Helix auth header through the seam (omit-when-null) | `helixApiClient.ts` (`HelixTokens.contentSourceAuthorization?`); callers in `storefrontSyncService.ts`, `mcp-server.ts` |
| 03 | Factory + type/manifest plumbing | `contentSourceFactory.ts`; `base.ts`, `webview.ts` (EDSConfig), `demoPackages.ts`; `projectConfigWriter.ts` + `projectFileLoader.ts` round-trip |
| 04 | AemContentSource (point-at, null read auth, validation) | `src/features/eds/services/contentSource/aemContentSource.ts` |
| 05 | Satellite path honors ContentSource for AEM | `storefrontSetupPhase3.ts` (constructs source, threads into registration), `storefrontSetupPhases.ts` (gates DA.live pipeline + permissions for AEM), `storefrontSetupHandlers.ts` (payload type) |
| 06 | Config-as-content writer + executor Phase 5 wiring (`0725d45c`) | `configAsContentWriter.ts` (writer + `createAemAuthoringWritePort`); `executor.ts` (content-flow branch calls writer for aem-sites, non-fatal); `executor-aemConfigAsContent.test.ts` |
| 07 | Wizard content-source choice on Connect step (`8a78f00b`) | `aemContentSourceValidation.ts`, `useAemContentSource.ts`, `ContentSourceSelector.tsx`, `ConnectServicesStep.tsx` (join-flow-only chooser + Continue gate) |
| 08 | Dashboard content-source marker (`574189be`, PM-approved) | `ProjectDashboardScreen.tsx` (`buildDashboardSubtitle` — "Content source: AEM Sites" in header subtitle), `showDashboard.ts` + `ui/index.tsx` (persisted `contentSourceType` plumbing) |

### Design decisions made during TDD (carry forward)
- **`AemContentSource` constructor is `(authorUrl, contentPath)`** — content path is fixed AEM config, NOT per-registration coords. So `ContentSourceCoords` is `{ org, site }` only, and `buildSiteConfigParams` stays content-source-neutral. The factory builds a fully-configured source.
- **`getContentSourceAuthorization()` → `null` for AEM** (read is AEM-owned); the Helix `x-content-source-authorization` header is omitted.
- **Registration `content.source.url` = `<authorUrl><contentPath>`** (e.g. `https://author-pXXXX-eYYYY…/content/<site>`), `type: 'markup'`. **Exact shape is still a live-test item** — confirm at F5.
- **Step 06:** the writer derives the config document once via `extractConfigParams` + `generateConfigJson` (value parity with repo-side config.json) and loops it over `configs`/`configs-stage`/`configs-dev`. ANY failed write (not just 401/403) takes the R2 `manualFallbackRequired` path — one non-fatal branch, never blocks setup; payloads are public storefront config, the IMS token is never logged. The AEM authoring call is a **provisional `PUT <authorUrl><path>` with `Authorization: Bearer <IMS>`**, isolated behind `ContentWritePort` — the exact API shape is an F5 live-test item. The executor integration point is **Phase 5's content-flow guard** (`executor.ts` `syncEdsConfigToRemote`): registration happens at preflight and commerce values exist post-Phase-4, so this IS "after registration" from step-06.
- **Step 07:** the chooser renders only when `state.flow === 'content'`; Continue gate = GitHub + DA.live (unchanged — registration still needs the IMS identity) **plus AEM URL/path validity** when aem-sites is selected. Fields seed `edsConfig.contentSourceType`/`aemContentSource` and ride the existing setup payload (no new plumbing). No credential affordance (R1).
- TDD note: Steps 01–04, 06, 07 were strict RED→GREEN; **Step 05's integration was source-then-test** (the unit pieces were RED-first; the phases integration test was written right after and locks the behavior).

### Next: live F5, then quality gates
- **Live F5** (PM runs it against `author-p57319-e1619941`): script in `step-08.md` § "Single live-F5 verification script". It confirms the three R1 live-test items: (1) registration URL shape for an AEM-author markup source, (2) the satellite renders from AEM content, (3) the authoring API accepts the extension-held IMS token for the config-node writes (else the R2 fallback prints the three nodes for manual authoring — setup stays green either way). Fold results/evidence + any `createAemAuthoringWritePort` API-shape adjustment back into this plan.
- After F5: quality gates (Efficiency + Security; focal points in the `step-08.md` risk map), then move the plan to `.rptc/complete/`.
- Known pre-existing (NOT Slice 2): the dashboard handlers/services jest run warns "worker process failed to exit gracefully" — leak predates Step 08 (verified by isolation).

### Verify on resume
```
npm run test:file -- tests/features/eds/services/contentSource/ tests/features/eds/services/configAsContentWriter.test.ts tests/features/eds/handlers/storefrontSetupPhases-aem.test.ts tests/features/project-creation/handlers/executor-aemConfigAsContent.test.ts tests/features/eds/ui/steps/ConnectServicesStep-contentSource.test.tsx
npm run test:typecheck
```
**Design sources:** `.rptc/backlog/commerce-connect-aem-sc/storefront-topology.md`, `verify-aem-sites-spike.md`, `aem-sc-first-run.md`; ADR-006 (`.rptc/plans/thin-layer-storefront-adr-006/`)

---

## Objective

Make the storefront **content source pluggable** and add an **AEM-Sites variant**, so a repoless joiner can author in their **own AEM Sites** instance instead of DA.live. Route the two narrow DA.live couplings — the registration `source` payload (`configurationService`) and the Helix content-source auth header (`helixApiClient`) — through a content-source-neutral `ContentSource` seam, gate the DA.live content-population pipeline for the AEM (point-at) source, and add the **config-as-content writer** so commerce wiring lands where an AEM-authored storefront reads it. (`fstabGenerator` is **not** touched — it is canonical-only cleanup, off the satellite path.)

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
  - `helixApiClient.ts` sends a DA.live-specific `x-content-source-authorization: Bearer <daLiveToken>` — for AEM this header is **omitted** (read is AEM-owned; `getContentSourceAuthorization()` → `null`). The coupling is routing the header through `ContentSource`, not supplying an AEM token.
  - `daLiveContentOperations.ts` (~1200 lines: block-library, content copy/publish) is the DA.live-specific ops module — its AEM counterpart is the main net-new surface.
  - `types/demoPackages.ts` already names `DaLiveContentSource`; the type axis is in place to extend.
- **ADR-006 reconciliation carries forward:** the repoless satellite path already sidesteps code-patch/LKG mechanics (`executeSatelliteSetup` omits `codePatches`/`lkgSource`). Slice 2 stays on that path; AEM changes the *content* axis only.

---

## Known work areas (now decomposed into step-01..08)

1. **Content-source seam (`ContentSource` interface)** [→ steps 01–02] — factor the narrow DA.live couplings (`configurationService` registration `source` payload; `helixApiClient` auth header) behind a `ContentSource` boundary. DA.live becomes one implementation (refactor-in-place of current code); the Helix `source` payload and `contentSourceType` are produced *through* the interface, not switched inline.
2. **AEM-Sites variant (`ContentSource` impl)** — the AEM implementation: point the satellite at the **already-authored** AEM content tree (no copy); `buildRegistrationSource` → `{ url: authorUrl + contentPath (franklin.delivery mountpoint), type: 'markup' }`; `getContentSourceAuthorization()` → **`null`** (read is AEM-owned, no token). Net-new but tiny (≈ `DaLiveContentSource`), since there is no content-copy/publish path and no read-auth to handle.
3. **Config-as-content writer (multi-env)** — write `configs` **+ `configs-stage` + `configs-dev`** nodes (commerce wiring: `commerce-core-endpoint`, `x-api-key`, `Magento-Environment-Id`, store headers) into the AEM content tree via the Configuration/Authoring API per the CitiSignal `paths.json` mapping, instead of committing `config.json` repo-side. Include the **manual-author fallback** path for first end-to-end.
4. **Wizard/connect surface** — let the joiner declare an AEM content source (likely a content-source choice on the Connect/Join path); prefill + validation parallel to Slice 1's connect-step.
5. **Dashboard/marker** — reflect content-source type where Slice 1 surfaces share/marker state, if the planner finds it warranted.

---

## Resolved (PM, 2026-06-11) — were open questions

- ✅ **Seam depth** → `ContentSource` interface (decision #3). Planner factors the member surface from real call sites.
- ✅ **Author-in-place vs. copy** → **point-at, no-copy** (decision #5). No content-copy step in Slice 2.
- ✅ **Multi-env** → **all three** `configs` / `configs-stage` / `configs-dev` (decision #4).

## Resolved (planner pass + research, 2026-06-11) — were "open for the planner"

- ✅ **AEM auth model** → R1 RESOLVED above. Read = AEM-owned (`getContentSourceAuthorization()` → `null`); write = reuse existing IMS token + R2 fallback. **No new credential/secret/wizard-auth-field.** R-A risk largely dissolves for the read path (write-auth redaction still applies — it reuses the existing token).
- ✅ **Manual-fallback boundary** → R2 ACCEPTED: writer best-effort authors the 3 nodes; on missing IMS token or 401/403 it returns `manualFallbackRequired` (exact paths + payloads) and setup completes green.
- ✅ **`ContentSource` member surface** → R3 ACCEPTED: 2-method seam (`buildRegistrationSource` + `getContentSourceAuthorization` + `type`), factored from `configurationService.ts` + `helixApiClient.ts`; copy/publish stay off the interface.
- ✅ **Wizard surface** → R4 ACCEPTED + simplified: extend `ConnectServicesStep` with author-URL + content-path fields only — **no auth card** (read is AEM-owned, write reuses the existing login).

## Reuse framing (capability map, 2026-06-11)

Slice 2 is **reuse-and-extend of `src/features/eds/`, not build-new** — the DA.live EDS flow (repo, `configurationService` registration, `helixApiClient`, publish/verify) already exists and is the seam host. The AEM delta is: the `AemContentSource` impl (Step 04), the config-as-content writer (Step 06), type/wizard plumbing (03/07), and the satellite-path gate (05). Per the verified three-plane posture: the extension **owns code + content plumbing** here; **provisioning + entitlement + in-AEM auth-tab** are guide-and-verify and live in the **Slice-3 front-door**, not Slice 2.

---

## Verification approach

- TDD headless (unit + integration) for the seam, AEM variant, and writer — matching Slice 1's proven discipline.
- **Live F5 against the available AEM instance** for the end-to-end success criterion above.
- Quality gates: Efficiency + Security (focal points: the config-as-content **write** auth — reused IMS token + redaction; read carries no token — and **URL/path validation** into the registration URL).

---

> **Next action:** Detailed plan complete and **reshaped around reuse** (2026-06-11); steps 01–08 are TDD-ready. **Awaiting PM go to begin TDD at Step 01** (`ContentSource` seam, characterization-locked so the DA.live path stays byte-identical). Order: headless steps 01–07 first; the **live F5** (Step 08 script) runs against the available AEM instance once the AEM impl (04) + config-as-content writer (06) land. The three live-test items (R1, above) are confirmed at that F5, with the R2 manual fallback as backstop.
