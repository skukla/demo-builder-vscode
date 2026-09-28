# Several ERPs: Phase C1 screen listing

Written 2026-09-28. Phase C1 of `overview.md` §5a: list every screen an SC or merchant uses
for the ERP demo, before changing anything. **Listing only. Nothing here is an edit.**
Observations are marked as such.

**Code read** (all read-only):

| Repo | Checkout and branch |
|---|---|
| Demo Builder | `demo-builder-vscode.worktrees/feature/erp-integration` (HEAD `b8c60d0bc`) |
| Integration | `commerce-erp-integration` on `loop/2026-09-24-erp-programme` (HEAD `a926063`) |
| Mock ERP | `demo-erp` on `loop/2026-09-24-erp-programme` (HEAD `1e65217`) |

**Legend.**
- *Several ERPs?* **yes** means it works with two or more ERPs. **partly** means it works but hides which ERP is which, or covers only one. **no** means it assumes one ERP.
- *V* lists the vignettes in `vignettes.md` that the surface serves, by number (0 to 11).
- DB = `demo-builder-vscode` worktree, `src/`.
- INT = `commerce-erp-integration/src/commerce-backend-ui-2/web-src/src/`.
- ERP = `demo-erp/screen/src/components/`.

## 1. Demo Builder (VS Code extension, used by the SC)

| Surface | Where | Shows | Actions | Several ERPs? (evidence) | V |
|---|---|---|---|---|---|
| Integrations grid | DB `features/dashboard/ui/components/integrations/IntegrationsGrid.tsx`, cards from `integrationCardModel.ts` | The integration card, followed by one card per ERP it uses | Opens a card's flyout | **yes**: each integration is followed by all its systems (`integrationCardModel.ts:727-737`) | 8 |
| Integration card menu | DB `core/ui/components/integrations/IntegrationActionsMenu.tsx` | Kebab menu (the ⋮ button) | Settings, Add another ERP, Manage APIs, redeploy, Remove | **yes**: "Add another ERP" (`IntegrationActionsMenu.tsx:53`; placed by `integrationCardModel.ts:434-443`) | 8 |
| ERP card menu | DB `.../integrations/systemCardActions.ts` | That ERP's own verbs | Open screen, Load demo data, Reset records | **yes** for Open and Load: both pass this ERP's id (`:39`, `:43`). Reset: see the next row | 8 |
| Reset ERP records dialog | DB `features/dashboard/ui/components/ErpResetDialog.tsx` | "Wipes every record in **{one ERP}**" | Reset, Close | **partly**. The text names one ERP (`:41`), but the reset wipes and refills EVERY ERP the integration serves (`handlers/erpIntegrationHandlers.ts:181-196`; `systemCardActions.ts:5` says so) | 5, 7 |
| Add another ERP dialog | DB `.../components/AddErpDialog.tsx` | Name field; explains `erp_owner` routing | Add | **yes**: refuses a name already used in the project (`:30-36`) | 8 |
| Flyout (detail panel) | DB `.../integrations/IntegrationDetailPanel.tsx`, `LinkedSection.tsx` | Uses / Used by, status, Commerce install, settings summary, checklist summary, source, URL, APIs, last deploy | Rename, open linked card, Edit settings, open guide | **yes**: "Uses" lists every ERP with its status (`LinkedSection.tsx:36-45`) | 8 |
| Settings modal | DB `.../components/IntegrationSettingsModal.tsx`, `features/app-builder/services/componentSettings.ts` | Text and secret settings, plus read-only "connected" values | Save | **partly**. Each connected value comes from ONE paired system, chosen by copy number (`componentSettings.ts:108-116` → `appBuilderComponentLinks.ts:178-181`). An ERP added to the list is not shown there | 11 |
| Setup checklist (flyout part) | DB `.../integrations/SetupChecklistSection.tsx`, `useSetupChecklist.ts`; steps in `features/components/config/app-builder-components.json:93-126` | Six Commerce setup steps with their state | Check now, Mark done, Skip | **partly**. One checklist per integration. "Give the ERP a warehouse of its own" (`json:106`) passes once ANY one non-default source is in a website's stock (`features/app-builder/services/setupChecks.ts:153-156`), so it cannot tell whether a second ERP has its own warehouse | 3, 5, 11 |
| Setup guide | DB `.../integrations/SetupGuideModal.tsx` | The same steps, one per page, with what to do and why | Open Admin, Check now, Mark done, Skip | **partly**, for the same reason as the checklist | 0, 3, 5 |
| Progress modal | DB `core/ui/components/feedback/OperationProgressModal.tsx` | Step-by-step progress of add, fill and reset | Close | **yes**: reset reports "Wiping {name}" for each ERP (`erpIntegrationHandlers.ts:184`) | 8 |
| Wizard Integrations area | DB `features/project-creation/ui/steps/IntegrationsStep.tsx`, `integration-flow/integrationCards.ts:134` | Choose the ERP integration and the ERP that comes with it | Select | **no, by design**: one ERP at creation; the second is added later from the card | 8 |

