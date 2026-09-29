---
id: AB-16c
kind: feature
area: app-builder
parent: AB-16
needs: []
value: med
status: backlog
---

# Screens and agent tools that still assume one ERP

Filed 2026-09-28 from the screen listing (`.rptc/plans/several-erps/c1-screen-listing.md`:
50 surfaces, 28 ready for several ERPs, 8 partly, 13 not).

## The gaps

- **The integration's Admin page in Commerce:** Overview, Lookup, History, Order trace, the
  ERP-number column and Move stock show or act on one ERP.
- **Reset records** wipes and refills every ERP while its dialog names one; there is no
  per-ERP reset.
- **No agent tool reads or sets an ERP's own settings** (ownership, sales organisation per
  website).
- **A second mock ERP starts with the first one's look** and the same company code (`1000`).
- **`load_erp_demo_data`'s description contradicts itself** ("every ERP" and "default the
  first").
- The redesign preview (`preview/next`) has one hard-coded ERP.

Fixed on 2026-09-28, not part of this item: `get_erp_status` reads any ERP, and a refusing ERP
shows as not reachable.

## Done when

Each gap is either fixed or recorded here as deliberately one-ERP, with the reason.

## Shipped so far

- 2026-09-28  Added (owner conversation, 2026-09-28): show the integration's scheduled runs (the hourly price publish; when each ran and what it changed) on the Admin page's Activity section, so an SC can show a prospect the schedule working. Scheduled work runs as App Builder alarms, not Commerce cron (Adobe's App Development Comparison: alarms are the recommended method); prospects often expect Commerce cron.
- 2026-09-28  2026-09-28 load_erp_demo_data and reset_erp_records descriptions and dialogs now say every ERP (they said the ERP that comes with the integration).
- 2026-09-28  2026-09-28 per-ERP reset designed (.rptc/plans/several-erps/per-erp-reset.md): the ERPs share two Commerce values (a company's custom attribute set and its total credit limit), so one ERP's undo removes its own attributes and recomputes the total instead of restoring the first before. Building on a loop branch.
- 2026-09-28  2026-09-28 per-ERP reset, Demo Builder side (unpushed commit on feature/erp-integration): an ERP card's Reset records named one ERP and wiped every ERP; it now resets that ERP alone. reset_erp_records takes an optional erp. An integration without per-ERP undo is refused before any undo. Integration side building on loop/ab-16c-per-erp-detach.
- 2026-09-28  2026-09-28 second ERP's look: demo-erp loop/erp-theme-per-erp fc76084 (not merged or deployed): a fresh ERP takes its starting theme from its list id (demo-erp-2 Meridian, -3 Granite, ...); a stored look is kept, so Contoso on Bodea keeps its current look until the SC picks one. Company code 1000 kept deliberately: two separate ERPs each number their own company codes, and 1000 is the usual first one.
- 2026-09-28  2026-09-28 per-ERP undo built in the integration: loop/ab-16c-per-erp-detach f73642a 368522c adf14cc (768 tests, pushed, not merged or deployed). Limit: ledger entries from before it count as the first ERP's, so Contoso's 182 old product writes need a full reset. demo-erp loop branches pushed: loop/erp-theme-per-erp fc76084, loop/erp-local-date 7e119fe.
- 2026-09-29  2026-09-28 (loop) Admin-page one-ERP gap CLOSED and verified in the deployed code (commerce-erp-integration main, deployed to Bodea 22:22 UTC): all six listed surfaces are multi-ERP — Overview (overview-view.js listedErps: per-ERP cards; the single-ERP path only names the lone ERP), Lookup (lookup-view.js: Commerce beside each owning ERP), History (history-view.js: per-ERP chips, All-ERPs filter), Order trace (trace-view.js traceHeadline -> partsHeadline and traceSummary per-ERP sides when erps.length>1), ERP-number column (order-grid.js partsNumbersCell: 'Split: Northwind ERP …; Contoso waiting'), Move stock (move-stock-view.js: each product's owning ERP by erpNames). Remaining AB-16c gaps: per-ERP reset (integration side, loop/ab-16c-per-erp-detach), an agent tool for an ERP's own settings (ownership/sales-org — get/set_integration_settings coverage unverified), second ERP look+company-code, preview/next hard-coded ERP.
- 2026-09-29  2026-09-28 (loop) Agent-settings gap VERIFIED OPEN: get/set_integration_settings reach only the extension's component-level settings modal (componentSettingsHandlers.ts loadProjectComponentSettings over componentConfigs[id] — deploy-time text/secrets), NOT the integration's runtime per-ERP/per-website settings (ownership attribute, sales-org per website) that the Admin page's Settings tab writes via the erp/settings action. No purpose-built agent tool for that surface; only invoke_runtime_action (confirm-gated escape hatch) reaches it. Candidate build for a later slice: get_erp_settings / set_erp_settings taking (integration id, erp id, website scope), mirroring the Settings tab — mcp-tool-authoring.
- 2026-09-29  2026-09-28 (loop) The agent-settings gap is now its own item, AB-16j (owner: file discoveries as their own backlog item, don't bury them).
- 2026-09-29  2026-09-28 (loop) preview/next 'one hard-coded ERP' gap: VALIDATED true (preview/next/data.js hard-codes ERP={name:'Northwind ERP'}), but preview/next is a DIFFERENT Admin-page design (§5b side-list with a Credit section, single ERP) than today's shipped tabbed multi-ERP page. Deferred pending the design decision, now filed as AB-16k (question). Do not make preview/next multi-ERP until AB-16k is answered.
