# Step 05 — Tile, flyout and agent tools (decision 6)

## The paired card model

`integrationCardModel` learns the bound system: an integration's card carries its system's
state, and a `system` component never becomes a card. Tile status = the worse of the two (`error` > `stale` > `deploying` > `not-deployed`
> `deployed`); the tile's second line names the ERP's status when it differs.

## The flyout

Section 1, as today (integration): status, Commerce install, Open Commerce Admin, source,
destination, URL, APIs in use, action bar.
Section 2, the ERP's name (default "Acme ERP", editable in place like the integration's name): status, "Open ERP" (the SPA URL from `deployedUrls`), "Reset ERP
records" (confirm dialog: "Wipes the ERP and mirrors Commerce again; company blocks and
credit limits the ERP set are undone; orders in Commerce keep their ERP numbers."), the
"ERP offline" switch (with the sentence: "Commerce keeps its own prices and orders place
without an ERP number until it is back."), Redeploy. The integration's Remove names both:
"Removes the integration and its ERP."

Handlers: `resetErpRecords`, `setErpOffline`, `getErpStatus` (health + settings), all
headless-safe, on the dashboard map (pins move).

## Agent tools

`reset_erp_records` (confirm:true + `AGENT_ALERT_COPY`: it wipes records and writes to
Commerce companies), `set_erp_offline` (`{offline: boolean}`; readOnly false, not destructive),
`get_erp_status` (read). Narration, ceilings, battery prompts, auth totals, catalog regen. The
existing per-id deploy/redeploy tools cover both components; `remove_integration` on the
integration removes the unit, and on the system alone it is refused in words.

## Wizard

The Integrations area's card for the pair; the review step's two rows; creation phase 3b
deploys provider then consumer with one progress card each.

## Tests

Card model pairing and worst-status; flyout section rendering and the three actions;
handler suites with the ERP client mocked at the boundary; tool gates and arguments; the
wizard card. Then the full gate.
