# Step 03 — Probe a real SKU end to end

**Research rec 2. Does not block release. Depends on step 01.**

## Why this is the actual feature

One GET of a real PDP exercises the whole chain: overlay registered → `render-pdp`
reachable → authored template fetched → page written to the content bus → the path our
encoder builds matches the path the storefront's encoder generates.

That last clause is why it earns its cost. `encodeSkuForUrl` exists in **three**
hand-copies — `pdpUrlEncoding.ts`, the `product-link-sku-encoding` patch in
`eds-demo-patches`, and `check-sku-exists.js` in `accs-discovery-service` — with no
automated agreement check, and `eds-demo-patches` has no published release so patches
resolve to unpinned `main`. If the copies drift, this probe is the only thing that
notices.

## The ambiguity to remove

`diagnostics.ts:61-67` avoided a real SKU because "a SKU-specific URL would 404 whenever
that SKU simply has no page, which reads like a broken storefront." Correct. Remove the
ambiguity by picking a SKU we have just confirmed exists in the catalog, so a 404 means
the chain is broken and nothing else.

## Approach

1. **Resolve one SKU at probe time** by enumerating page 1 of the catalog.
   `enumerateAccsCatalog` (`catalogPrewarmService.ts:232`) already does this but is
   private and paginates the whole catalog. Extract a `pickSampleSku(params, logger)`
   that fetches one small page and returns the first `{ urlKey, sku }`, or `undefined`.
   Reuse the header assembly at `:239-244` — the `all` + `cs` merge is load-bearing.
   Do not duplicate it.
2. **Build the path with the same functions the storefront uses** —
   `` `/products/${sanitizeUrlKey(urlKey)}/${encodeSkuForUrl(sku)}` ``, exactly as
   `prewarmOne:320`. Do **not** call `prewarmOne`; it POSTs. GET only.
3. **Add the leg** to `probeStorefrontDelivery` alongside step 01's
   `authoredTemplate`, as a second optional leg. Reuse the existing `get()` helper and
   its `TIMEOUTS.QUICK` budget.
4. **Report the SKU that was probed** in the diagnostics line. Without it the user cannot
   reproduce the request by hand, which is the first thing they will want to do.

## Gates and degradation

Every one of these must degrade to "not checked", never to a red verdict:

| Condition | Why |
|---|---|
| Not an ACCS backend | Catalog enumeration is ACCS-only (`catalogPrewarmService.ts:157`) |
| No `commerceEndpoint` configured | Nothing to enumerate |
| Enumeration fails or returns empty | A Commerce outage is not a storefront fault |

Diagnostics must stay useful on a project where none of this is available.

## Verdict wording

Three outcomes, following `meshVerifyCheck`'s `ok`/`warning`/`unknown` split:

- **200** — *"PDP for SKU {sku} renders."* Then state the boundary: the probe does not
  execute page JavaScript, so an empty product block is still possible. Do not let this
  verdict imply the dropin hydrated.
- **404** — this is the real red. *"SKU {sku} exists in the catalog but {path} returned
  404 — the prerender chain is not serving PDPs."*
- **not checked** — say which gate stopped it.

## Tests

`tests/features/eds/services/storefrontProbe.test.ts`:
- SKU leg 200 → ok; verdict names the SKU and states the boundary.
- SKU leg 404 → the red verdict. **This is the case the current probe cannot produce
  at all** — it is the reason for the step.
- Each gate → "not checked", no red.
- GET-only test extended to cover the new leg. Non-negotiable.

New tests for `pickSampleSku`: returns the first item; returns `undefined` on empty,
non-2xx, and GraphQL `errors`; merges the `all` + `cs` header groups.

## Live verification

A unit test cannot prove we picked a SKU that exists. Before calling this done, run
Diagnostics in the Dev Host against a real EDS project and confirm:
1. A healthy storefront reports the 200 verdict with a plausible SKU.
2. A storefront with the overlay deliberately unregistered reports the 404 verdict.

Item 2 is the control. Without it we have shipped a second check that cannot fail.

## Done when

- Both verdicts observed live, including the deliberate-break control.
- Gates degrade to "not checked".
- `gate` green.
