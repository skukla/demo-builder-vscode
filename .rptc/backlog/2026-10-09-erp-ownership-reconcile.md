---
id: AB-70
kind: feature
area: ai
needs: []
value: high
status: built
---

# Ownership reconcile: adding or removing an ERP leaves no products behind

Owner decisions, 2026-10-09 (chat): **by attribute is the default** ownership rule; **the
"by inventory source" rule is deleted outright** (a product in two named sources is owned by
two ERPs, nothing resolves it, and per website tells every story it could); per website is
kept, with the reconcile checking its rules against the store's websites as they stand now.

**What is wrong today** (measured on the Justrite sandbox, 2026-10-09): adding "Kukla ERP"
by attribute gave it zero products, because no Commerce product carries `erp_owner=kukla`,
and nothing said so beyond the dialog's count. The add changed Justrite ERP's rule from
everything to `erp_owner=justrite` (43 products) and said its products "change at its next
Reset ERPs or Load demo data", which is half true: a load adds and updates and never
removes, so Justrite ERP kept all 321 products. Only a reset would have shrunk it. Removing
an ERP changes no rule, so the remaining ERP keeps its attribute rule and the removed ERP's
products belong to nobody: no load adds them, no ERP event for them is applied back, and
what the integration does with an order line nobody owns is untested.

**The rule.** Any change to who owns what is followed by one automatic "apply ownership"
pass across every ERP: after an add, after a remove, after a rule change in Settings, and
on every load. The SC never resets by hand to make the ERPs match the rules. Tagging
products with `erp_owner` in Commerce stays the SC's job.

**What the pass does, per ERP:**

1. Checks the rule against the store as it stands: a per-website rule naming a website
   Commerce no longer has is reported by name; an ERP whose every website is gone owns
   nothing, and the pass says so.
2. Fills the ERP with every product it now owns (the existing fill).
3. Marks the products it no longer owns as discontinued in that ERP, naming the ERP that
   owns them now. No deletes: the demo ERP has no product delete on purpose (contract v17,
   "a product is not deleted because another system dropped it"), and a real ERP
   discontinues too. Reset ERPs stays the only wipe.
4. When a removal leaves ONE ERP, sets its rule back to everything and refills it, so a
   single-ERP project looks as it did before the second ERP was added. With two or more
   left, counts the products no ERP owns and says so: "214 products now belong to no ERP."
5. Reports in words what the SC still has to do: "Kukla ERP owns no products yet: tag
   products with erp_owner=kukla in Commerce, then Load demo data."

**Three repos:**

- demo-erp: a way to mark a product discontinued (a status on the product and a PATCH that
  sets it), if the model lacks one.
- commerce-erp-integration: when a product's `erp_owner` changes, the previous owner
  discontinues it as the new owner receives it; the `structure_owns_sources` setting and the
  `sources` mode removed.
- demo-builder-vscode: the pass itself (`applyErpOwnership`), wired into add, remove,
  Settings and load; attribute as the dialog's and the tool's default; the sources mode
  deleted from the picker, the predicate, the types, the tool schema and the tests; the
  three wording fixes (the "next load" notice, the owns-no-products message, the settings
  tool asking for a component id where the status tool answers a list id).

Order: the extension's pass first (most relief, no cross-repo wait), then the integration's
owner-change handling, then the demo-erp status if the model needs it.

## Built, 2026-10-09 (uncommitted, three branches)

- **demo-builder-vscode** (`fix/copy-second-integration`): `applyErpOwnership` runs after an
  add, a removal, an ownership change in Settings, and every Load demo data (a load from one
  ERP's card now covers every ERP). Attribute is the default; the sources mode is deleted from
  the picker, the predicate, the types, `add_erp` and the docs. The ERP argument accepts a list
  id as well as a component id. 958 suites green, tsc and eslint clean.
- **demo-erp** (`feature/discontinued-status`, from `origin/main`): `discontinued` sales
  status, contract version 20; a discontinued product ships nothing; the screen shows it.
  651 tests green, screen fingerprints re-accepted (status column 115 to 135 px, the two
  quantity columns 6 and 10 px narrower so the grid still fits 1,280 px).
- **commerce-erp-integration** (`feature/ownership-reconcile`, from `origin/main`): the
  sources mode deleted (config, settings, Admin page, readers); after a product change goes
  to its owner, any other ERP still carrying it is told it is discontinued
  (`lib/discontinue-elsewhere.js`); contract v20 vendored. 1,350 tests green, including the
  end-to-end journeys run against the new ERP. Biome reports issues only in six files this
  change does not touch (pre-existing on `main`).

Committed and deployed 2026-10-09 (owner: "Commit and deploy"): demo-erp `2e50537` and
commerce-erp-integration `a53347e` pushed to their `main`; `update_integration` on Justrite
redeployed Justrite ERP, Kukla ERP and the integration from those commits (05:05 to 05:11 UTC,
each component's checkout read back at the new commit). The extension change is in the
release candidate (`cec5d466e`), which runs after the owner's next F5. **Live check 2026-10-09 13:28 UTC, passed (owner: "Check 2 and 3 are okay"):** on Justrite
with two ERPs (Justrite ERP erp_owner=justrite, 43 tagged; Kukla ERP erp_owner=kukla, 0
tagged), Load demo data on the integration ran the pass in 2.5 minutes. Justrite ERP's fill
took 43 products and skipped 278; Kukla ERP's took 0 and skipped 321; the answer's warning
read exactly "Kukla ERP owns no products yet: tag products with erp_owner=kukla in Commerce,
then Load demo data. 278 products belong to no ERP." Read back from Justrite ERP's own
product list (the first 78 of 321 the tool can show): 55 discontinued, 3 sellable, the rest
configurable parents; the first sellable one is tagged justrite in Commerce. Not yet checked
live: add and remove with the pass, and the integration's old-owner discontinue on a tag change.

## Shipped so far
- 2026-10-09  feat(app-builder): ownership is applied across every ERP when it changes (`0d7e46e33`)
- 2026-10-09  docs(backlog): AB-70 deployed to Justrite (`0ec353620`)
- 2026-10-09  fix(erp): ownership pass makes products an ERP owns again sellable again (`7c47869b9`)
- 2026-10-09  docs(backlog): AB-70 passed its first live check on Justrite (`0a02fa8dd`)
- 2026-10-09  Live remove of Kukla ERP (human surface) completed with 'Justrite ERP owns every product again', but the 278 products Justrite owned again stayed discontinued (an import never resets a status). Fixed both sides: extension pass restores sellable (7c47869b9); integration restores at the owner (commerce-erp-integration ad1f4c3 on feature/ownership-reconcile, not pushed or deployed yet). Owner-side next: F5, then Load demo data on Justrite to restore the 278.
- 2026-10-09  Integration owner-side restore (commerce-erp-integration ad1f4c3, contract v21 51dc746) pushed to main and deployed to Justrite via update_integration. Justrite ERP redeployed at demo-erp 89a3ad0 (order page shows the next step; v21).
- 2026-10-09  fix(integrations): removing an ERP takes it off its integration's systems list (`b000fd5b5`)
