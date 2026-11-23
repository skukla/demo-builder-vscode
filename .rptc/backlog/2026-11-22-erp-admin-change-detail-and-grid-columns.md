---
id: AB-26ab
kind: feature
area: app-builder
parent: AB-26
needs: []
value: med
status: backlog
plan: erp-admin-one-home
---

# ERP admin page: what changed, real links, and ERP columns on Commerce's grids

Filed 2026-11-22, when items were linked to their plans. The rest of
`.rptc/plans/erp-admin-one-home/overview.md` ("Order of work"). It continues [[AB-30]], which
shipped.

Phase 1 is built in the integration repo (`2ce45a6`, `715c197`, `39bf970`, `cccb5b7`, all
2026-10-14), except its item 3: one side-panel layout for every record (both sides now, then the
record's history from Activity). What remains, none of it started:

1. **Phase 1, item 3**: the one side-panel layout.
2. **Phase 2, before and after**: each ERP write saves the value Commerce had just before it, so
   Activity can say "from 199.00 to 189.00". Older records keep the new value only.
3. **Phase 2, real links**: each ERP's screen address (Demo Builder knows it), and Commerce's
   internal record ids, which Admin page links need.
4. **Phase 3, ERP columns on Commerce's own grids** (needs the owner's go; a deploy to a scratch
   project): owning ERP, ERP price, ERP stock and last update on the products grid; ERP customer
   number and credit block on the customers grid. No Admin UI SDK extension point for the B2B
   companies grid has been found, so check before promising one.
