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
5. **Demo setup guide** (owner, 2026-09-24: "The demo can have whatever we need to have —
   we just need to document it for demo set up"). `commerce-erp-integration/docs/demo-setup.md`,
   SC-facing, public: what the Commerce instance must have for each story, and how to check
   it. Single ERP: nothing beyond a store (all defaults). Structure story: a second website
   with its own Store Information, and the sales-organisation setting on the integration's
   Admin page. Two ERPs: either one inventory source per ERP with products assigned to
   their source, or a product attribute `erp_owner` on every SKU, plus the ownership
   setting on each pair; B2B companies whose admins sit on the right website; the
   order-number prefix per pair. Each requirement names the Admin path and the API check
   that proves it, and the reset/undo for it. Linked from both READMEs and from the ERP
   card's flyout help in Demo Builder when that surface exists.
6. Move this plan to `.rptc/complete/erp-business-structure/` with what was NOT verified
   (App Management `text` rendering; live `store/*` field names if the fixture could not be
   captured).
