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
Redeploy. The integration's Remove names both:
"Removes the integration and its ERP."

Handlers: `resetErpRecords`, `getErpStatus` (health + settings), all
headless-safe, on the dashboard map (pins move).

## Agent tools

`reset_erp_records` (confirm:true + `AGENT_ALERT_COPY`: it wipes records and writes to
Commerce companies),
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


**Decision 19 (2026-09-14):** no "ERP offline" switch and no `set_erp_offline` tool on this surface. The demo is the flow between the two systems with the ERP shown as the supposed master; unavailability is a robustness property, tested on the ERP's own Settings screen.

## Built (2026-09-14)

`IntegrationCardModel.system` (`BoundSystemModel`: id, name, status, label, dot, message,
url, last deploy) is derived in `buildIntegrationCards` by pairing a `kind: 'system'` row to
the integration its catalog entry names in `boundTo` (the caller's catalog first, the bundled
one else); a system never becomes a card and its own `deploying` push never synthesizes one.
The face reads the pair's worse status and names the wrong half in `message`; while the ERP
deploys first, its step is the face's label. Three `CardAction`s: `open-system`,
`reset-system`, `redeploy-system` (offered after the integration's own verbs; reset only with
both halves deployed). `IntegrationDetailPanel` gains the system's section (status, "Open
<name>", last deploy). `IntegrationsGrid` dispatches them: the ERP screen via `openLiveSite`,
the redeploy by the ERP's own id, the reset through a new `ErpResetDialog` that posts
`resetErpRecords` with the INTEGRATION's id; Remove on the pair says the ERP goes too and
where its records stay.

Handlers (`erpIntegrationHandlers.ts`): `getErpStatus` (read, headless-safe, typed
AUTH_REQUIRED) and `resetErpRecords` (guards → progress → the integration's `erp/reset`),
over `erpIntegrationClient.ts` (bearer + org header, URLs off `deployedUrls`). Dashboard map
38 → 40. Tools: `get_erp_status` (read descriptor) and `reset_erp_records` (confirm-gated,
`AGENT_ALERT_COPY`), narration, response-size classification, catalog regen, two battery
prompts, `agent-alerts.md`. Removing the ERP alone is refused by the runner, so
`remove_integration` on it answers in words.

Wizard: catalog rows carry `companion` (the bound system's name); the card's subline says
"Comes with <name>"; the review and the build summary list the system as its own row. The
Integrations area's gallery still lists integrations only. Creation phase 3b needs no change:
the runner's add deploys the pair, and its progress rides the phase's reporter.

Not done here: live acceptance (step 06, owner-gated "install"); the ERP's name editable in
place on the flyout (Configure Project edits it today); updates (step 07).
