# What it really takes to show a buyer their own prices with ACO

Research, 2026-10-31 and 2026-11-01 (owner: "what it really takes", then "a public view alone is
not enough for a demo"). Sources: Adobe's public docs (listed at the end), Adobe's storefront
template at the commit we build from, and live calls to an ACO sandbox and to our own ACCS test
store. Internal Adobe sources were read too and are deliberately not quoted here, because this
repo is public; the owner has them separately. Tenant ids are left out for the same reason.

## The answer

Two different demos sit under "company pricing", and they are not the same work.

| | Each company sees its own… | What it takes | State |
|---|---|---|---|
| **Prices** | prices | one setting and the right price book names | **Built** |
| **Catalog** | products and prices, and nobody else can read them | a private catalog view per shared catalog, and a backend that signs a token per buyer | **Not built** (PL-87) |

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
4. **Sale prices would have vanished.** Shoppers now read a group's book, and ACO's docs say a
   child book inherits a price but not its discounts. A product with a discount or tiers now has a
   full row in each group's book.
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
| **C. ACCS + ACO, private views** (PL-87) | Each company's own catalog, gated, same headers as the connector | Our own resolver stands in for the connector; views set up by hand |
| **D. PaaS + ACO + Adobe's B2B connector** | The real product, automatic | Needs a PaaS store and a beta extension; not something a Demo Builder project can install today |

**Recommendation:** keep A as the default for B2B demos where gating is the story, use B when ACO's
merchandising is the story, and build C only when a demo needs both. C's storefront side would
survive the connector arriving, because only what resolves the view changes.

## Limits to tell an SC

- **Group ids belong to one Commerce.** A pack loaded against a different Commerce points buyers at
  the wrong books.
- **Licensing counts views times price books.** The base allocation is 100 catalog variations, so a
  store with several websites and groups can reach it quickly.
- **A pack made from a website has one price book.** Buyers ask for a book that does not exist, so
  the view's default has to be that book. Adobe's docs say the default is the fallback; the views
  available to test have no default, so this is not measured.
- **After signing in**, a page already on screen keeps its old prices until the next page loads.
  Adobe's template emits an event for this and nothing in it listens. Read in the code, not watched.

## Not tested

**The whole loop has not run in a browser.** It needs a pack written to ACO, and the Adobe Demo
System org does not have ACO ingestion enabled. Each link is measured separately: what Commerce
answers, what ACO does with each header, what the template does with the setting. The price book
names with `::` have not been written to ACO by us; Adobe's connector uses them.

Also untested: `commerceOptimizer` through an API Mesh, because the test project has none.

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
