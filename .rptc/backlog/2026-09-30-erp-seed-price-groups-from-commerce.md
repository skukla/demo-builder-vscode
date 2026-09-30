---
id: AB-44
kind: feature
area: app-builder
needs: []
value: high
status: active
parent: AB-26
---

# Seed the ERP with price groups and price lists from Commerce's shared catalogs

The implementation of [[AB-42]] (owner decided YES, 2026-09-29). A one-time reverse
seed at fill time: Commerce → ERP, so a demo ERP starts knowing the contract pricing
Commerce already holds instead of blind. The ERP stays the pricing master afterward
(ERP → Commerce is unchanged, AB-26z).

## Why

Before this, `fillErp` (`demo-builder-vscode/src/features/app-builder/services/erpFill.ts`)
seeds products, companies, credit and structure — never price groups or price lists —
and `company-sync.js` never sets a partner's `priceGroup`. So Bodea's three custom shared
catalogs (ServerSavvy Solutions g16, Platinum Buyer g17, Kukla Studios g19) and their tier
prices are invisible to the ERP; a reset/fill strands them. Found live during AB-26e §8.

## The mapping (approved design, AB-42)

1. Each **custom shared catalog** (`GET /V1/sharedCatalog`, type 0) → an **ERP price group**.
2. Each **company partner** gets its `priceGroup` from its shared-catalog customer group.
3. Each shared catalog's **tier prices** → the ERP's **contract prices / price lists** for
   that group.

Setup-only (a real integration would not copy Commerce ongoing); the ERP is master after.

## Plan (leaf-first, TDD)

- demo-erp: `admin` import accepts `priceGroups` + `contracts` rows into `lib/price-groups.js`
  / `lib/contracts.js`; `contract/erp-contract.json` declares the new rows; partner import
  carries `priceGroup`.
- extension: `erpFillReaders.ts` reads shared catalogs + their tier prices; `erpFillRows.ts`
  builds price-group + contract rows and sets `partner.priceGroup`; `erpFill.ts` includes them
  in the import body (`ErpImportBody`).
- Deploy: push demo-erp + extension, redeploy both ERPs, re-fill Bodea, confirm price groups
  and contract prices land (the AB-26e §8 gap closes).

## Done when

A fill/reset gives each ERP a price group per custom shared catalog, each company its price
group, and the shared-catalog tier prices as ERP contract lines — proven live on Bodea.

## Shipped so far