## 2. The integration's Admin page in Commerce (used by merchant staff; the SC shows it)

| Surface | Where | Shows | Actions | Several ERPs? (evidence) | V |
|---|---|---|---|---|---|
| Menu entry | `commerce-erp-integration/app.commerce.config.ts:76-84` | "Integration", with the page title = one ERP's name | — | **no**: the title is `erpName` (`:83`) | — |
| Page header | INT `components/integration-page.jsx` | Whether each ERP answers | — (no Refresh, by design) | **yes** for the status lights (`:70-90`, `:107-111`). The name passed to every section is still `status.erp` only (`:103-104`) | 6 |
| Overview | INT `components/overview-section.jsx` | Counts (products, partners, orders, pending events), last import and wipe | Look up by SKU or company | **no**: reads `status.erp` only (`:16`, `:23-37`) | 0, 8 |
| Lookup | INT `components/lookup.jsx` | One record side by side, Commerce and the ERP | Look up | **no**: one ERP column (`:64-67`); the call sends no ERP id (`api.js:45`) | 2 |
| Activity: History | INT `components/history.jsx`, `history-view.js` | What crossed each way; failed only | Refresh, Retry per row | **no**: "To/From {erpName}" (`history-view.js:62-65`); no ERP filter (`api.js:42`) | 6 |
| Activity: Order trace | INT `components/order-trace.jsx`, `trace-view.js` | One order's journey | Follow, Retry per step | **no**: one ERP, one number, one status (`trace-view.js:44-65`); no parts | 1, 6 |
| Settings, with website scope and ERP switcher | INT `components/settings-section.jsx`, `scope-switcher.jsx`, `settings-view.js` | Settings per website with "Use Default"; with 2+ ERPs, a picker: "Every ERP" or one ERP | Save, Cancel | **yes**: `erpChoices` (`settings-view.js:178-186`); saves one ERP's keys (`settings-section.jsx:168-178`). One sentence is still singular, "this ERP owns" (`:255-259`) | 11 |
| Order view button "ERP parts" | `app.commerce.config.ts:111-118`; INT `pages/order-parts-page.jsx`, `components/order-parts.jsx` | One row per part: ERP, lines, status, ERP number, why it waits; lines no part holds | Re-send per part, Back to the order | **yes**: rows keyed by `erpId` (`order-parts.jsx:132-133`); Re-send per part (`:24-35`) | 1, 4, 5, 6 |
| Orders grid: "ERP parts" column | `app.commerce.config.ts:87-108`; `actions/order-grid/index.js:17-20, 38` | e.g. "2 of 2 sent" | — | **yes** | 1, 5, 6 |
| Orders grid: ERP number column | same, `index.js:37`, `src/lib/order-grid.js:19-24` | This app's ERP number and status | — | **no**: one column labelled with one ERP's name | 1 |
| Product grid "Move stock between {ERP} warehouses" | `app.commerce.config.ts:123-133`; INT `pages/move-stock-page.jsx` | Move stock between one ERP's sources | Move N products, Back | **no**: one `erpName` (`:94`, `:124`, `:143`, `:155`) | 3 |
| Crash screen | INT `components/crash-boundary.jsx` | A fallback | — | not applicable | — |
| Preview, current page | `commerce-erp-integration/preview/index.html`, `main.jsx`, `fake-api.js` | The real components against stand-in data | Everything above; `?one-erp`, `?page=order-parts` | **yes**: two ERPs, Northwind and Contoso (`fake-api.js:270-283`, `:424-433`) | — |
| Preview, redesign | `preview/next.html`, `preview/next/*` | Plan §5b mock: Overview map, Credit, Activity, Settings | Edit limit, Retry, Save (not wired) | **no**: one hard-coded "Northwind ERP" (`next/data.js:7-11`); no switcher, no parts view | 2, 5 |

