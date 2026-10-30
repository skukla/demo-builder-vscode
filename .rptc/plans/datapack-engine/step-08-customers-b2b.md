# Step 08: customers and B2B

Status: **built 2026-10-29, not yet committed or run live.** Customer groups, customers, companies,
shared catalogs and their assignments. Completes Bodea, whose tier prices name customer groups its
own pack makes: until this is built a Bodea install stops at its first product with a tier price,
and says why. Specification first, read off the service's processors as catalog-spec.md was:
[customers-b2b-spec.md](../../research/datapack-engine/customers-b2b-spec.md).

## Agent surface

No new tool: new kinds install through `start_datapack_import`. Its answer stays the same size
whatever the pack holds, since it reports kinds and counts, not rows; a battery prompt installs
Bodea and is traced. Then `ai-coverage-scan`.

## What was built (2026-10-29)

Every kind Bodea holds now installs with Demo Builder's engine. Not run against a live store; the
live test is at the end. `customers_export` (the bulk import form) is still refused before anything
is written, as `product_export` is.

**Order** (`runPack.ts`, the service's): categories, **customer groups**, stocks, sources, links,
products, quantities, **customers**, **shared catalogs**, **companies**, then **company, category and
product assignments**. Groups come before the products whose tier prices name them; customers
before the companies that make them admins. Removal runs the record backwards.

| Kind | Install | Recorded as (key) | Taken back by |
|---|---|---|---|
| `customer_groups` | `POST customerGroups` when the store has no group of that code | id (code) | `DELETE customerGroups/{id}` |
| `customers` | `POST customers` on the install target's website and store view, its group by code, when the website has no customer of that email | id (email, lower case) | `DELETE customers/{id}` |
| `b2b_shared_catalogs` | `POST sharedCatalog`, always custom, its group by code; what it holds right after is read and kept (`previous.held`) | id (name) | `DELETE sharedCatalog/{id}` |
| `b2b_companies` | `POST company` over REST (not the pack's GraphQL), with the admin's customer id, the whole address block and the public catalog's group; the admin is the website's customer by that email, else one made and recorded as a customer | id (name), `previous.superUserId` | `DELETE company/{id}` |
| the three assignment kinds | `POST sharedCatalog/{id}/assignCompanies` / `assignCategories` / `assignProducts`, only what the catalog does not hold yet | `<catalog id>/<company id, category id or SKU>` (`<catalog name>/<name>`) | the matching `unassign…` |

Everything the store already had is left alone and not recorded, so removal never takes it: the
service instead deleted whoever had a pack customer's email.

**Repeat install** (`repeatInstall.ts`): a group is PUT whole; a customer and a company are read
first and PUT back with the pack's fields over the store's copy (Commerce requires the full company
on a PUT, live 2026-09-29). Catalogs and assignments have nothing to update but their name. An Admin
edit is kept and counted in the one line, as for products.

**The container rule** (`b2bContainers.ts`, through `decideRemovals`, so removal, reinstall and the
preview decide one way): a company is kept while it holds a customer that is not its own admin and
is not going with it; a shared catalog while it holds a company, product or category beyond what it
held when made and is not going with it; a customer group while customers, companies or catalogs
the pack did not make use it. A read that fails keeps the container and says why. Lines: "Kept the
company Altura: it holds 1 customer you added.", "Kept the shared catalog Platinum Buyer: it holds 1
product and 1 company you added."

**Capture** (`captureB2b.ts`, called from `capture.ts`): what the record lists and the installed
version names (group codes, customer emails, catalog and company names), plus each company's admin,
every group a captured customer, catalog or tier price names but Commerce's own, and each catalog's
assignments limited to the companies, categories and products captured (the public catalog
included). A store without B2B answers no catalogs rather than stopping a save.

**Passwords** (decision below). Every Bodea customer row carries a top-level `password` (read
2026-10-29). It is sent when the customer is made, and nowhere else: never logged, never in the
install record (`packedFingerprint` hashes the row without it), never on an update, and never in a
saved pack, a copy between stores or a zip (`packCredentials.ts`, applied by `writePackToStore` and
`buildDatapackZip`). A captured customer has none.

**Also**: a customer group named `Default (General)` is found under `General` and the other way
round (the service's alias, now both ways, `productLookups.ts`). `readHeld` is shared with the setup
guide's catalog step. The B2B wire shapes are typed in `commerceWire.ts`, with the captured bodies
in `tests/helpers/commerceB2bFixtures.ts`.

### What each read is checked against

| Read | Endpoint and field | Captured live? |
|---|---|---|
| a group's copy | `GET customerGroups/{id}`: `code`, `tax_class_id` | **yes** (2026-09-28) |
| a customer's copy | `GET customers/{id}`: fields as captured; `extension_attributes` dropped | **yes** (2026-09-27); addresses not (the one captured has none) |
| a company's copy | `GET company/{id}`: address block, `super_user_id`, `extension_attributes` | **yes** (2026-09-27) |
| the catalog list | `GET sharedCatalog`: `id`, `name`, `type`, `customer_group_id` | one filtered page (2026-09-28); unfiltered read live by step 06 |
| what a catalog holds | `GET sharedCatalog/{id}/companies` (a JSON string of ids), `/categories` (ids), `/products` (SKUs) | read live 2026-10-29 (step 06), not recorded as a file |
| a group by code | `GET customerGroups/search`, `customer_group_code` eq: `items[].id`, `code` | **no** |
| a customer by email | `GET customers/search`, `email` eq: `items[].id`, `email`, `website_id` | **no** |
| a company by name or email | `GET company`, `company_name` / `company_email` eq: `items[].id`, `company_name`, `company_email` | **no** |
| a company's members | `GET hierarchy/{id}`: nodes' `entity_type`, `entity_id`, `children` | **no**; any other shape keeps the company |
| who uses a group | `GET customers/search` (`group_id`), `GET company` (`customer_group_id`) | **no** |
| every write's answer | `POST customerGroups` (the group), `POST customers` (the customer), `POST company` (the company), `POST sharedCatalog` (its id) | **no** |

### Decisions for the owner

1. **The pack's customer passwords are sent at install** so buyers can sign in, and are never saved
   anywhere. Consequences: a pack copied service→library, saved as a zip or saved from the store
   loses its passwords, and its customers then install without one. Recommended: keep this, and
   later move the buyer password into a user setting (`demoBuilder.dataInstaller.buyerPassword`,
   SecretStorage) applied at install, so no pack carries one.
2. **A company is made over REST, not the pack's GraphQL**, so it goes through the one signed client
   every kind uses. Recommended: keep; the live test proves the route.
3. **A customer that exists only on another website is made again on the install target's**.
   Recommended: keep (each website is its own account under per-website sharing); if the store
   shares accounts globally, Commerce refuses and the install says so.
4. **A company whose admin existed before the install** keeps that customer as its admin, and
   removal deletes the company but never that customer.

### Not built

- `customers_export` (the bulk JSON import), as `product_export`.
- A rule for a product's tier prices on a group being removed: a group still named by the SC's own
  products' tier prices is not checked (Commerce would drop those prices with the group).
- A customer of the pack's that the SC has since made a member of their own company: not kept.
- `ai-coverage-scan` and `security-review` not run this step; no response ceiling re-measured.

### Live test (owner's call; project `scratch-1028`, website `justrite_test_website`, never JustRite's own)

A test pack, built from Bodea's shape with names no one could take for real ones: one group
`ZZ Test Buyers DB08`, two customers `db08.buyer1@example.com` and `db08.admin@example.com`, one
catalog `ZZ Test Catalog DB08` on that group, one company `ZZ Test Company DB08` (admin
`db08.admin@example.com`, a US address with a `region_id`), assigned to the catalog, with one
existing test-website category and one test product assigned to the catalog.

1. Load the pack into the library (`load_datapack_zip`), then `validate_datapack_import` and
   `start_datapack_import` on `justrite_test_website`. Read the record under
   `.demo-builder/datapacks/`: every object has `key`, `fingerprint`, `wrote`; no password anywhere.
2. In the Admin: the company, its admin, the catalog with the company, category and product in it;
   sign in on the storefront as `db08.buyer1@example.com` with the pack's password.
3. Read once, read-only, and record the answers as fixtures: `GET hierarchy/{company id}`,
   `GET customers/search` by email, `GET company?…company_name`, `POST company`'s answer (from
   Debug Logs).
4. Change the company's city in the Admin; `preview_datapack_changes`: keep 1. Install again: "Kept
   1 thing you had changed in the Admin."
5. Add a customer of your own to the company; remove the pack: "Kept the company ZZ Test Company
   DB08: it holds 1 customer you added."; the company and your customer stay, everything else goes.
6. Delete your customer, remove the pack again: it finishes and the record file goes. Delete the
   test pack from the library. Check in the Admin that no group, customer, catalog or company named
   `DB08` is left, and that the category and product are out of the catalog: the store is back to
   before step 1.
