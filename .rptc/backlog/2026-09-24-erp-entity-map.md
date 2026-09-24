---
id: AB-26m
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26j, AB-26g]
value: high
status: active
---

# The entity map — the Commerce Admin page where the settings are the mapping

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2 — the App Management form rendering needs a person to look; everything else is testable.**

## What

One card per composite entity (plan §5a), two systems side by side, the pieces of each as rows, the join drawn as a connector with its setting editable on it, ownership as arrow direction, sync state per row (from AB-26g's per-direction records), a link into the ERP's document. The existing switches move onto their cards. A small read on the pair answers 'what do you hold for company / SKU / order X'.

## Design (the loop's design gate, 2026-09-24)

**What entity this is.** A tab on the integration's existing Commerce Admin page
(`src/commerce-backend-ui-2`), not a new page or app: the Admin UI SDK gives an app one
menu entry, and the page already has the scope picker the per-website joins need. The
Mapping tab REPLACES the Settings tab: the owner's decision for this slice is that the
settings are the mapping (programme §6 row 9: "the existing switches move onto the card
they belong to"). Status & sync stays as it is.

**What owns it and where it lives.** A pure view model `mapping-view.js` beside
`settings-view.js` (which keeps `pendingChanges` and `scopeChoices`; `settingSections`
goes, and its tests move), rendered by `components/mapping-tab.jsx`, which takes over the
edit/save state from `settings-form.jsx` (deleted in the same change: nothing soft). The
cards are a fixed list in the view model — one per composite entity of programme §5a —
and every setting field is assigned to its card by name (`orders_*` and
`structure_order_prefix` → Order; `pricing_*` → Price; `structure_sales_org*` → Selling
organization; `structure_owns*` → Fulfilment source; anything else → an Other card, so a
new setting always has a home, as `settingSections` guaranteed).

**What a card shows.** Two systems side by side. Rows are the PAIRED pieces of the
composite with the ownership between them drawn as the arrow's direction (from the
composite research's field-ownership summary: Commerce owns → ; ERP owns ← ; both ↔ with
the rule under it). The join sits at the top of the card as a sentence ("Joined by the
company id"; "Joined by the sales organisation this website sells through") with the
setting that makes it editable right there when there is one. The card's other switches
sit under the rows. Sync state per card comes from the history records (`lib/history.js`,
`lib/erp-event-history.js`) mapped by record kind: order · shipped · invoiced · changed ·
order-status · shipment · invoice · cancel · hold → Order; price → Price; stock →
Inventory position; credit → Credit; block → Buying organization. It reads "In step, last
synced <time>" or "<n> not through" per direction. Live ERP figures come from the status
action's `erp.counts` and `erp.structure`. A link into the ERP's own screen needs the
screen key, which only Demo Builder holds; the card carries the ERP's hash
(`#partners?open=…`) as text the SC can paste, and the link becomes real when the pair
gains a screen URL input (filed, not built here).

**Payment / receivable** is a card too, with its two composites and no join, saying it is
not connected yet (order to cash's payment leg, AB-26s): the map should show the whole
picture, gaps included.

**Alternatives.** (1) A new Admin page per card — one menu entry per app rules it out.
(2) Keep Settings as a tab beside Mapping — two places to change one setting, and the
owner asked for one picture. (3) Draw the join as a real connector graphic — Spectrum has
no connector primitive and a drawn line adds nothing a sentence and an arrow do not; a
three-column row (Commerce · arrow · ERP) is the picture.

**Product intent parked for the walk-through.** Whether the Mapping tab should open first
(it does here: it is the page's purpose now). Whether Payment's card should appear before
AB-26s ships (it does here, labelled).

**Lookup ("what do you hold for company / SKU / order X").** The order half exists (the
trace). Company and SKU need a small action asking both sides; a second step in this item,
after the map itself is on screen.

## Verification block (checked by the loop's done gate — §6a of the plan)

Component tests on the mapping view with fixtures for each card; the Admin page's own preview (`npm run preview` in the integration) checked headlessly; a person confirms the App Management form once, recorded in the report.

## Shipped so far
- 2026-09-24  Picked up (lane 2: the App Management form and the live Admin page need a person; the map, its view model, the preview and the tests are lane 1). Staleness check: the Admin page has Settings and Status tabs with a scope picker (page-shell.jsx); settings are grouped by name prefix (settings-view.js); history records carry direction, kind, outcome, lastAt (lib/history.js, lib/erp-event-history.js); status answers erp.counts and erp.structure. Dependencies AB-26j built and AB-26g built to its supervised edge on the same branch, taken as satisfied (loop report decision 6). Design section written on the item
- 2026-09-24  Step 1 BUILT — integration c419327: the Mapping tab replaces Settings. mapping-view.js (nine cards in the plan's order plus Other; join text + join fields; rows with ownership arrows from the research's field-ownership summary; settings per card; sync per direction from history kinds; ERP figures from status; erpHash), mapping-tab.jsx (takes over the edit/save state; settings-form.jsx deleted; setting-field.jsx shared), page-shell opens on Mapping; preview gains the Structure fields and the ERP's structure; README + demo-setup paths updated. 12 view-model tests; suite 368; biome clean; preview screenshotted at 1280px, console clean. Done gate: no src/ in this repo; architecture-duplication: the map REPLACES the settings form rather than sitting beside it (one place to change a setting); component-extraction: SettingField extracted once, used from two places on the card. NOT verified: the live Admin page; App Management's own form vs this page on a saved value. Remaining in this item: the lookup (what do you hold for company / SKU X) on the Buying organization and Sellable item cards
