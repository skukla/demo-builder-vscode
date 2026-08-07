# Storefront delivery probe — is the PDP plumbing actually live?

## Context

Khalil's PDP failures could not be answered from the extension: the storefront runs
in a browser against aem.live while the extension is a local process, so nothing
reported whether the prerender path was even installed. Triage relied on reading
setup logs from the run that CREATED the site, which says what was attempted, not
what is serving now.

Asked 2026-08-07: could the builder log storefront-level requests/responses — was
the prerenderer used, did the PDP dropin render this page?

## What is answerable, and by what

Established empirically against `skukla/demo-builder-test`, not assumed:

| Question | Signal | Needs a browser? |
|---|---|---|
| Smart-404 snippet deployed? | `GET /scripts/delayed.js` contains `SMART_404_MARKER_START` | no |
| Eager redirect deployed? | `GET /404.html` contains `SMART_404_HEAD_MARKER_START` | no |
| Was this PDP prerendered? | `GET /products/...` → 200 + product markup, vs 404 | no |
| Does `prepublish-pdp` answer? | call the action | no |
| Overlay registered? | already covered by `configServiceProbe` | no |
| **Did the PDP dropin hydrate?** | client-side only | **yes** |
| **Client-side GraphQL req/res** | client-side only | **yes** |

The first group is Khalil's entire class of problem and needs no storefront change,
so it works on sites already in the wild. The second needs code running in the page.

**Decision (user, 2026-08-07): build the extension-side probe.** In-page console
instrumentation stays available as a later addition; a beacon-to-an-action collector
was rejected as too much surface for a diagnostic (public endpoint, demo traffic
data leaving the box, and this repo is public).

## Shape

Mirror `configServiceProbe.ts` exactly — it solved the same problem for the
Configuration Service 403 and set the pattern:

- Self-contained module returning structured legs plus a one-line verdict, so
  Diagnostics renders rather than reasons.
- **Read-only by construction.** Every leg is a GET, enforced by a test, as
  `configServiceProbe.test.ts` does. A diagnostic must never mutate a live
  storefront.
- Absent (not empty) when no EDS project is open — an invented site produces a 404
  that reads like a real finding.
- Surfaces through `DiagnosticsReport.storefront?` and `buildSummaryLines`, landing
  in the report the `debug-log-triage` workflow already copies.

## Gotchas found while proving this out

- **aem.live serves gzip.** `curl` without `--compressed` returns binary, and
  grepping it reports every marker as missing. This nearly produced a phantom
  "half the snippet is not deployed" finding. Node's `fetch` decompresses, but any
  shell reproduction in a doc or test fixture must pass `--compressed`.
- A PDP 404 does NOT by itself mean the prerender path is broken — it also means
  that SKU has no published page. Report the legs; let the reader combine them.
- `https://main--{repo}--{owner}.aem.live` is hand-built in three places
  (`configGenerator`, `configSyncService`, `daLiveContentCopy`). The third uses
  DA.live **org/site**, which per `project_config_service_key` is NOT the same key
  as GitHub owner/repo — so it is a variant, not a fourth copy. Use a helper for
  the GitHub-keyed form; do not blindly retrofit the DA.live one.

## Steps

- `step-01.md` — the probe service + its read-only test, wired into Diagnostics.
