---
id: AB-72
kind: fix
area: app-builder
needs: []
value: high
status: active
---

# ERP ownership: the ERP on "everything" is the catch-all

Filed 2026-10-09.

**The decision (owner, 2026-10-09).** Ownership is by product attribute. An ERP whose rule
is `{ mode: 'all' }` is the CATCH-ALL: it owns every product no other ERP claims by a
product rule, and never competes with a product-rule ERP for a tagged product. The
integration's router is changed to the same precedence in parallel
(commerce-erp-integration, `ownersOfLine`: specific product rules first, then the `all`
ERP, then website rules). The extension mirrors it exactly, in one resolver
(`ownersAcross`, `src/features/app-builder/services/erpOwnership.ts`), which every reader
uses: the Add dialog's counts, the fill's product filter, the ownership pass (owned sets,
the unowned count, the status pass, the notes), and so `add_erp`, `load_erp_demo_data` and
`set_erp_settings`.

**Measured today, on Justrite.** Justrite ERP = all; Accuform ERP = `erp_owner=accuform`
(96 tagged products; 43 tagged justrite; 182 untagged of 321). The add of Accuform was
supposed to narrow Justrite to `erp_owner=justrite` (`existingRulesToChange`, computed in
`AddErpDialog.tsx` from the store options and sent as `existingOwns`), but the dialog's Add
button did not wait for the options read, so a click before the store answered dropped the
narrowing (Justrite stayed `all`), and the order was refused as claimed by both. Had it
worked, 182 untagged products would have belonged to nobody. Under the catch-all rule
neither problem exists: adding by attribute changes no other rule, and the untagged 182
stay with Justrite.

**What changed.**

- `ownedSkus` / `countOwned` (single-rule answers) deleted; `ownersAcross`,
  `ownedSkusAcross`, `overlapsIn`, `rulesAfterAdd`, `countOwnedAfterAdd` added. The fill
  (`fillErp`) takes the other ERPs' rules (`otherErps`, read through the integration by the
  new `erpRules.ts`) and sends each ERP only what it owns across every rule, so an untagged
  product is no longer imported into two ERPs.
- The attribute narrowing is gone. `existingRulesToChange` keeps exactly what the
  precedence requires: a new ERP split by WEBSITE narrows an ERP on everything to the
  websites left over (a catch-all comes before a website rule); with none left over it is
  left alone and the new ERP owns nothing, which the pass says. The handler
  (`erpAddHandler.ownershipToSave`) reads the store for that itself; the `existingOwns`
  payload field is deleted end to end (dialog, hook, request type, handler, `add_erp`
  schema/description), so Add never depends on the dialog's own read. A test presses Add
  before the options arrive and asserts the payload.
- The pass reports overlaps: "N product(s) are claimed by both X and Y; orders for them are
  refused until one rule changes." — in the notes, and so in the `add`, `settings` and
  `load` answers.
- The dialog's note and the existing ERPs' lines say the new truth ("every product no other
  ERP claims"); `docs/systems/erp-integration.md`, `docs/systems/mcp-server.md` and the
  checklist text in `app-builder-components.json` say: tag products for each additional
  ERP; untagged products stay with the ERP on everything.

**Not checked live.** The integration side (`ownersOfLine`) is the owner's parallel change;
the extension was proven by its suites only.
