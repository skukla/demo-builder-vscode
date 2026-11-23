---
id: EDS-74
kind: fix
area: eds
needs: []
value: low
status: backlog
---

# Deleting a storefront leaves its publish key registered with the shared PDP action

Filed 2026-11-18, found while seeding the cloud-reversal ledger
(`tests/templates/cloud-reversals.ledger.json`, row `publish-key-registration`). Verified from
source; no live call was made.

## What is left

| Direction | Where |
|---|---|
| Created | `publishKeyRegistrar.ts` POSTs `{ org, site, key }` to the shared `prepublish-pdp` action's register URL (`deriveRegisterKeyUrl`), after setup registers the site config and after every later config write |
| Removed | Nothing. No call in `src/` unregisters a site from that action |
| Delete Project | `tearDownStorefront` deletes the admin API key itself (`helix.deleteAdminApiKey`, `storefrontTeardown.ts`), so the action keeps a key that no longer works |

## Why it matters

Property 1, "whatever can be done can be undone": setup registers, and no path undoes it. The
stored key is dead after a delete, so the harm is small: the action holds one stale entry per
deleted site. A storefront recreated on the same GitHub owner/repo depends on the next
registration replacing the old entry.

## Suggested fix

First find out whether the action has an unregister route (it lives with the BYOM overlay, not in
this repository). If it has, call it from `tearDownStorefront` beside `deleteAdminApiKey`, and
treat "not registered" as done. If it has none, say so in the ledger row's reason and decide with
the owner whether the action needs one. Either way, move the ledger row's `projectDelete` from
`exemption` to `removes` and lower `exemptionCeiling`.
