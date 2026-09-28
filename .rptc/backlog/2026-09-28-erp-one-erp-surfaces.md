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
- 2026-09-28  2026-09-28 merged and deployed to Bodea (owner: yes): integration main adf14cc (erp/status answers detachesPerErp: true), both ERPs updated 7671773 -> 2ff27e2 (theme per new ERP, local date, pricing-rule wording); Demo Builder develop 9db50a41e. Northwind and Contoso reachable through the integration. Contoso kept its stored look, as designed. The one-ERP reset button needs the Extension Development Host reloaded onto the new build.
- 2026-09-28  2026-09-28 found live: the order trace labels a waiting step with the FIRST ERP's name ('Waiting for Northwind ERP') while its detail names the waiting ERP (Contoso, order 3000000022). Part of the order trace gap already listed here.
- 2026-09-28  2026-09-28 Contoso given its own look for the demo (Settings theme Meridian: indigo, orbit logo, top navigation) so the two ERPs are told apart on screen.
