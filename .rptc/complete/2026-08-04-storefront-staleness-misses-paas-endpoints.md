# Storefront staleness misses the two PaaS endpoints config.json reads

**Filed:** 2026-08-04
**Origin:** Parallel-implementation audit; **verified by hand** against both files before filing.
**Severity:** Medium on PaaS projects — a silent wrong-endpoint storefront with no prompt.
No impact on ACCS, which is why it went unnoticed.
**Present in:** `storefrontStalenessDetector.ts` vs `configGenerator.ts`.

## The gap

Two hand-maintained lists over one schema. `STOREFRONT_CONFIG_ENV_VARS`
(`storefrontStalenessDetector.ts:53-68`) is the set watched to decide "the storefront config
changed, prompt a republish". `configGenerator.ts:262-275` is the set actually read to
produce `config.json`. The detector's own docstring states the coupling:

> configGenerator reads whichever set matches the backend, so a change to either must mark
> the storefront stale and prompt a republish.

Verified 2026-08-04:

| backend | watched | read by configGenerator |
|---|---|---|
| ACCS | `ACCS_GRAPHQL_ENDPOINT` ✓ | `ACCS_GRAPHQL_ENDPOINT` |
| PaaS | **neither** | `PAAS_GRAPHQL_ENDPOINT` (`:262`), `PAAS_CATALOG_SERVICE_ENDPOINT` (`:268`) |

The ACCS arm is complete. The PaaS arm is missing both endpoints.

**Consequence:** on a PaaS project, changing the Commerce GraphQL endpoint or the Catalog
Service endpoint changes what `config.json` *would* contain, the storefront is never marked
stale, no republish is prompted, and the deployed storefront keeps serving the old endpoint.
Nothing errors — the user sees a storefront pointed at the wrong backend.

## Execution plan

1. Add `PAAS_GRAPHQL_ENDPOINT` and `PAAS_CATALOG_SERVICE_ENDPOINT` to
   `STOREFRONT_CONFIG_ENV_VARS`. That is the fix; everything below is the durable part.
2. **Derive one list from the other, or test that they match.** Two hand-maintained lists over
   one schema will diverge again — this is the shape the
   `architecture-duplication-scan` calibration (`4897b8d4`) was written to catch. Preferred:
   `configGenerator` exports the keys it reads per backend and the detector consumes them.
   Minimum: a test that fails when a key read by the generator is absent from the watch list.
3. Audit the rest of both lists in the same pass — the endpoints are the two found, not
   necessarily the only two. `AEM_ASSETS_ENABLED` appears in the watch list; confirm the
   generator still reads it.

## Constraints

- Adding keys widens what marks a storefront stale. Confirm none of the new keys churn on
  every save, or users get a republish prompt they cannot clear.
- Do not "fix" by widening the watch list to every env var — the list is deliberately the
  config-affecting subset, and a prompt that fires for unrelated changes gets ignored.
- If the two lists are unified, the ACCS/PaaS branch must survive: they read genuinely
  different keys, and that asymmetry is correct.

## Kickoff prompt

> `STOREFRONT_CONFIG_ENV_VARS` omits `PAAS_GRAPHQL_ENDPOINT` and
> `PAAS_CATALOG_SERVICE_ENDPOINT`, both of which `configGenerator` reads on the PaaS path — so
> changing either silently leaves a PaaS storefront serving the old endpoint with no republish
> prompt. Add them, then make the two lists derive from one source (or add a test that fails
> when the generator reads a key the detector does not watch), and audit the rest of both
> lists. See `.rptc/backlog/2026-08-04-storefront-staleness-misses-paas-endpoints.md`.
