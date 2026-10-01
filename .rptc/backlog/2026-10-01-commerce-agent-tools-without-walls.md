---
id: AI-12
kind: feature
area: ai
needs: []
value: high
status: active
---

# Commerce agent tools: an agent works Commerce data without hitting the walls we hit

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-10-01 from the AB-53 rebuild. The owner separated two purposes: **sharing finished
work** is a datapack (DI-1; export is blocked on the Data Installer service, whose export store
step has no database configuration and whose owner has retired — DI-3, closed), and **an agent
working Commerce data efficiently, without bashing its head against the wall** is this item.
Owner: "pull all of the commerce API agent related work we've done … into this same branch so
that we could release it as a dedicated feature directly to develop without depending on the
ERP itself." Branch `feature/commerce-agent-tools`, off `develop`.

## On the branch (moved from the ERP loop branch, none of it ERP code)

- `run_commerce_rest` / `write_commerce_rest` were already on develop; the branch carries their
  later fixes: a Commerce 403 is blamed on the credential only when Commerce says so; the bulk
  route (`bulk:true` → `V1/async/bulk/<path>`, proven on ACCS: 43 product saves in one call).
- `create_project` records the Commerce endpoint on the backend's config, so the Commerce tools
  have an endpoint to call.
- A destination change records the signed-in org for a project that has none, so the tools have
  an org to sign with.
- The probe and gap-scan skill fixes (the probe gates on the server's own read-only hint).

## Built here

- **A refusal is a failed call.** Text beginning "Error: " is this server's convention for a
  refusal, and 30 of 41 prose answers left the protocol's error flag unset — so an expired
  Adobe sign-in and a Commerce HTTP 404 read as successes, and a restructure script reported a
  rename that never happened. The shared helper now marks the prefix itself; the three confirm
  refusals without it (`sign_in`, `open_view`, `reload_window`) pass the flag explicitly. The
  live probe prints `TOOL ERROR` and exits 1 on the flag.

## Still to build, in order of what it cost on 2026-10-01

1. **A visibility check** (read-only tool): `productSearch` once per customer group beside a
   Catalog Service lookup by SKU, answering permissions / stock / visibility / feed. The "stuck
   index" was B2B category permissions for most of a day; this answers it in one call.
2. **The B2B grant rule in what the agent reads**: on a B2B website a new category is invisible
   until a shared catalog grants it (measurements in EDS-24, on the ERP branch). The
   `write_commerce_rest` description and the demo-data skill (AI-10) say so; the visibility
   check verifies it.
3. **Category product links in bulk**: 25 links cost 25 calls and ~15 minutes. Prove the bulk
   route for `categories/{id}/products`.
4. **The sign-in expiring mid-run**: the reads came back refused only after the session had been
   gone for hours. Say so before a long run, not after.

Related: AI-10 (the demo-data skill that uses these tools; filed on the ERP branch, not yet on develop), [[DI-1]].
