---
id: AB-38
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26z]
value: med
status: built
---

# A business user edits the integration's schedules

Filed 2026-09-28. Owner: "The scheduled jobs should also be editable via a business user. This
likely means they need an interface created for them in the commerce integration."

## Where it stands

Scheduled work runs as App Builder alarms, not Commerce cron (Adobe's App Development
Comparison names alarms the recommended method). The integration's hourly price publish is an
alarm (`erp-prices-hourly-timer`, cron `5 * * * *`, integration 5ddc65f); the mock ERP retries
its events on an interval alarm. An alarm's schedule is fixed at deploy time and evaluated in
UTC only (developer.adobe.com/app-builder/docs/resources/cron-jobs/lesson3), so changing it
needs a redeploy or a Runtime API call. Neither is a business user's tool.

## Recommended shape

- **One fixed heartbeat alarm** (every few minutes) and **the schedule as settings**: each job's
  on/off, frequency (hourly, daily, weekly) and time, plus the store's timezone, kept with the
  integration's other business settings (App Management configuration). On each tick the
  integration runs whatever is due. No redeploy to change a schedule, and "02:00" means the
  store's 02:00.
- **Where it is edited:** a "Schedules" group in the Admin page's Settings section, each job
  with a plain description ("Publish ERP prices into the shared catalogs") and when it last ran.
- **Where the runs show:** the Activity section (already filed on AB-16c).
- Jobs today: the price publish. Candidates as they come: stock reconciliation, re-sending
  failed order parts, the mock ERP's own jobs (those live in the ERP's screen, not here).

## Related

The mock ERP decides "today" in UTC, so a dated price starts at UTC midnight whatever the
schedule (AB-26z follow-up: a timezone on the ERP's company code).

## Shipped so far

- 2026-10-02  commerce-erp-integration 3c55ebf: heartbeat alarm erp-schedule-heartbeat every 5 min + six schedule settings at Default Config (store timezone; price publish on/off, hourly/daily/weekly, minute, time, weekday; defaults hourly at :05 UTC); app 0.12.0 upgraded in Commerce. Open: (1) owner checks the six settings render and save in the App Management form; (2) confirm the old erp-prices-hourly-timer is gone (the deploy logged a failed alarm DELETE from Adobe alarms service)
