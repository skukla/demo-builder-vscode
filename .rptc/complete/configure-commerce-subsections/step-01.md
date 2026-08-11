# Step 01 — The Catalog tab's two endpoints sit at opposite ends

The cheapest step, and independent of the rest.

## Corrected 2026-08-11 — a retag this step used to propose was wrong

The original step opened by moving `ADOBE_COMMERCE_ENVIRONMENT_ID` out of
`catalog-service` and into `adobe-commerce`, on the grounds that its group
disagreed with its name.

**That was wrong. The group is right and the NAME is the misleading part.** The
registry's own description says so — *"Adobe Commerce Catalog Service dataspace
identifier"* — and the code agrees: `extractConfigParamsFromConfigs`
(`configGenerator.ts:302-309`) sets `catalogServiceEndpoint`, `commerceApiKey`
and `commerceEnvironmentId` as one block, each `isAccs ? undefined : …`. All
three are PaaS-only Catalog Service values, which is why the tab disappears
entirely on ACCS.

Recorded rather than deleted because the mistake is instructive: the key prefix
`ADOBE_COMMERCE_` reads like an instance identifier, and that beat a description
sitting one line away. The same class of error — a key whose name disagrees with
its meaning — is what the 2026-08-10 mesh scope work was about.

## Why (what remains)

The Catalog Service tab holds four fields, and its two ENDPOINTS are separated by
the two credentials:

```
* PaaS Catalog Service Endpoint    required, pre-filled with a sandbox default
* Environment ID                   required, blank
* Sandbox Catalog API Key          required, blank
  Catalog Service Endpoint         optional, blank, derivedFrom the other two
```

`serviceGroupTransforms.ts:105` lists `fieldOrder` as `ADOBE_CATALOG_SERVICE_ENDPOINT`,
`ADOBE_COMMERCE_ENVIRONMENT_ID`, `ADOBE_CATALOG_API_KEY`;
`PAAS_CATALOG_SERVICE_ENDPOINT` is absent, so it sorts to 999 and lands last.

Two problems in one section:

1. **The endpoints are non-adjacent**, so the tab reads as four unrelated fields
   rather than "an endpoint, its credentials, and a derived endpoint".
2. **The derived field is blank and editable, and sorts FIRST.**
   `ADOBE_CATALOG_SERVICE_ENDPOINT` declares
   `derivedFrom: [PAAS_CATALOG_SERVICE_ENDPOINT, ACCS_CATALOG_SERVICE_ENDPOINT]`,
   but `derivedFrom` is honoured only at `.env` generation
   (`envFileGenerator.ts:251-257`) — never in the UI. So the field a user reaches
   for first is the one the generator intends to compute, and the one that is
   actually required is at the bottom, already filled in.

## Change

1. `serviceGroupTransforms.ts`: add `PAAS_CATALOG_SERVICE_ENDPOINT` to the
   `catalog-service` `fieldOrder`, adjacent to `ADOBE_CATALOG_SERVICE_ENDPOINT`.
   Leave `ADOBE_COMMERCE_ENVIRONMENT_ID` where it is.
2. Decide what the derived field should do in a form. Three options, in order of
   preference:
   - render it **read-only** showing the value it derives to;
   - **hide** it in the UI and let the generator produce it;
   - leave it editable and accept that it overrides the derivation.

   This is a `derivedFrom`-wide decision, not a one-field one — check whether any
   other var declares it before choosing, and if the answer is "only this one",
   prefer read-only and keep the blast radius at one field.

## Tests

- The two catalog endpoints are adjacent in render order.
- `ADOBE_COMMERCE_ENVIRONMENT_ID` is still in Catalog Service — a control against
  the retag this step used to propose.
- Whichever option (2) takes, pin it: read-only renders the derived value; hidden
  means the key is absent from the rendered section but still present in the
  generated `.env`.
- `serviceGroupTransforms.test.ts:106-136` must pass **unedited**.

## Done when

- The Catalog tab reads endpoint → credentials → endpoint, not scattered
- The derived field no longer invites a value the generator will compute
- `gate` green
