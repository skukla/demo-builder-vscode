# Resetting one ERP (AB-16c)

Draft, 2026-09-28 (unattended loop). Not built. Written because the obvious build is wrong.

## Today

"Reset records" undoes what the integration wrote into Commerce for **every** ERP
(`erp/detach`), then wipes and refills every ERP. The Demo Builder handler says so
(`resetErp`, `erpIntegrationHandlers.ts`): "Every ERP, because the undo is the integration's
and covers them all."

## Why "filter the undo list by ERP" is not enough

The integration's record of its writes (`src/lib/ledger.js`) keeps, per value, the FIRST
`before` it saw. Three kinds of value are shared between ERPs:

| Value | Who writes it | Undo one ERP by restoring `before`? |
|---|---|---|
| Company custom attributes | every ERP, as ONE whole set (`applyErpCredit`, `erp-credit.js`) | No: it would also erase the other ERPs' `erp_<id>_*` values |
| Company credit limit | every ERP: the total across ERPs | No: it would drop the other ERPs' share |
| Product name, price, stock | the ERP that owns the product (`erp_owner`) | Yes, once each entry names its ERP |
| Tier prices | one ERP per row, already named (`erpId`) | Yes, already |
| Order ERP numbers | only single-ERP orders carry one; a split order carries none (`part-changes.js`) | Yes: clear what that ERP's own order list names |

## Recommended design

1. **Every ledger write names its ERP** (`erpId`; an entry without one is the first ERP's,
   the rule the key map already uses).
2. **`erp/detach?erp=<id>`** undoes only that ERP:
   - removes that ERP's `erp_<id>_*` attributes from each company it wrote, keeping the rest;
   - sets the credit limit to the total of the ERPs that remain, or back to the ledgered
     `before` when none remain;
   - reverts that ERP's product and tier price entries;
   - clears the ERP numbers and holds of the orders that ERP lists.
   Without `erp`, it behaves as today.
3. **Demo Builder**: `reset_erp_records` gains the optional `erp` the load tool already takes;
   the ERP's own card resets only that ERP; the integration's card keeps "every ERP".

## Open

- What the whole-set undo (no `erp`) should do with ledger entries written before step 1:
  nothing changes for it, since it already restores the first `before`.
- Whether the dialog on an ERP's card should say the other ERPs are untouched (recommended: yes).

## Why it matters now

Contoso on Bodea still holds 182 products from its first, whole-catalog fill (AB-16d). A
per-ERP reset clears them without touching Northwind. A full reset also clears them, and needs
nothing built.

## Built (2026-09-28, loop)

- Integration `loop/ab-16c-per-erp-detach` (`f73642a`, `368522c`, `adf14cc`; 768 tests): every
  ledger write names its ERP; `erp/detach?erp=` undoes one ERP and answers `erp`; `erp/status`
  answers `detachesPerErp: true`. An unlisted id is a 400.
- Demo Builder `feature/erp-integration`: the ERP card and `reset_erp_records` (`erp`) reset one
  ERP; an integration without `detachesPerErp` is refused before any undo.
- Choices made while building:
  - One ledger entry per value still keeps the FIRST `before`; its ERP is the latest writer.
    Undoing the latest writer restores Commerce's original, not an older ERP's value.
  - Company credit entries list their ERPs (`erpIds`); the attribute set written back is
    Commerce's CURRENT set minus that ERP's attributes, so hand edits survive.
- **Limit:** entries written before this change name no ERP and count as the first ERP's. So a
  one-ERP reset of Contoso on Bodea will NOT revert its 182 old product writes until Contoso
  writes them again; a full reset clears them.
