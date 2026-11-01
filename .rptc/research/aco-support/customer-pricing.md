# What it really takes to show a buyer their own prices with ACO

Research, 2026-10-31 and 2026-11-01 (owner: "what it really takes", then "a public view alone is
not enough for a demo"). Sources: Adobe's public docs (listed at the end), Adobe's storefront
template at the commit we build from, and live calls to an ACO sandbox and to our own ACCS test
store, the later ones through Demo Builder's own tools. Internal Adobe sources were read too and are deliberately not quoted here, because this
repo is public; the owner has them separately. Tenant ids are left out for the same reason.

## The answer

Two different demos sit under "company pricing", and they are not the same work.

| | Each company sees its own… | What it takes | State |
|---|---|---|---|
| **Prices** | prices | one setting and the right price book names | **Built** |
| **Catalog** | products and prices, and nobody else can read them | a private catalog view per shared catalog, and a backend that signs a token per buyer | **Waits for Adobe's connector** (PL-87 closed) |

Shared catalogs do both jobs at once in Commerce. ACO splits them: a **policy** decides the
products, a **price book** decides the prices, and a **private catalog view** decides who may ask.
So a public view can show a company's prices, but it cannot gate anything.

## How Adobe intends the concepts to map

From the public connector docs. This is the shape to demonstrate, because it is the shape the
product is heading to.

| Commerce | ACO | Note |
|---|---|---|
| Store view | Catalog source | One per locale |
| Website + customer group | Price book | `<website>::<sha1(group id)>`. Not one per shared catalog |
| Shared catalog's products | Policy | Filters the view |
| Shared catalog + store view | Private catalog view | One each; the default public shared catalog gets none |
| Company's shared catalog assignment | Which view a buyer gets | Commerce resolves it after sign-in |

The storefront sends the view id, the price book id and a signed token; it never mentions shared
catalogs. Commerce stays the source of truth, ACO is read-only for browsing, and protection covers
catalog and search only: cart and checkout eligibility stay Commerce's job.

**That connector exists only for PaaS.** Its setup page is marked PaaS only, and the automatic
private views are marked Private Beta. Adobe's storefront page says ACCS uses customer groups and
shared catalogs for pricing rather than price book ids. There is no ACCS connector to build on.

## What was measured

All read-only except the signed-in checks, which used one throwaway customer and one throwaway
company on the test website, both deleted and confirmed gone (404) afterwards.

| Question | Answer |
|---|---|
| Does ACCS answer `commerceOptimizer { priceBookId }`, despite no connector? | **Yes**, and it is the only field that type has: no view id, no token |
| Where the storefront gets a view and token | `company { catalogViewContext { catalogViewId accessToken } }`, read in Adobe's B2B template at our verified commit. Our ACCS test store declares that field. What it answers for a buyer is not measured |
| A public PaaS store with the base connector (Adobe's reference storefront's backend) | Same `commerceOptimizer` answer, `base::sha1("0")` for a guest. Does not declare `catalogViewContext` |
| A guest, with the store header | `<website>::sha1("0")` |
| A customer in group 20 | `<website>::sha1("20")` exactly |
| **A buyer in a company on a shared catalog (group 21)** | `<website>::sha1("21")`: company to shared catalog to price book already works on ACCS |
| The signed-in customer, **without** the store header | `base::sha1("0")`: a guest of the wrong website |
| ACO given a `Store` header | Ignored, same answer; CORS allows it |
| ACO given `Magento-Customer-Group`, with or without a good price book | **Every price is null**, no error |
| A real price book the view does not allow | 403, "Price book not in the channel allowed list!" |
| A price book id that was never loaded, or none, on a view with no default | Price is null, no error |
| Adobe's own ACO reference storefront config | Sends `all.Store`, sets `adobe-commerce-optimizer: true`, no fixed price book |

## What was wrong here, now fixed

1. **Price book names.** Packs used `<website>:<group-slug>` (the Data Installer service's
   convention). No storefront ever asks for that. Now `<website>::<sha1(group id)>`.
2. **The setting was missing, and that was worse than no per-buyer prices.** Without
   `adobe-commerce-optimizer`, Adobe's template sends `Magento-Customer-Group`, which empties every
   price on ACO. Every ACO storefront now sets it.
3. **`all.Store` was being removed.** Earlier research read "ACO routing does not use it", true for
   the catalog but not for Commerce: carts and sign-in on a non-default website would have gone to
   the wrong website. It stays now.
4. **Sale prices were wrong.** A discount's `price` is the price it comes to, not the amount off:
   regular 50 with `price: 5` read back as 5. The service's mapping sends the amount off, and ours
   copied it. A child book inherits discounts and tiers (measured, against what ACO's docs say).
5. **The Price Book ID setting is removed.** The storefront replaces it on load, so it did nothing.
   Clear demo data used it for one book's prices, so that clear no longer removes prices, and says
   so on screen. ACO cannot list price books, so a clear has no key for them.

**Corrected recommendation:** the earlier version of this note said the storefront needed two code
edits. It does not. That came from reading an archived fork; Adobe's B2B template at our verified
commit already has them, behind the setting. No patch was needed.

## What we can offer until an ACCS connector exists

| Offer | Shows | Honest limit |
|---|---|---|
| **A. ACCS shared catalogs, no ACO** (today's B2B demos) | The real gated catalog and prices | No ACO features |
| **B. ACCS + ACO, public view** (built) | ACO's search and merchandising, and each company's prices after sign-in | Same products for everyone; prices readable by anyone with the id |
| **C. ACCS + ACO, private views** (PL-87, not built) | Each company's own catalog, gated, same headers as the connector | Our own code stands in for the connector; proved possible and closed |
| **D. PaaS + ACO + Adobe's B2B connector** | The real product, automatic | Needs a PaaS store and a beta extension; not something a Demo Builder project can install today |

**Decision (owner, 2026-11-01):** C is not built. Our code would be doing Commerce's job, and demos replicate the
real product. Use A where gating is the story, B where ACO's merchandising is, and D once a connector backend exists.

## Limits to tell an SC

- **Group ids belong to one Commerce.** A pack loaded against a different Commerce points buyers at
  the wrong books.
- **Licensing counts views times price books.** The base allocation is 100 catalog variations, so a
  store with several websites and groups can reach it quickly.
- **A pack made from a website, or from another store, has none of the ids Commerce answers.** A
  price book that was never loaded answers an empty price, even when the view has a default
  (measured). So loading adds one per customer group, pointing at the pack's prices, on the record.

## Proved through the MCP tools, 2026-11-01

Run on a project's own credential, all test data then removed through the same tools.

| What | Result |
|---|---|
| Price books under Commerce's id format, with `::` | ACO takes them, and a view allows them |
| A child book with no rows of its own | Inherits the parent's price, discount and tiers |
| Discount `price: 5` on regular 50 | Reads back as a final price of 5 |
| A company's buyer asking `catalogViewContext` on ACCS, connector off | `null`. The field exists and holds nothing, and the template reads null as "stay on the public view" |
| A private view with no token | Refused at once: "Access key validation failed: Missing access token" |
| The same view with an RS256 token whose only claim is `exp` | Answers |
| A policy filtering on a product attribute | **Search honours it (1 of 3 products). A read by SKU does not (3 of 3).** So a private view gates listings and search; a holder of a valid token can still read a SKU they know |
| A deployed API Mesh | Passes `commerceOptimizer` through and forwards the store header |
| The same Mesh answering `Company.catalogViewContext` | **Overrides Commerce's field**, sees the real company id, leaves the price book alone. So C needs no storefront code and no change to Commerce |
| The eds-accs-mesh as it stood | Did not forward `Authorization`, so a signed-in buyer reached Commerce as a guest |
| The Console's ACO APIs | `ACO-Ingestion` and `ACO-Admin`. They need a product profile, the list goes minutes without any (`enabled: false`, `EXCEPTION`), and none of 35 profiles named the instance. `Default - Cloud Manager` reached it |

## Proved in a browser, 2026-11-01

A published storefront (Adobe's B2B template at our verified commit) on the ACCS test website, a public
catalog view, and a pack loaded through Demo Builder. The buyer was a real customer in a company on a
shared catalog, signed in through the storefront's own form. One test book held its own prices, the rest
came from the pack through the book Demo Builder adds per customer group.

| Who, and how the storefront reaches Commerce | Search page | Product page |
|---|---|---|
| Guest, direct | $100, $200 | not opened |
| Company buyer, direct | **$60, $120** (the price filter moved too) | **$60** |
| Company buyer, through the API Mesh with the sign-in fix | **$60, $120** | not opened |

The Mesh run was checked by the page's own calls: 16 of its GraphQL calls went through the Mesh. Through the
Mesh, a guest answers the guest book with an empty `Authorization` header, so forwarding it does not hurt guests.

Removal outlasts writing here: after a pack was removed, a read by SKU was empty within two minutes and search
still listed its products for about 15. Clear demo data lists through that same search.

A browser keeps `config.json`, so a page opened before a republish goes on using the old endpoints until
that copy expires. It reads like "the Mesh is not being used".

## The open questions, tested in a browser, 2026-11-01

| Question | Answer |
|---|---|
| Signing in from the header on a page already open | The page reloads itself and shows the buyer's prices |
| What a cart charges | **Commerce's price.** A product at 120 in ACO and 200 in Commerce lists at 120 and sits in the cart at 200 |
| A product only in ACO | Listed, then `PRODUCT_NOT_FOUND` on Add to Cart, with nothing shown to the shopper |
| A company's product with no granted category | `PERMISSION_DENIED` on Add to Cart, with nothing shown. Commerce's own shared catalog rule, unrelated to ACO |
| A private view through the template's own code | **Works.** The buyer saw 2 of 3 products at their book's prices, a guest on the public view saw all 3 |
| Can a Mesh sign the token itself | **Yes**, a resolver signed RS256 with WebCrypto at the edge and ACO took it. A test only, with the key inline: not something to ship |
| A hidden product's direct link | **Still opens**, at the buyer's price. A private view gates listings and search, not a read by SKU |
| A policy on a new attribute | Refused until the attribute is filterable. Ten minutes after sending the metadata it still was not, and an attribute already filterable worked at once |
| Configure's view picker | Renders the views, sets the locale from the choice, and clears the error. Real bundle, fixture views |

So a demo needs its prices in both Commerce and ACO, and each company's products in the shared catalog **and**
ACO, or a shopper sees a price or a product the cart will not honour. Both are silent on screen.

## Not tested

An order on these prices. Checkout reached the right total, and the ERP integration on this instance refused the
order, because a new company has no credit there (AB-84). Placing one would have meant changing credit in a live
ERP. Also untested: Adobe's connector itself, because no backend here has it on, and whether the dashboard says
"redeploy" after a mesh's files change. `get_project_status` still said deployed; PL-88 removes the gap.

## Sources

Public docs, read 2026-10-31 and 2026-11-01: B2B shared catalog projection
https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/b2b-shared-catalog-projection ;
connector B2B setup
https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/get-started/get-started-b2b-shared-catalogs ;
private catalog views https://experienceleague.adobe.com/en/docs/commerce/optimizer/setup/private-catalog-view ;
restricted access keys https://experienceleague.adobe.com/en/docs/commerce/optimizer/setup/restricted-access-keys ;
price books https://experienceleague.adobe.com/en/docs/commerce/optimizer/setup/pricebooks ;
limits https://experienceleague.adobe.com/en/docs/commerce/optimizer/boundaries-limits ;
storefront price book setup
https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/price-book-setup/ ;
Merchandising API authentication
https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api .
Adobe's reference config: `main--boilerplate-aco--adobe-commerce.aem.live/config.json`. Template:
`adobe-commerce/boilerplate-b2b-template` `scripts/initializers/index.js` and `auth.js`.
