# Step 05 — The record catches up

1. `../research/multi-erp-order-routing/research.md` gains a "Who this is for" section at
   the top: the routing client runs several unnamed ERPs, masters each product line in its
   own ERP, aggregates them through a PIM into one catalog; a different client runs
   Dynamics 365. No client names (public repo).
2. `demo-erp/README.md`: collection table (partners: sales organisations, legal identity;
   orders: sales organisation; settings: warehouses, organisation), routes, contract v2.
3. `commerce-erp-integration/README.md`: the Structure settings, the mirror's new reads,
   the order's `salesOrg`.
4. `erp-realism-audit` and `erp-bidirectional-review` item 7: a one-line "built by
   `erp-business-structure`" pointer, no rewriting of dated statements.
5. Move this plan to `.rptc/complete/erp-business-structure/` with what was NOT verified
   (App Management `text` rendering; live `store/*` field names if the fixture could not be
   captured).
