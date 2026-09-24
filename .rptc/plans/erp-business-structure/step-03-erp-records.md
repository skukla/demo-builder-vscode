# Step 03 — The ERP's records

Build to the data-model table in `overview.md`; step 01's shape test fails on every field
until the fixture moves with it — update the fixture in the same commit as the field.

1. `lib/partners.js`: `importPartners` takes the new row fields; `salesOrgs` replaces
   `salesOrg` (the walk-in partner gets `['*']`); a stored `salesOrg` upgrades on read to
   `[salesOrg]` when it was ever set to something other than `'1000'`, else `[]` — and the
   next import replaces it. `describePartner` answers `salesOrgs` with names (from the
   structure mirror) and the legal fields.
2. `lib/orders.js`: `createOrder` stores `salesOrg` (request value, else `'1000'`) and
   `salesOrgName`; `upgradeOrder` fills `'1000'` on legacy records; `createOrder` also
   widens the partner's `salesOrgs` with the order's sales org if absent (SAP's extension,
   made automatic: the customer has now bought through that unit). `describeOrder` answers
   both.
3. `lib/conditions.js` / `lib/pricing.js`: optional `salesOrg` on a condition;
   `matches()` requires equality when set; `specificity` +4 when set. `quote` takes the
   order's/quote's `salesOrg` (the pricing action reads it from the request body; the cart
   webhook sends it in step 02 if cheap — otherwise unscoped conditions apply, which is
   today's behaviour).
4. `lib/settings.js`: `warehouses` map; `updateSettings` takes `patch.warehouses`
   (`{ code: { name } }`); `importProducts` registers unseen codes with the Commerce name.
5. `lib/structure.js` (new): `describeStructure(cols, settings)` per the overview;
   `admin/import` stores the `structure` block on settings as `structureMirror`.
6. `actions/health`: answers `structure` (the card is read on the Settings page, but Home's
   filters will want it).

## Done when

`node --test test/` green (the shape fixture updated deliberately for every field above,
with the diff reviewed); README collection table names the new fields; `salesOrg` singular
appears nowhere in `lib/` or `screen/`.