Observation: the plan's **Credit** section (§5b) exists only in the redesign preview. The
shipped page has no Credit surface.

## 3. The mock ERP's screen (the SC plays ERP staff)

Each ERP is a separate deployment of the same screen. Its name comes from `ERP_DISPLAY_NAME`
(`demo-erp/lib/settings.js:24-36`). Its look comes from Settings → Appearance
(`lib/appearance.js:44-72`).

| Surface | Where | Shows | Actions | Several ERPs? (evidence) | V |
|---|---|---|---|---|---|
| Shell bar and nav | ERP `../App.js` | Logo, name, search, nav with work counts | Navigate | **yes**: name and look belong to this ERP (`App.js:157-169`) | 8 |
| Home | ERP `Home.js` | Work cues, recent documents, open order value | Jump to a document | **yes**: this ERP's figures | — |
| Sales Orders list | ERP `Orders.js` | This ERP's orders; the reference is the Commerce number | Filter, open | **partly**: no sign the order is one part of a larger Commerce order (`:23`) | 1 |
| Sales Order detail | ERP `OrderDetail.js`, `OrderHeader.js`, `OrderLines.js` | Header with sales organisation (`OrderHeader.js:76-77`), lines, timeline | Release or Reject credit hold, Confirm, Create shipment, Create invoice, Cancel (`OrderDetail.js:102-107`); Close remaining per line | **partly**: no part id and no "the rest is with another ERP" (`lib/orders.js:189-199`) | 1, 3, 4, 5, 7, 11 |
| Create shipment dialog | ERP `CreateShipment.js:26-91` | Quantity per line, warehouse | Create shipment | **yes** | 3 |
| Shipments list and detail | ERP `Shipments.js`, `ShipmentDetail.js` | Shipments | Post shipment | **yes** | 3 |
| Invoices list and detail | ERP `Invoices.js`, `InvoiceDetail.js` | Invoices; the seller is the sales organisation (`InvoiceDetail.js:69`) | — | **yes** | 4 |
| Customers list | ERP `Partners.js` | Customers, blocked filter, sales organisations | Filter, open | **yes** | 5 |
| Customer detail | ERP `CustomerDetail.js` | Credit block ("Stops this ERP's orders only", `:41-42`), read-only website account, credit limit, open items | Set block, edit limit | **yes** | 2, 5 |
| Products list and detail | ERP `Products.js`, `ProductDetail.js` | Products, sales-blocked switch, stock, variants | Edit, Save | **yes**, but see gap G2 on which products are there | 0, 3 |
| Pricing and contracts | ERP `Pricing.js`, `AddPricingRule.js`, `PriceTest.js` | Price rules per sales organisation | Add rule, Remove, Test a price | **yes** | 2, 11 |
| Event journal | ERP `Events.js`, `EventDetail.js` | Messages in and out | Retry pending, Requeue failed | **partly**: the ERP id stamped on each event (`lib/events.js:69-77`) is never shown | 6 |
| Settings | ERP `Settings.js`, `AppearanceSettings.js` | Records, numbering, one sales organisation per website, warehouses, appearance | Wipe all, rename warehouse, theme, Save | **yes** for sales organisations and look. The company code is fixed at `'1000'` for every ERP (`lib/structure.js:15`) | 8, 11 |
| Preview | `demo-erp/preview/fakeApi.js` | The real screen against stand-in data | — | **no**: one ERP, "Northwind ERP" (`:183`) | — |

