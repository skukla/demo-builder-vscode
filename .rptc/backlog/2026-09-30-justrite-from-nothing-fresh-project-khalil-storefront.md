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
