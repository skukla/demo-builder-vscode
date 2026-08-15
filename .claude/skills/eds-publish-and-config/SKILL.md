---
name: eds-publish-and-config
description: Auth and scoping rules for EDS publish/config operations — Helix Admin (preview/publish/live/delete), DA.live config writes, AEM Config Service registration, and aem.live URL/path encoding. Use when publishing or unpublishing EDS pages, registering or editing site config, debugging a 403 on DELETE /live, a 401 on preview/publish/purge after a site-access grant, a silent "0 paths succeeded" bulk publish, a missing AEM Assets panel in da.live, a da.live editor 404, or a PDP path that 404s at the CDN.
---

# EDS Publish and Config Operations

## When NOT to use

Dropin loading, `__dropins__` vendoring, import maps, or `config.json` flag injection → use the sibling skill `eds-dropin-vendoring`.

## Procedure / Rules

1. **Identify which of the THREE config services you are touching — they are independent:**
   - **Helix/AEM Config Service** (`admin.hlx.page/config/...`) — what preview/publish/live consult.
   - **DA.live config** (`admin.da.live/config/{org}` and `/config/{org}/{site}`) — what the da.live editor and Library read.
   - The storefront's generated `config.json` — owned by the generator (sibling skill's territory).
2. **Helix Config Service lookup key = GitHub owner/repo, NEVER the DA.live site name.** Helix looks up `/config/{owner}/sites/{repo}.json` to match its `/preview/{owner}/{repo}/main/...` operations. `contentSourceUrl` (the DA.live location) goes inside the config *body*, not the lookup key. Anchor: `buildSiteConfigParams` in `src/features/eds/services/configurationService.ts`.
3. **DA.live config scope — write at the level that reads it:**
   - `aem.repositoryId` (AEM Assets binding) → **site** config `/config/{org}/{site}` via `applySiteConfig`.
   - `editor.path` (UE punch-out mapping) → **org** config via `applyOrgConfig`.
   - Both delegate to `writeMergedDataConfig`, which merges and preserves existing sheets (`library`, `permissions`) — never PUT a config wholesale. Anchor: `src/features/eds/services/daLiveContentOperations.ts`.
4. **Unpublish/delete (`DELETE /live`, `DELETE /preview`) is destructive — confirm with the user before issuing it.** Auth for DELETE while a content source exists in fstab.yaml: **only the DA.live IMS Bearer token works** (`Authorization: Bearer <daLiveToken>`). GitHub token (`x-auth-token`) → 403; API key (`Authorization: token`) → 403. Do not manipulate fstab or retry-loop around the 403. Anchor: `getDeleteAuthHeaders()` in `src/features/eds/services/helixService.ts`; ADR: `docs/architecture/adr/002-helix-bulk-api-fallback.md`.
5. **A site with ANY `access.admin` role closes the WHOLE admin API, not just DELETE.** Writing a site-access role makes the Configuration Service set `requireAuth: "auto"`; from then on preview, publish, bulk and cache-purge all need the DA.live IMS Bearer, and a 401 there is NOT a GitHub write-access problem — rule 4's DELETE-only framing does not apply once a site is protected. Storefront setup now pins an admin at registration, so this is the normal state, not an edge case. Measured 2026-08-14 on a throwaway site: identical bulk-preview POST → 202 before the grant, 401 after, 202 again with the Bearer attached. Anchors: `tryAdminBearer()` and `ADMIN_API_401_MESSAGE` in `helixService.ts`. Repair path: `demoBuilder.repairSiteConfiguration`.
6. **Bulk preview/publish jobs: check per-path results, not job completion.** A bulk job "completes" successfully with 0 paths succeeded when the config lookup key is wrong (rule 2). Treat "job done" as meaningless until you count succeeded paths.
7. **da.live canvas/edit URLs take an EXTENSIONLESS doc segment**: `da.live/canvas#/{org}/{site}/index`, not `.../index.html`. da.live appends `.html` itself; a suffixed path double-appends and 404s the editor doc session. A doc segment IS required (bare site root renders blank). Anchor: `getEdsDaLiveUrl` in `src/types/typeGuards.ts`.
8. **Never percent-encode aem.live URL paths.** The CDN rejects `%`-encoded paths with a bare 404 before the storefront renders; Helix does not decode `%XX` in path matching. Safe path-segment alphabet: `[a-z0-9_-]` (Helix lowercases content-bus paths). PDP SKUs use the reversible `_HH` underscore hex-escape — `encodeSkuForUrl`/`decodeSkuFromUrl` in `src/features/eds/services/pdpUrlEncoding.ts`, which must stay byte-identical to the copy in the external `eds-demo-patches` repo (published path must match the generated link). ADR: `docs/architecture/adr/007-pdp-sku-url-encoding.md`.
9. **Catalog Service case rules** (load-bearing for the lowercase-path model, ADR-005): `products(skus: [...])` is case-INSENSITIVE; `productSearch(filter: {attribute: "url_key"})` is case-SENSITIVE. The smart-404 lowercase redirect only works because of the former.

## Gotchas

