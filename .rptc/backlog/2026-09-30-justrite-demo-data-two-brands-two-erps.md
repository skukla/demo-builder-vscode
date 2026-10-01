---
id: AB-52
kind: feature
area: app-builder
needs: [AB-51]
value: high
status: active
parent: AB-16
---

# Bodea's demo data reflects the JustRite picture: two brands, two ERPs, one cart

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-09-30. Owner: "What I want is to reflect the use cases that we have diagram
specifically for justrite." The deck is `Justrite — Commerce and Multi-ERP.pptx` in the
client folder; the tech case names the pair itself: "a customer can buy a Justrite cabinet
and the AccuformNMC signs for it in one checkout" (`deliverables/analysis/topics/commercial-topology.md`).

## The picture (deck slides 24, 26, 27, 38)

- Two brands on one website, one cart: `brand` is what shoppers see and filter by;
  `erp_owner` (hidden) is what routing reads. The PIM sets both; in the demo, setup does.
- Cabinet ERP owns the cabinets, Signage ERP owns the signs; each has its own inventory
  source (warehouse). Source is the safety net, the attribute is the rule.
- Each brand's ERP writes its own products' contract prices into the company's shared
  catalog.

## Bodea today (read live 2026-09-30)

- 229 products; `erp_owner` on 6 (3 tech products each). Justrite's 43 products (loaded
  2026-09-30 from Khalil's spreadsheet) carry neither `brand` nor `erp_owner`; 49 SKUs are
  stocked in the Northwind Warehouse source.
- `brand` is a select holding Bodea's phone brands only.
- Two ERPs: Northwind (`erp`), Contoso (`demo-erp-2`) — see AB-51 for the ids.
- Four companies; ServerSavvy and Kukla Studios have their own shared catalogs; the ERPs hold
  0 contracts and 0 pricing conditions (the last fill predates the price-group seeding).
- No second brand's products exist. accuform.com is behind Cloudflare (403 to fetch and to the
  harness browser, 2026-09-30), so AccuformNMC products are MADE for the demo, not scraped.

## Plan

1. AB-51 lands (named ERP ids).
2. `brand` options: Justrite, AccuformNMC. Justrite's 43 products: `brand=Justrite`,
   `erp_owner=<cabinet ERP id>`, stock in that ERP's source.
3. AccuformNMC signs: ~24 products in 4 categories (Danger, Caution, Notice, Labels & Tags),
   3 formats each as configurable variants (Aluminum, Plastic, Adhesive Vinyl), on the Justrite
   website, `brand=AccuformNMC`, `erp_owner=<signage ERP id>`, stocked in that ERP's source.
   Images generated (a sign is text on a colour), uploaded to Commerce media.
4. Reset the ERPs, redeploy (new ids), load demo data; contract prices in the two companies'
   shared catalogs so the fill seeds price groups.
5. Walk the cart: one cart, cabinet + sign → two ERP orders; the deck's journey slides 29–34.

Open: should the ERPs be renamed for the brands ("Justrite ERP", "Accuform ERP") before their
ids are recorded? Recommended yes — the ids then read `justrite` / `accuform`, as the deck's
"Cabinet ERP / Signage ERP" do. Northwind/Contoso stay available for a generic demo.

## Shipped so far
- 2026-10-01  Steps 1-4 done live on the justrite project 2026-09-30/10-01 (see AB-53): brand options Justrite/AccuformNMC, 43 Justrite products tagged, 96 AccuformNMC products (24 configurables x 3 formats) on the Justrite website stocked in source accuform, ERPs renamed and refilled, contract prices in shared catalogs 15/16. Not done: images (the gallery API is closed by the AEM Assets integration; owner decision) and step 5, the walk (AB-16f). 2026-10-01: the 24 Accuform configurable parents read out of stock in Catalog Service because their own stock flag was false; set true in one bulk call.