## 4. Agent tools (MCP, used by an agent on the SC's behalf)

The descriptors are in DB `features/ai/server/readDescriptors.ts` (rd) and
`actionDescriptors.ts` (ad). Most handlers are in DB
`features/dashboard/handlers/erpIntegrationHandlers.ts` (EIH). When a call names no ERP,
EIH uses the first ERP in the list (`EIH:103`).

| Tool | Where | Read or action | Does | Several ERPs? (evidence) | V |
|---|---|---|---|---|---|
| `get_erp_status` | rd:306 | read | The integration's health, the list of ERPs, the ledger size (its record of Commerce writes to undo) | **partly**: see gap G1 | 6, 8 |
| `get_erp_record` | rd:322 | read | One SKU or company, as Commerce and the ERP each hold it | **no**: cannot name an ERP (rd:332-336) | 2 |
| `get_erp_order_trace` | rd:357 | read | One order's timeline | **no**: cannot name an ERP; no parts | 1, 6 |
| `run_erp_rest` | rd:339 | read | GET on one ERP's own API | **yes**: takes `erp` (rd:352; EIH:381) | all |
| `write_erp_rest` | ad:461 | action | Write on one ERP's own API, as its staff would | **yes**: takes `erp` (ad:475) | 3, 4, 5, 7 |
| `open_erp_screen` | ad:509 | action | Opens one ERP's screen | **yes**: takes `erp` (ad:522) | all |
| `load_erp_demo_data` | ad:406 | action | Fills ERPs from Commerce | **yes**: one ERP, or every ERP when none is named (`erpFillHandler.ts:35, 52-61`). The descriptor contradicts itself: "every ERP" (ad:414) and "default the first" (ad:421) | 8 |
| `add_erp` | ad:425 | action | Deploys a new ERP, adds it to the integration's list, fills it | **yes** | 8 |
| `reset_erp_records` | ad:444 | action | Undoes the integration's Commerce writes, then wipes and refills every ERP | **yes, all at once only**: no per-ERP reset here or in the UI (EIH:182-196) | 5, 7 |
| `remove_integration` | ad:355 | action | Removes an integration, or one added ERP alone | **yes** (ad:362-364) | 8 |
| `get_integration_settings` / `set_integration_settings` | rd:373 / ad:214 | read / action | The integration's own settings | **no**: no `erp` input (ad:226-230), so per-ERP settings (sales organisation, which products it owns) cannot be read or set by an agent | 11 |

Human surface compared with agent surface:
- Every ERP handler has a tool (`dashboardHandlers.ts:346-360`).
- Neither surface in Demo Builder has Re-send for a part. That lives only on the Admin page (`order-parts.jsx:24-35`).
- Neither surface has per-ERP settings. Those live only in the Admin page's ERP switcher.

## 5. Gaps

### Surfaces that still assume one ERP

**G1. `get_erp_status` has figures for the first ERP only. Confirmed.**
- The integration's `erp/status` reads the ERP that was set when it was deployed (`params`).
  That is the first ERP (`commerce-erp-integration/src/commerce-extensibility-1/actions/erp/status/index.js:50-57`).
- For every other ERP, `erps` says only whether it answers, with no figures (`:18-40`).
- Demo Builder cannot ask about another ERP: the tool takes no `erp` (rd:317-319).
- Demo Builder's type for the answer (`erpIntegrationClient.ts:23-34`) does not declare `erps`.
  The list still reaches the agent, because the answer is passed through untouched (EIH:141).
