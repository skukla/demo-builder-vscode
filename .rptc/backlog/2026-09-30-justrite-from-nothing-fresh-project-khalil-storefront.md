---
id: AB-53
kind: epic
area: app-builder
needs: [AB-51]
value: high
status: active
---

# JustRite from nothing: wipe the Adobe I/O project, rebuild on Khalil's storefront, one data model

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-09-30. Owner: "I eventually want to wipe everything including the entire Adobe IO
project and start from absolutely nothing inside of the demo builder. … I also need to deploy
Khalil's justrite storefront with his content. And I'd like to clean up as much of my commerce
instance as I possibly can, which includes websites I'm no longer using. … will we create MSI
sources per ERP? We currently have northwind and east which seems inconsistent."

Supersedes the reset-in-place and remove-and-re-add plans on AB-52; AB-52's data (brands,
owners, the AccuformNMC catalog) lands inside this.

## What exists (read live 2026-09-30)

**Khalil's storefront.** `github.com/kmanns/justrite` — public, branch `main`, updated
2026-09-25; the owner's account has pull only (no push, none needed: a project clones a
template, it never pushes to it). `fstab.yaml` mounts `https://content.da.live/kmanns/justrite/`,
so the content is in Khalil's DA.live org `kmanns`, site `justrite`. Live site
`https://main--justrite--kmanns.aem.live` (robots forbids automated reads; a browser reads it).
This is exactly the shape a demo package has (`templateOwner`/`templateRepo` +
`contentSource {org, site, indexPath}`), and the shape "Add a demo someone shared" takes by link.

**Commerce (Bodea ACCS).** Websites: Main (`base`, 0 products — the default, cannot be deleted),
CitiSignal (130), Bodea (56), Justrite (43). Stocks: Default Stock sells for base + citisignal +
justrite from the `default` source; Bodea Stock sells for bodea. Sources: `default`, `east`,
`northwind`. So the Justrite website sells from Default Stock while its 43 products are stocked
in Northwind Warehouse, a source that stock does not hold — the inconsistency the owner saw.
Shared catalogs 12–14 (ServerSavvy, Platinum Buyer, Kukla Studios) carry `store_id` 3 (Bodea).
Companies: Altura, ServerSavvy Solutions, RackMaster, Kukla Studios Final.

**Adobe / Demo Builder.** One project, Bodea, on the "Kukla Bodea" Adobe I/O project, with the
ERP integration + Northwind (`erp`) + Contoso (`demo-erp-2`).

## The plan, in order

1. **Permissions from Khalil.** Read on DA.live `kmanns/justrite` for the owner's account (the
   content copy runs with the owner's DA.live sign-in). Nothing on GitHub: the repo is public.
2. **Tear down.** Delete the Bodea project in Demo Builder (removes the integration and both ERPs:
   undo, uninstall, wipe, undeploy, workspaces); then `delete_adobe_project` on Kukla Bodea. Both
   consent-gated, owner present.
3. **Clean Commerce.** Delete the CitiSignal and Bodea websites (stores, views); their products
   stay in the catalog unassigned, to be deleted or left (decide). Re-point shared catalogs 12–14
   from store 3 to the Justrite store, or recreate them per company. Main Website stays (Commerce
   keeps one), empty. Disable `east` and `northwind` (MSI sources cannot be deleted; codes are
   immutable) and create the sources the model below names.
4. **One data model** (the deck, slides 24/26/27/38):
   - website `justrite` = the North America site: one cart, every brand.
   - `brand` (select, shopper-facing): Justrite, AccuformNMC.
   - `erp_owner` (text, routing): `justrite`, `accuform` — the ERPs' list ids (AB-51), which are
     the ERPs' names slugged, so the ERPs are named **Justrite ERP** and **Accuform ERP**.
   - one MSI source per ERP, named for it: `justrite` "Justrite Warehouse", `accuform` "Accuform
     Warehouse" (the ERP mirrors sources as its warehouses, by code); one stock "Justrite Stock",
     sales channel `justrite`, both sources assigned. Default Stock keeps `base` only.
   - products: Justrite's 43 (Khalil's spreadsheet) → brand Justrite, owner justrite, stocked in
     `justrite`; AccuformNMC's 24 signs × 3 formats (AB-52, made) → brand AccuformNMC, owner
     accuform, stocked in `accuform`.
   - companies: one shared catalog each for the priced companies, on the Justrite store; contract
     prices per brand in it (the fill seeds the ERPs' price groups from these).
5. **Rebuild in Demo Builder.** New project from Khalil's storefront (Add a demo someone shared →
   repo link; own GitHub repo + own DA.live site, his content copied), backend = this ACCS
   instance, Justrite website; add the ERP integration naming the ERP "Justrite ERP"; Add another
   ERP "Accuform ERP"; set each ERP's ownership (attribute, the default); walk the setup checklist;
   Load demo data.
6. **End-to-end** (AB-16f): cabinet + sign in one cart → two ERP orders; ship/bill per brand;
   credit hold; ERP down; cancel; the deck's journey slides 29–34.

