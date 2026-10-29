---
id: AB-45
kind: feature
area: app-builder
needs: []
value: med
status: shipped
parent: AB-26
---

# A Warehouses master-data screen in the ERP

Built 2026-09-30. The ERP masters stock, so the SC (and a JustRite reviewer) expects a
first-class list of warehouses under MASTER DATA — there was none; warehouses only showed
embedded in a product, a shipment, or the Settings structure card. Owner asked for a proper
screen where the SC renames and manages them, moved out of Settings.

## What shipped (demo-erp, uncommitted)

- **`screen/src/components/Warehouses.js`** — a Master Data list: Commerce source (code), Name
  (inline-editable, `EditableText`), Products, In stock. Reads `health.structure.warehouses`;
  rename → `api.renameWarehouse` → reload.
- **Nav:** `Warehouses` added under MASTER DATA in `App.js`, between Products and Customers.
- **`screen/src/api.js`** — `renameWarehouse(code, name)` (a PATCH to the settings warehouse
  names; the name lives with the settings but is managed on this screen now).
- **`lib/structure.js`** — `describeStructure` warehouses now carry a **`stock`** rollup (sum of
  quantities across products), so the screen shows total stock per warehouse.
- **Settings:** the `WarehousesCard` + its rename handler removed (moved here); dead imports
  (`EditableText`, `toastSaved`) dropped. The Organisation/sales-org structure card stays.

Warehouses are still **derived** (one per Commerce inventory source, name stored in settings);
this is the read-only-shell / ERP-manages-the-name model. Elevating a warehouse to a fully
ERP-mastered entity (create/delete, ERP→Commerce source) is the separate option (b) discussion.

## Tests

structure stock-rollup assertion updated; screen fingerprints re-accepted (added `warehouses`,
changed `settings`). demo-erp 378/378.

## Done when

The SC sees a Warehouses list under MASTER DATA and can rename each. DONE (built + green;
deploys with the next demo-erp release).

## Shipped so far

- 2026-10-03  Reconciled 2026-10-03: committed, not 'uncommitted' as the body says — demo-erp 6976b08 on main.
- 2026-10-03  Shipped 2026-10-03 by the owner's finish line for work that lives only in the ERP and integration repositories: on their main branch and deployed (they carry no release tags). Any live proof this item still names is a check, not a reason to hold it open.
