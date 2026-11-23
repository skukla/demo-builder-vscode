# Each company's own catalog and prices on ACCS + ACO, as a stand-in that comes off

Item: PL-87, under the ACO epic PL-60. Owner, 2026-11-01: make it available, build it so it is easy to remove
when Adobe's connector reaches ACCS, follow as many Adobe patterns as possible, and invent nothing outlandish.
Measurements: `.rptc/research/aco-support/customer-pricing.md`.

Lands after beta.153, once the ACO branch has merged.

## How it works

1. A buyer signs in. Adobe's company switcher drop-in asks `company { catalogViewContext { catalogViewId
   accessToken } }`. We wrote none of that; it is in Adobe's B2B template.
2. On ACCS that field answers null until the connector is there, and nothing can be added inside Commerce. API
   Mesh passes every request through and runs our resolver for that one field.
3. Commerce still decides who the buyer is: the mesh forwards their sign-in token and takes the company from
   Commerce's answer.
4. The resolver finds that company's view and signs a one-hour token with a private key from the mesh's secrets.
5. The drop-in puts the view and token on catalog requests. ACO checks the signature against the public key it
   holds, filters search by the policy and prices from the view's one price book.
6. Sign-in, cart and checkout go through the mesh to Commerce, which decides what the buyer may buy.

## Against Adobe's patterns

| Piece | Adobe's source | Here |
|---|---|---|
| A backend signs tokens for a private view | [Restricted access keys](https://experienceleague.adobe.com/en/docs/commerce/optimizer/setup/restricted-access-keys): contract-based B2B pricing is a listed use, and the backend that authenticates shoppers holds the key | The mesh, never the storefront |
| Extending GraphQL on ACCS | [API Mesh](https://developer.adobe.com/graphql-mesh-gateway/mesh/advanced/extend/resolvers/programmatic-resolvers) custom resolvers | One resolver on one field |
| Holding a secret for a resolver | [Mesh secrets](https://developer.adobe.com/graphql-mesh-gateway/mesh/advanced/secrets): encrypted, read as `context.secrets` | The private keys |
| Objects in ACO | [B2B shared catalog projection](https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/b2b-shared-catalog-projection): one protected view per custom shared catalog and store view, with a policy, one price book and a key | The same, with the connector's names |

No Adobe example combines the mesh pieces into this. Each piece is documented; the combination is ours, so the
integration carries a stand-in label on screen.

## What stays the same as the connector

| Thing | Value |
|---|---|
| Source of truth | Commerce shared catalogs. Custom ones only: the public catalog is not projected |
| Product tag | `ac-shared-catalogs`, an array of shared catalog identifiers |
| Policy | One per view, `assortment::<catalog>::<lang>`, filtering on that tag |
| Price book | `<website code>::<sha1(customer group id)>` |
| Key | One RSA pair per view; companies on a view share it |
| Token | RS256, only `exp` required, one hour |
| Storefront's question and headers | Unchanged |

## What differs

| Thing | The connector | Here |
|---|---|---|
| Who answers | Code inside Commerce | The mesh resolver |
| Private key | Encrypted in Commerce | Encrypted in mesh secrets |
| Company to view | A link table in Commerce | A table the sync keeps, which the mesh reads |
| Keeping in step | A one-minute cron inside Commerce reading a change log, plus a periodic reconcile | A one-minute App Builder alarm comparing through the API. No manual step (owner, 2026-11-01) |
| Keys | One per view | One per project, assigned to every view, so a new view needs no mesh deploy |
| Sign-in, cart, checkout | Straight to Commerce | Through the mesh |

## Proved live, 2026-11-01

See `customer-pricing.md`. All test data was removed afterwards.

- ACO filtered search on `ac-shared-catalogs` within about 6 minutes, with a control showing the hidden product
  searchable on another view.
- A deployed mesh signed with a key held only in secrets. ACO refused no token (401) and a bad token (403), and
  answered the mesh's token. Earlier, a real buyer in a browser got their company's catalog through the mesh with
  a key in the config.
- `V1/sharedCatalog/{id}/products` lists a shared catalog's SKUs.
- Guest cart calls behave the same through the mesh as direct.
- A mesh resolver read a table from an App Builder web action: the right view per company in about 100 to 190 ms, and
  the action refused a call with no key.
- A one-minute alarm fired 11 times, 59 to 61 seconds apart after the first run, and a scheduled action ran and
  succeeded on Node 22 and Node 24. All of it removed afterwards, confirmed by reading the namespace back.
- Reading Acme's shared catalogs, their products, companies and 139 products' names and prices took about 3
  seconds, from a local machine and without tier prices.

## Build

Each part ships its reversal (the first property in `CLAUDE.md`), and each is one library integration to the SC:
add it and it sets up, remove it and all of it goes.

1. **Mesh secrets in deploys.** `aio api-mesh` takes `--secrets`, and Adobe overwrites a mesh's secrets with
   their literal references on any update that leaves them out, so every deploy has to send them. The first step
   sends a `secrets.yaml` beside `mesh.json`. Then write that file from SecretStorage for the length of the
   deploy and delete it, so no key sits on disk or can reach a repo. Mesh limits: 50 secrets, 5 KB each.
2. **Catalog setup.** For each custom shared catalog and store view: key pair, restricted access key, policy,
   private view with one price book. Tag each product through the ACO rows. Read-back reports when filtering has
   started. Removal deletes views, then policies, then keys, then rows and the tag, and confirms by reading back.
3. **The catalog answer.** An optional resolver in `eds-accs-mesh`. It reads which view a company gets from the
   sync's table, and signs with the project's key. A project without a mesh gets one, and the storefront's Commerce
   endpoint moves to it. Removal points the endpoint back, republishes, and takes the mesh off if it was added for
   this.
4. **Staying in step, with no manual step.** An App Builder alarm runs on the connector's documented schedule: every
   minute for changes (`* * * * *`), with failed items retried every 5 minutes. It reads the shared catalogs, their
   products and companies from Commerce, compares them with what it last sent, and sends only the differences. ACO's
   admin API lists views and policies; products and prices cannot be read back, so the action keeps its own record.
   A run that overlaps the one before it stops. Adobe's docs show `* * * * *` as the top of every minute, always in
   UTC, and an alarm's run is a non-blocking call, so it can outlast the minute. To measure: what a run per minute
   costs against Commerce and Runtime.
   Events are an optional later layer for changes that feel slow in a demo; the live list
   (`V1/eventing/supportedList`, 2026-11-01) has shared catalog and company events and none for assigning a product
   to a shared catalog.
5. **ERP prices and names reach ACO.** Commerce stays the authority and the sync copies from it, so
   `commerce-erp-integration` may need no ACO code at all. The alarm picks up its base price and tier price
   writes like any other change. Measure stock too:
   the ERP writes it to Commerce only, and what an ACO storefront shows is not known. See AB-14.
6. **Stepping aside.** `acoEnabled` already says whether the connector is on. Offered only when it is off and the
   project has ACO, a B2B package and custom shared catalogs. A project that has it when the connector arrives is
   prompted to remove it. The ERP's ACO writes stop too. Then the connector does the copying.
7. **Surfaces.** The stand-in label on the card, an MCP tool for what the button does, and the docs. Walk "Hit
   every surface" in `CLAUDE.md`.

## Proof before calling it done

Run on the test website, then back to zero, except as noted.

- **A real order through the mesh** (owner, 2026-11-01). It leaves a test company, a product and an order in that
  ERP, which has no customer delete route (AB-93); the owner accepted that. Tag the records so they can be found.
- Two real buyers from two companies, one after the other, each seeing only their own catalog. The mesh has
  response caching on, and a header-based check showed no bleed, but real buyers are the test that counts.
- A refused order. Through the mesh, Commerce's top-level error is replaced by "Cannot return null for non-nullable
  field CustomerOrder.number", while `placeOrder.errors` still arrives. See what the shopper reads, and fix it in
  the mesh if it is worse than going direct.
- An ERP price change reaching the listing and the cart with the same number.
- A new shared catalog, a new company and a moved company each taking effect with nobody pressing anything.
- Removal back to zero, including the storefront endpoint.

## Limits to tell an SC

- A hidden product still opens from a direct link: a policy filters search and listings, not a read by SKU. That
  is how ACO's API behaves, and the connector uses the same API, so we match it. The cart is Commerce's to refuse.
- Products and prices have to exist in Commerce too, or Add to Cart fails or disagrees with the listing.
- Changes reach ACO a little later than Commerce, and by about a minute plus ACO's own processing.
- Each view counts towards the ACO license's catalog variations.

## Not started

Only the first half of step 1 exists, on this branch. The ACO tools (`get_aco_status`, `run_aco_query`,
`run_aco_admin`, `write_aco_admin`, `write_aco_rows`) are what the rest is built and checked with.