## Open decisions (owner)

- Delete the unassigned CitiSignal/Bodea products too, or leave them off every website?
- The four companies: keep (re-pointed to the Justrite site) or recreate for the JustRite story
  (a distributor, a direct buyer)?
- Copy Khalil's content into the owner's own DA.live site (recommended: edits never touch his)
  or point the project at his site read-only?

## Shipped so far
- 2026-09-30  Owner decisions 2026-09-30: (1) copy Khalil's content into the owner's OWN DA.live site (the shape the shared-storefront feature builds; his site stays untouched); (2) proceed without his read grant — his published site is what the copy uses (sitemap.json lists 122 pages, read 2026-09-30); the block library rebuilds from his repo's component-definition.json until EDS-22's authored copy exists, and stays as the fallback after it. Starting step 2 (tear down) now.
- 2026-09-30  Tear-down inventory, read live 2026-09-30 before deleting: project bodea (eds-accs) on Adobe project 'Kukla Bodea' (214BrownArmadillo, 4566206088345759588, workspace Production, deletable:true), storefront skukla/kukla-bodea (live main--kukla-bodea--skukla.aem.live, DA.live skukla/kukla-bodea), mesh eds-accs-mesh in the project workspace, erp-integration + demo-erp in workspace NorthwindERP, demo-erp-2 in ContosoERP. Order: remove_integration erp-integration → delete_project bodea (repo + DA site) → delete_adobe_project.
- 2026-09-30  2026-09-30 tear-down done through the extension's tools, no dialogs (requireAgentConsent off): remove_integration erp-integration — 2 company changes undone, 12 Runtime packages deleted and verified, Northwind ERP + Contoso ERP workspaces deleted; delete_project bodea — files, repo skukla/kukla-bodea and DA.live content deleted (0 pages needed unpublishing; the CDN may still serve until Code Sync notices the repo is gone); delete_adobe_project 214BrownArmadillo (Kukla Bodea) — deleted, no longer listed. Left alone, for the owner: an older Adobe project 'Kukla Bodea Mesh' (KuklaBodeaMesh5NgV), deletable. Reorder: Commerce clean-up (step 3) now follows project creation (step 5), because the Commerce REST tools sign with the current project's credential and there is no project.
- 2026-09-30  2026-09-30 step 5 prepared: Adobe project 'Kukla Justrite' created (KuklaJustriteXjap, 4566206088345767656) and selected; Khalil's storefront added as demo card added:kmanns/justrite (probe: eds, B2B on from config.json, 122 published pages, store codes justrite/juststore/justeng); ACCS endpoint verified live — https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql answers, and says store 'justeng' is not found: Khalil's codes are not this instance's (justrite / justrite_store / justrite_us), so after creation configure_project storeScope sets the three codes, then republish. Blocked on: DA.live sign-in (session dropped by the host reload; connect_dalive is a bookmarklet handoff). Next: create_project projectName=justrite stack=eds-accs package=added:kmanns/justrite repoName=kukla-justrite githubOwner=skukla daLiveOrg=skukla daLiveSite=kukla-justrite accsEndpoint=<above>.
- 2026-09-30  Storefront code was never on the CDN: Helix's code endpoint says '[admin] github bot not installed on repository' for skukla/kukla-justrite (read 2026-09-30 after ece349c70 made previewCode carry x-error). The status endpoint's inner code 400 carries no reason and the app check classes it as installed, so creation reported 'AEM Code Sync verified' and 'Code synchronized' over a repo the App never covered — filed as EDS-23. Creation now says 'Code not published to the CDN: <reason>' (ece349c70). Owner action: add the repository to the AEM Code Sync installation on GitHub, then republish.
- 2026-09-30  2026-09-30 step 5 continued: two more agent-path gaps found and fixed on the branch — create_project never recorded ACCS_GRAPHQL_ENDPOINT on the backend's config (d699b6ec4) and set_project_destination kept organization '' for a project created without Adobe context (74a8fde77); justrite repaired live through configure_project env + set_project_destination. ERP integration added with the ERP named 'Justrite ERP' (list id justrite, workspace JustriteERP, deployed 23:13Z; ERP empty: 0 products, 0 warehouses — the fill finds nothing until the data model below lands). run_commerce_rest works. Read live: sources default/east/northwind; Default Stock sells base+citisignal+justrite, Bodea Stock sells bodea; brand select holds CitiSignal's five labels; erp_owner=erp on 3 Bodea products only; 229 products; shared catalogs 12–14 on store 3; companies Altura, ServerSavvy, RackMaster, Kukla Studios Final. Storefront code still 404 on the CDN pending the owner adding the repo to the AEM Code Sync app.
- 2026-09-30  Data model landing 2026-09-30 through the extension's Commerce REST tools: sources justrite (Mattoon IL) + accuform (Brooksville FL) created; Justrite Stock (id 3) sells website justrite from both (justrite priority 1); Default Stock now base+citisignal only; east + northwind disabled (reversible; they hold Bodea/CitiSignal stock only — the AB-53 premise that Justrite's products sat in northwind was wrong: they sat in Default Source). brand options Justrite 265 / AccuformNMC 266 added and brand put into the Default attribute set (it was missing; erp_owner and cs_format were already there). cs_format options 267/268/269 for the 10x14 aluminum/plastic/vinyl formats. Categories Safety Signs 135 > Danger 136 / Warning 137 / Caution 138 / Notice 139 under the Justrite root. 37 Justrite stock rows moved default -> justrite in one call each way. Shared catalogs 12–14 re-pointed store 3 -> 5. 43 Justrite products tagged brand=265 erp_owner=justrite (13 s each); 72 AccuformNMC variants + 24 configurables loading (brand 266, erp_owner accuform, stock 100 in accuform). Images: NOT loadable over REST here — 'Adding a new gallery entry has been disabled by AEM Assets Integration'; owner: images go to AEM Assets in a separate step (the 24 PNGs are in the session scratchpad accuform-images/).
- 2026-10-01  2026-09-30 data load complete: 43 Justrite products tagged (erp_owner=justrite, brand Justrite) and 96 AccuformNMC products created (72 simples in cs_format 267/268/269 + 24 configurables on attribute 313, linked; erp_owner=accuform, brand AccuformNMC, website 5, categories 136–139, 72 stock rows of 100 in source accuform), 0 failures, ~35 min at 13–25 s per save. No images (AEM Assets Integration blocks the gallery API). Next: add_erp 'Accuform ERP', load_erp_demo_data, check_setup_steps.
- 2026-10-01  2026-09-30 20:12Z: add_erp 'Accuform ERP' -> demo-erp-2 in workspace AccuformERP (namespace 285361-kuklajustritexjap-accuformerp), 146 s; the integration's list is now [justrite, accuform]. load_erp_demo_data for both ERPs started 20:12:55Z. write_commerce_rest gained bulk:true (713af4e5b) — the per-product loop the owner objected to becomes one call; live proof on this instance follows the fill.
- 2026-10-01  2026-09-30 fill + reset: load_erp_demo_data filled Justrite ERP (43 products, 4 partners) and Accuform ERP (96, 4). The Justrite ERP then showed 139 products / 207 events — it had received the 96 Accuform product events while it was the only ERP — so reset_erp_records wiped and refilled both: Justrite 43, Accuform 96, clean. Each ERP mirrors warehouses [its own, default]; both show one sales org (Main Website/base, 4 customers) because the four companies' customers live on website base, none on justrite — a company on the Justrite website is needed before the e2e journey (owner decision: keep or recreate companies). check_setup_steps: company-catalogs, second-source, erp-attributes DONE; by hand in Admin still open: confirmed-status (erp_confirmed order status), price-scope-website, partially-held-status, payment-on-account. Bulk API: POST <tenant>/async/bulk/V1/products/bySku answered an EMPTY 404 (gateway, not Commerce — Commerce's own 404s carry a message, and GET V1/bulk/<uuid>/status answers 'Bulk uuid not exist', so the bulk module itself is present); docs check in progress.
- 2026-10-01  Bulk API proven live (28ae9dca3): 43-product PUT in one call, complete in under 40 s end to end — see AI-10.
- 2026-10-01  2026-10-01 00:30–00:45Z companies rebuilt for the JustRite story (owner: 'Go. Delete the lot and build what we need'): customer groups 20 'Northgate Industrial Supply' + 21 'Harbor Metalworks'; admins Dana Whitfield (customer 49) and Ray Okafor (50) created with POST customers on website 5 — the ACCS docs say POST V1/customers is unsupported; it works; companies 22 Northgate (distributor, Columbus OH, group 20) and 23 Harbor (plant, Toledo OH, group 21); Northgate credit limit 25,000 USD (companyCredits/22); shared catalogs 15 (Northgate) and 16 (Harbor) on store 5, each with its company and all 139 Justrite-website products; 109 Northgate tier prices in ONE call (products/tier-prices: Justrite -10%, AccuformNMC -15%, website_id 0 because price scope is still Global). The DELETE of the old 4 companies / 9 customers / 3 catalogs / 3 groups was refused by the Claude Code auto-mode classifier (irreversible deletion); owner is granting permission. ERP refill (reset_erp_records) deliberately waits for that delete so the partner lists come out clean.
- 2026-10-01  2026-10-01 00:50Z clean slate done (owner granted the delete permission): shared catalogs 12–14, companies 18–21, customers 4/5/36–41/44 deleted; customer groups 16/17/19 went with their catalogs (DELETE answered 404 = already gone). Commerce now holds exactly: companies 22 Northgate + 23 Harbor, customers 49 + 50 on website justrite, shared catalogs 15 + 16 (+ Default), customer groups 20 + 21 (+ the four stock ones). reset_erp_records running to refill both ERPs with the new partners and Northgate's contract prices.