- **DELETE /live 403 "delete not allowed while source exists"** checks fstab.yaml mountpoints, not Config Service state. Fix is the DA.live Bearer auth (rule 4), nothing else. (`helixService.ts:getDeleteAuthHeaders`)
- **Registering the site config under the DA.live name** makes every bulk preview/publish silently "complete" with zero paths published while live URLs 404 — the job machinery runs but Helix finds no content source under the key it consults. (`configurationService.ts:buildSiteConfigParams`)
- **Writing `aem.repositoryId` to the ORG config succeeds silently** but the da.live Library's AEM Assets panel never appears — the per-site Library only reads the site sheet. Symptom: block library visible, AEM Assets missing. (`daLiveContentOperations.ts:applySiteConfig`)
- **A `.html`-suffixed canvas URL still RENDERS the page** (iframe shows published content), masking the failure — but the editor doc model never loads, so the Outline shows "No blocks". (`typeGuards.ts:getEdsDaLiveUrl`)
- **CDN-404 vs storefront-404 litmus**: a path that enters EDS routing returns the storefront's styled ~5KB 404; a CDN-rejected (e.g. percent-encoded) path returns a bare ~13-byte "404 Not Found". Use the byte size to tell which layer rejected you.
- **Helix Config Service 403 "Not authorized" is a per-IDENTITY entitlement gap, and it is FIXABLE over the API** — do not tell anyone to re-create the site. The role is minted for the github.com user who installs the AEM Code Sync App *at org creation*, so an org that predates that flow has an empty roster and refuses its own owner (2026-08-13, leah-b2b-demo: Code Sync verified installed, DA.live + bulk publish accepting the very token `/config/*` refused). A storefront reset retries the same PUT with the same identity and is refused identically. Two levels, both live-verified 2026-08-14 with the DA.live IMS bearer the extension already holds:
  - **Org roster** (read): `GET config/{org}.json` → `users: [{id, email, roles:["admin"]}]`. An empty/absent email here IS the 403. (`config/{org}/access/admin.json` 404s — the roster is the org config itself.)
  - **Site grant** (read + WRITE): `POST config/{org}/sites/{site}/access/admin.json` with `{"role":{"admin":["user@adobe.com"]}}` → 200, and a fresh GET reads it back. Same block is inlined in the site config as `access.admin`. `tools.aem.live/bot/setup` step 3 ("Site users") is this API with a UI on it.

  **An ordinary config EDIT wipes the admin list unless it is captured first.**
  `updateSiteConfig` is delete-then-re-register, and the `access` sub-resource
  lives UNDER the site config — so the delete takes every site-level admin with
  it. Measured 2026-08-14: two grants in, delete, re-register, `access/admin.json`
  back to 404. This runs on every project edit, so a team's admin list evaporated
  each time. `updateSiteConfig` now captures before the delete and restores after,
  REFUSES to run when the current list cannot be read (a failed read and "no
  grants" are indistinguishable), and reports `grantsRestored: false` with masked
  `lostGrants` when the write-back fails. Nothing in the app can restore them
  afterwards — the access endpoint needs the very role that went missing.

  **Both calls need the role already.** The access endpoint sits behind the SAME `[admin]` gate as the config read, so a caller refused on the read is refused on the grant — no self-heal is possible. Authorization is per-ORG: an admin of one org cannot grant into another. And the POST **REPLACES** the `admin` list, so go through `ensureSiteAdmin`/`revokeSiteAdmin` (read-merge-write) or you silently drop every other admin.

  **A fresh site has no access doc.** Registering a site (`PUT .../sites/{site}.json` → 201) does NOT create `access/admin.json` — it 404s, and the site config has no `access` key. `POST` onto that 404 returns 200 and creates it. So "404 on the access read" means *no grants yet*, not *broken*; treat it as empty. (Measured 2026-08-14 with two throwaway sites.)

  Verify the fix by the ONE oracle that matters: the refused user's own `GET config/{org}/sites/{site}.json` flipping 403 → 200. **In-app remedy (SHIPPED 2026-08-14):** `Demo Builder: Manage Site Access` (`manageSiteAccess.ts` → `siteAccessManagerHeadless.ts`) lists/adds/removes admins and confirms every mutation by re-read; when you hold no role it opens the bot-setup flow and polls `configAccessRecovery.waitForConfigAccess` until access actually changes hands. Plan record: `.rptc/plans/config-service-admin-grant/`. (`edsHelpers.ts:BYOM_OVERLAY_NOT_AUTHORIZED_MESSAGE`, `configServiceProbe.ts`.) Do not confuse it with the DA.live org/site scope issue above — different service, different fix.

## Verify

Never assert success from a 2xx on the write — read back from the consuming side:

1. **Publish**: `curl -sI https://main--{repo}--{owner}.aem.live/{path}` → expect 200; on 404, check the body size (litmus above) to locate the failing layer.
2. **Bulk job**: read the job's per-path results from the bulk API response — count succeeded paths; "completed" alone proves nothing.
3. **Helix site config**: GET the config read API for `{owner}/{repo}` and confirm the content source points at the intended DA.live org/site.
4. **DA.live site config**: GET `admin.da.live/config/{org}/{site}` and confirm `aem.repositoryId` is present in the SITE sheet (not only the org sheet); then open the da.live Library and confirm the AEM Assets panel renders.
5. **Editor URL**: open `da.live/canvas#/{org}/{site}/{doc}` and confirm the Outline lists blocks (not "No blocks").

_If this skill was wrong or incomplete, fix it before closing the task._
