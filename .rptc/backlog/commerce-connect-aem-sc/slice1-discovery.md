# Slice 1 — Discover the commerce connection from a published storefront URL

> **No longer the first slice (2026-06-03).** Under the re-aimed V1 (synced common storefront), the Commerce SC **owns** the backend, so discovery-by-URL is a **later convenience**, not step 1. The first step is now the **master + synced copy** backbone — see [roadmap](./roadmap.md).

**Filed:** 2026-06-02
**Status:** Ready for TDD.
**Roadmap:** [commerce-connect roadmap](./roadmap.md). **Design:** [commerce-connection-kit](./commerce-connection-kit.md).

## Goal

A pure, tested service: given a **published EDS storefront URL**, fetch its public config and return a typed `CommerceConnection` — the values any storefront needs to render the same catalog. **No UI, no applying, no scaffolding** — just discover. This is the load-bearing primitive every later slice consumes.

## The `CommerceConnection` shape

Mirrors what `configGenerator.ts` emits / `config-template.json`'s `public.default`:

```ts
interface CommerceConnection {
  coreEndpoint?: string;     // config "commerce-core-endpoint" (PaaS catalog svc; often absent for ACCS/ACO)
  endpoint: string;          // config "commerce-endpoint" (Catalog Service / Live Search, or mesh URL)
  headers: {
    apiKey?: string;         // "x-api-key"
    environmentId?: string;  // "Magento-Environment-Id" (SaaS data-space id)
    storeCode?: string;      // "Magento-Store-Code"
    storeViewCode?: string;  // "Magento-Store-View-Code"
    websiteCode?: string;    // "Magento-Website-Code"
    customerGroup?: string;  // "Magento-Customer-Group"
    store?: string;          // "Store"
  };
  sourceUrl: string;         // provenance: where it was discovered from
  incompleteForSaaS: boolean;// true when apiKey or environmentId is missing (would render nothing)
}
```

Minimum to count as "a connection": `endpoint` present. `apiKey` + `environmentId` are required for the SaaS read path — when absent, return the connection but set `incompleteForSaaS: true` rather than silently producing a dead connection.

## Files

- **New:** `src/features/eds/services/commerceConnectionDiscovery.ts` — the service (sibling to `commerceStoreDiscovery.ts`).
- **New/extend:** a `CommerceConnection` type (local to the service or in `src/features/eds/services/types.ts`).
- **New test:** `tests/features/eds/services/commerceConnectionDiscovery.test.ts`.

## Mechanism

`discoverCommerceConnection(storefrontUrl: string): Promise<CommerceConnection>`:
1. Normalize the URL → resolve the config URL (`{origin}/config.json`; see open question on the config service).
2. `fetch()` with `AbortSignal.timeout()` — same pattern as `commerceStoreDiscovery.fetchStoreResource`.
3. Parse JSON → read `public.default` (the `commerce-*` endpoints + the `headers` block).
4. Map config field names → the `CommerceConnection` shape.
5. Validate; throw the typed errors below.

Pure: no VS Code APIs, no state, no writes — just `fetch` + map. Easy, fast TDD loop.

## TDD test list (write RED first)

**Happy paths**
1. ACCS-shape config (`commerce-endpoint` + headers, no core endpoint) → correct `CommerceConnection`, `incompleteForSaaS:false`.
2. PaaS-shape config (`commerce-core-endpoint` + `commerce-endpoint`) → both endpoints captured.
3. All headers present → all mapped (`x-api-key`, all `Magento-*`, `Store`).

**Edge / error**
4. Config URL 404 / network failure → typed `ConfigNotReachable` (carries the URL).
5. Malformed JSON → typed `ConfigUnparseable`.
6. Config present but **no** `commerce-*` keys → typed `NotACommerceStorefront`.
7. Missing `x-api-key` and/or `Magento-Environment-Id` → returns connection with `incompleteForSaaS:true` (no throw).
8. Partial optional headers (e.g. no customer-group) → optional fields omitted, no throw.

**URL handling**
9. Bare origin, trailing slash, or a path → all resolve to the correct `{origin}/config.json`.
10. `sourceUrl` provenance recorded on success.

## Out of scope (slice boundary)

- Applying the connection to a target storefront → Slice 2.
- Any UI → Slice 4.
- Scaffolding `xcom` → Slice 3.
- Writing to the Configuration Service.

## Open question to resolve during TDD

**Which config to read** — root `/config.json` vs the Configuration Service `public.json`. Default: try `/config.json` first (it's what the browser fetches). Note the precedence trap (a `config.json` on `main` overrides the config service). Keep the fetch source **pluggable** so a config-service URL can be supported later without reshaping the service.

## Acceptance

All tests green; `discoverCommerceConnection(publishedUrl)` returns a correct `CommerceConnection` for an ACCS storefront and surfaces clear typed errors for each failure case. Service stays pure (no UI, no state, no writes).
