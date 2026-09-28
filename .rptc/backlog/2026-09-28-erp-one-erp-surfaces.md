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
