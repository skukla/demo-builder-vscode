# Step 06 — Live acceptance on Bodea, docs

Owner-gated. On Bodea (ACCS), through the extension and its tools:

1. Add "ERP integration", named e.g. "Nordwind" → ERP deploys, integration deploys, install
   green, mirror ran: the ERP screen lists Bodea's materials and business partners.
2. Place an order on the storefront → the confirmation shows the ERP number; the ERP's Sales
   orders screen shows the order.
3. In the ERP, mark it shipped → the Commerce order shows the change.
4. In the ERP, change a list price and a stock figure → the product in Commerce follows.
5. Add a contract price for a business partner → that company's cart prices from it, the
   ceiling holds.
6. Switch the ERP offline → the cart still totals, an order places without an ERP number;
   switch back.
7. Block a company in the ERP → the Commerce company is blocked; Reset ERP records → the
   block is undone, the ERP is re-mirrored, order numbers continue from where they were, the
   old order shows "before last reset".
8. Remove the integration → uninstalled from Commerce, both apps undeployed, both rows gone;
   the confirmation said the ERP's records survive in the workspace's database.

Every step through an agent tool as well as the flyout, per "hit every surface".

## Docs

`docs/systems/erp-integration.md` (what the tile gives an SC, the two screens, the demo
script above, reset's rule, what is not in the first cut), the catalog's `provider` field in
the component-authoring skill, `mcp-tools.md` regen, `agent-alerts.md` for the reset tool,
ADR-011 gains a reference note (first pre-built integration; the provider link).