- The Admin page's Overview has the same limit (`overview-section.jsx:16`).

**G2. The fill copies the whole catalog into each ERP. True by default, not in every case.**
- The fill does filter by the owning ERP (`erpFill.ts:128-135`).
- But when an ERP has no "which products it owns" setting, the filter falls back to every
  product. That fallback is in two places: `erpFillRows.ts:184` and the integration's
  `src/lib/structure.js:108`.
- Nothing in Demo Builder sets that setting, and no agent tool can (see the settings row above).
- So a second ERP starts with every product, unless someone sets its ownership by hand in the
  Admin page's ERP switcher.
- `add_erp` (ad:431-432) and the Add dialog (`AddErpDialog.tsx:89-91`) both say products go
  by `erp_owner`. That is true only after the manual setting.

**G3. The reset is for every ERP, but it is started from one ERP's card, and its dialog names that one ERP.**
- The dialog says "Wipes every record in {name}" (`ErpResetDialog.tsx:41`).
- The reset itself covers every ERP (`erpIntegrationHandlers.ts:181-196`).
- No per-ERP reset exists.

**G4. Most of the Admin page names one ERP.**
- Every section gets one `erpName`, taken from `status.erp` (`integration-page.jsx:103-104`).
- The same holds for Lookup (`lookup.jsx:64-67`), History (`history-view.js:62-65`), Order
  trace (`trace-view.js:44-65`), Move stock (`move-stock-page.jsx:94`) and the menu title
  (`app.commerce.config.ts:83`).
- The ERP-number order-grid column is also per ERP (`order-grid.js:19-24`). It comes from the
  one-app-per-ERP model (called AB-23 in the backlog), which the design replaced.

**G5. The redesign preview (`preview/next`) is for one ERP.**
- It shows one hard-coded ERP (`next/data.js:7-11`; `next/settings.jsx:112`).
- It has no switcher and no parts view, although the plan (§5b) builds on it.

**G6. Settings and the setup check each assume one ERP.**
- The Settings modal shows the connected values of one paired ERP (`componentSettings.ts:108-116`).
- The warehouse check passes on any one source (`setupChecks.ts:153-156`). Its step reads
  "the ERP" (`app-builder-components.json:106`).

**G7. The mock ERP screen gives no sign that it is one of several ERPs.**
- A new ERP starts with the same look as the first. There is no look setting at deploy time;
  only the name differs (`demo-erp/lib/appearance.js:72`).
- The company code is `'1000'` for every ERP (`lib/structure.js:15`).
- The ERP id is never shown (`lib/events.js:69-77`).
- The preview has one ERP (`preview/fakeApi.js:183`).

### What a vignette needs that no surface shows

| Vignette | Needs | Gap |
|---|---|---|
| 0, 8: brand vs owning ERP | See `brand` and `erp_owner` side by side on a product | Only the setup check reads these attributes (`setupChecks.ts:198-213`). No surface shows a product's owner |
| 1: one cart, two brands | The ERP sales order shows it is one part of Commerce order N | ERP `Orders.js:23` and `OrderHeader.js:64` show only the Commerce number |
| 2: prices by brand | Contract prices per ERP on the product page | Planned (AB-26z). No surface yet. Lookup is for one ERP |
| 5: "Partially Held" | The combined status and each ERP's credit | The parts page shows each part's status. Credit per ERP exists only in the redesign preview (`preview/next/credit.jsx`) |
| 6: a brand's system down | Which ERP a failed message belongs to | History and the ERP journal show no ERP (`history-view.js:62-65`; the journal hides `erpId`) |
| 7: cancel after shipping | Which ERP cancelled | Order trace has no parts (`trace-view.js:44-65`). Only the parts page shows it |
| 9: returns | — | Not built, so no surface |
| 10: EDI orders | — | Not applicable |
| 11: sales organisation per ERP per website | Set and see each ERP's sales organisation per website | Admin page Settings with the ERP switcher: yes. Agents: no (the settings tools have no `erp`) |
