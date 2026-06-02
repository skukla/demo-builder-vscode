# Dual authoring: DA.live + AEM Sites against one storefront

**Filed:** 2026-06-02
**Status:** Research complete — awaiting `/rptc:plan` sign-off
**Related:** [`2026-05-19-multisite-multilocale.md`](./2026-05-19-multisite-multilocale.md) (shares the repoless / second-site machinery), [`2026-05-28-eds-site-scraping.md`](./2026-05-28-eds-site-scraping.md) (the importer ecosystem reused for seeding)

> Research note: Adobe doc pages (`www.aem.live`, `experienceleague.adobe.com`) block programmatic `WebFetch` (HTTP 403 bot protection); the Experience League MCP was not connected. Findings below rest on `WebSearch` extracts of Adobe's own page text plus reachable `raw.githubusercontent.com` content. **Before building automation, re-verify the load-bearing API/config payloads by opening the cited URLs in a browser** (they render fine interactively). Confidence is flagged where it matters.

## Goal

Let a storefront produced by the extension be **authored from two environments at once**, by two different solution consultants:
- the **Commerce SC** on **DA.live** (document authoring — today's experience), and
- the **AEM SC** on **their own AEM Sites** environment,

both driving the **same storefront code** (the extension's one EDS GitHub repo). Ideally the AEM SC can use the extension too ("extend usage to AEM SCs").

### Confirmed intent (from discovery)
- **Both environments live simultaneously** (not switchable).
- The AEM SC authors **in their own AEM** ~99% of the time — i.e. a real **AEMaaCS** author program, full Sites console (MSM / Content Fragments / Launches). It may be in the **same or a different IMS org** as the Commerce SC.
- "Same content in both" is desirable but **not** a hard requirement — to be resolved by the seeding feasibility (below). Live shared content is impossible (see constraint).

## The load-bearing constraint

**An EDS site has exactly one content source.** `fstab.yaml` allows one mountpoint; the Helix 5 config service stores a single `content.source` per site. The "overlay content source" is for AEM Content Fragments / json2html / BYOM layering — **not** two general authoring UIs on the same pages. So *one site authored by both DA.live and AEM simultaneously* is **not supported**.
- Sources: [aem.live FAQ](https://www.aem.live/docs/faq), [Configure Your Content Source](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/using-cloud-manager/edge-delivery-sites/configure-content-source), [config-service-setup](https://www.aem.live/docs/config-service-setup). (Confidence: High.)

## Architecture verdict

**One code repo → two EDS sites** (the supported "repoless" shape):

| | Site A (today) | Site B (new) |
|---|---|---|
| Author | Commerce SC | AEM SC |
| Authoring tool | DA.live document UI (+ existing UE punch-out) | AEM Universal Editor / Sites console |
| Content source | DA.live (`content.da.live/{org}/{site}`) | the AEM SC's **AEMaaCS author** (`https://<author>/bin/franklin.delivery/<owner>/<repo>/main`) |
| Content store | DA Author Bus (S3) | AEM JCR (`cq:Page`, "xwalk") |
| Code source | the extension's GitHub repo | **the same repo**, via AEM Code Sync |
| Delivery | `main--{site}--{org}.aem.page` | the AEM site's own EDS origin |

Both deliver the **same storefront shell**; each SC authors **independently** in their own store; both live at once. This is the only pattern that satisfies "both live, AEM SC in their own full AEMaaCS."

### Why not "same content, two editors" (Universal Editor on the DA content)?
The extension already wires a UE punch-out on the DA content — `applyDaLiveOrgConfigSettings` (`src/features/eds/handlers/edsHelpers.ts:537-580`) writes `editor.path` →
`https://experience.adobe.com/#/@{IMSOrgId}/aem/editor/canvas/main--{site}--{org}.ue.da.live` and `aem.repositoryId` ← `aemAuthorUrl`, gated behind `demoBuilder.daLive.IMSOrgId` / `aemAuthorUrl` settings. Live example confirmed: `…/@demosystem/aem/editor/canvas/main--cng-demo--skukla.ue.da.live/index`.

That UE canvas is **powered by a shared Sites instance/entitlement** the Commerce SCs sit on (`@demosystem`). **AEM SCs are not on that instance** — they each have their own AEMaaCS. So "everyone uses one UE canvas on the shared DA content" does **not** work for AEM SCs, and (since they have full AEMaaCS) they author in their own AEM repository anyway. Hence Site B, not shared-UE.
- Sources: [docs.da.live: Setup Universal Editor](https://docs.da.live/administrators/guides/setup-universal-editor), [aem.live: aem-authoring](https://www.aem.live/docs/aem-authoring). (Confidence: High on "one source per site"; the UE-on-DA punch-out is code-confirmed in this repo.)

## Seeding feasibility (does the AEM site start with the same content?)

**Verdict: possible, supported, medium effort — not a one-call API, not impractical.**

AEM-authored EDS content is `cq:Page` JCR nodes (xwalk), authored via Universal Editor; the storage backend (JCR) differs from DA's Author Bus, so there is **no direct DA→AEM converter**. The supported bridge is Adobe's **`@adobe/aem-import-helper`** in `xwalk` mode: crawl the **rendered** (DA-sourced) storefront pages → emit an AEM **content package** → `aem-upload` it into the AEMaaCS author.
- `npm run import -- --urls … --options '{"type":"xwalk",…}' --models component-models.json --filters component-filters.json --definitions component-definition.json`
- `npm run aem-upload -- --token <devtoken> --zip <pkg> --asset-mapping <map> --target <author-url>`
- Sources: [github.com/adobe/aem-import-helper](https://github.com/adobe/aem-import-helper), [npm @adobe/aem-import-helper](https://www.npmjs.com/package/@adobe/aem-import-helper), [aem.live importer](https://www.aem.live/developer/importer). (Confidence: High this is the path; Medium on exact syntax — verify in browser.)

**Why it's tractable for us:** the heaviest documented cost is *tuning `import.js` per arbitrary site* — but the extension **owns its storefront structure**, so it can **ship a known `import.js` + `component-*.json`**, reducing seeding to "run two commands with a token."

**Residual friction:** `aem-upload` needs a **~24h dev token** from the AEM Cloud Manager Developer Console (no documented long-lived headless credential), so fully unattended seeding is awkward — it'd be a "paste/refresh token" step. Prereq: the storefront must be **xwalk/UE-authorable** (`component-definition/models/filters.json`); the existing UE-on-DA punch-out suggests partial instrumentation already exists — **to confirm in Plan.**

## Proposed scope (phased)

### v1 — the dual-authoring capability
- Capture the AEM SC's AEMaaCS (author URL, IMS org, program/site) in the wizard/Configure surface; store an additive `aemSitesBinding` on the project manifest.
- Wire **Site B**: code = the shared repo via AEM Code Sync; content source = the AEM author — via the config-service Admin API (`admin.hlx.page`) where automatable.
- **Guide** the AEM-side steps with no self-serve API: Code Sync GitHub App install, Cloud Manager EDS-site creation, IMS roles/product-profiles, UE/Sites enablement.
- Surface both authoring entry points + both delivered URLs on the dashboard (e.g. an **"Author in AEM"** action beside "Author in DA.live").
- Content authored independently (AEM site opens as the storefront shell).

### v2 — assisted seeding
- Extension ships the storefront's `import.js` + `component-*.json`; orchestrates `aem-import-helper` import + `aem-upload`; handles the dev-token paste.
- Result: AEM site opens with the same content, then diverges as each SC authors.

## Codebase seams (current single-source pipeline → extension points)
- `src/features/eds/services/fstabGenerator.ts` — single `/` mountpoint to DA.live today.
- `src/features/eds/services/configGenerator.ts` / `configurationService.ts` — single org/site config; config-service PUT already overlay-capable.
- `src/features/eds/handlers/edsHelpers.ts:537-580` — the UE punch-out config (reuse for the "Author in AEM" URL builder).
- `src/features/eds/services/edsPipeline.ts` — DA content copy (the seeding analog for v2).
- Project manifest (`src/types/base.ts` `EdsMetadata`) — add additive `aemSitesBinding`.
- Wizard steps (`src/features/eds/ui/steps/*`) + dashboard `ActionGrid`/`useDashboardActions` — UI surfaces.

## Open items for Plan
1. **Repoless vs shared-repo** for Site B, and **same- vs different-IMS-org** (cross-org code sharing + which org's `aem.live` config namespace owns Site B). Cross-org is the awkward case — verify.
2. **Storefront xwalk-authorability** — how much `component-definition/models/filters` already exists given UE-on-DA works.
3. **Auth/token UX** — config-service admin token + the 24h AEM dev token for seeding; how the extension handles both.
4. **Config-service JSON schema** — re-verify payloads in a browser before coding (doc fetch was blocked).
5. **Relationship to multisite-multilocale** — both need the "second site from one repo" machinery; align so they don't diverge.
