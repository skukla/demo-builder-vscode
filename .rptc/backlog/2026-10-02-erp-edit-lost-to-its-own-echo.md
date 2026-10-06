---
id: AB-62
kind: fix
area: app-builder
needs: []
value: med
status: shipped
parent: AB-26
---

# A second ERP edit to a product can lose to the first edit's echo

Found live on Justrite, 2026-10-02, product 51BSCU-BLBK, from the Justrite ERP's own journal:

- 16:06:34 the ERP renames the product ("… (test)"); Commerce follows.
- 16:06:45 Commerce's save comes back and is imported into the ERP (name "… (test)").
- 16:06:48 the ERP renames it back; its Product.Changed is sent.
- 16:06:56 a SECOND Commerce save from the first rename is imported: the ERP's name is
  "… (test)" again.
- The integration's handler for the 16:06:48 event reads the ERP's CURRENT product
  (commerce-erp-integration `actions/product/external/updated/index.js`, `currentProduct`), which
  by then says "… (test)", so Commerce keeps "… (test)". Both systems agree, on the older value.

So an ERP edit made within about 20 seconds of an earlier edit to the same product can be
undone by the earlier edit's echo. Older than the event-language change (AB-26y); a person
editing by hand rarely hits it, a script does.

## Recommendation

The import of a Commerce change should not overwrite an ERP field the ERP itself changed after
the change being echoed. Cheapest form: the integration tags the Commerce write it makes for an
ERP event, and drops the Commerce save event that write causes (it already knows its own
writes: the ledger records them), instead of importing it back into the ERP.

## Shipped so far

- 2026-10-03  Fixed 2026-10-03 (overnight loop): the integration remembers its own product write for two minutes and drops the Commerce save it causes (commerce-erp-integration fee5a13, branch loop/2026-10-03-overnight; src/lib/own-writes.js). A box journey replays the live timeline and failed before. Live check owed: the quick rename on Justrite.
- 2026-10-06  Shipped 2026-10-05: every commit is on its repository's main, and Justrite deployed demo-erp 5f912cd and the integration c099eb9 (cloned from GitHub main, status deployed at 21:32Z/21:35Z). Any live check this item names is a check, not a reason to hold it open.
