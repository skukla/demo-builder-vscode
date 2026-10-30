# Step 08: customers and B2B

Status: **built 2026-10-29; first live run 2026-10-30 found the catalog/group defect, fixed (below), not yet re-run.** Customer groups, customers, companies,
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
the pack did not make use it. A read that fails keeps the container and says why. A kept company
keeps its admin, its catalog and that catalog's group; an assignment goes only when neither side it
links is staying (second live run, below). Lines: "Kept the company Altura and its admin
admin.altura@example.com: it holds 1 customer you added.", "Kept the shared catalog Platinum Buyer:
it holds 1 product and 1 company you added."

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
| a company's members | `GET hierarchy/{id}`: nodes' `entity_type`, `entity_id`, `children` | **yes** (2026-10-30: admin only, `HIERARCHY_27_DB08`; two levels, flat, `HIERARCHY_28_DB08`); any other shape keeps the company |
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
  (A pack customer that is the admin of a company being kept IS kept, since 2026-10-30.)
- `ai-coverage-scan` and `security-review` not run this step; no response ceiling re-measured.

### Fixed after the first live run (2026-10-30, scratch-1028)

Measured with a pack holding group "ZZ Test Buyers DB08" and catalog "ZZ Test Catalog DB08" on it:
making the catalog **renamed the group** to "ZZ Test Catalog DB08" (`GET customerGroups/24`), and
removing the pack **deleted the catalog, which deleted the group too**, moving the SC's customer to
group 1. Removal had said "Kept the customer group ZZ Test Buyers DB08: it holds 1 customer you
added.", which was false twice: the group was gone, and it no longer had that name.

- **A shared catalog and its customer group are one unit** (`b2bContainers.ts`, through
  `decideRemovals`, so removal, reinstall and the preview agree). The catalog's group is read from
  `GET sharedCatalog/{id}` (`customer_group_id`). If either holds the SC's things both are kept, in
  one line: "Kept the shared catalog ZZ Test Catalog DB08 and its customer group ZZ Test Catalog
  DB08: the customer group holds 1 customer you added." A catalog whose group is not in the same
  removal is kept ("deleting it would delete the customer group … too, which is staying"). Both
  stay on the record, so the next removal takes them once empty.
- **Every "Kept the …" line names the thing as the store calls it now**: `GET company/{id}`
  (`company_name`), `GET sharedCatalog/{id}` (`name`), `GET customerGroups/{id}` (`code`); the
  record's key only when the read fails. Categories and sets already read theirs.
- Captured as typed fixtures (`tests/helpers/commerceB2bFixtures.ts`, `…_DB08`): `GET hierarchy/27`,
  catalog 19's three lists, `GET company/27`, the renamed group, the customers' `company_attributes`,
  the `POST customers` answer, and the 400 for a group search on `code` (pinned:
  `customerKinds.test.ts`, "searching a customer group by its code").
- **Not checked:** whether Commerce refuses to delete a customer group a shared catalog still uses.
  The code never asks it to (the unit keeps the group whenever it keeps the catalog). Adobe's
  "Delete a shared catalog" says only that its companies go back to the public catalog; the group
  deletion is measured, not documented.
- **Open, not fixed:** because the group is renamed, a reinstall of a pack whose catalog is not
  named after its group looks the group up by the pack's code and does not find it (Bodea names
  each catalog after its group, so it never meets this). The repeat install's `PUT` of the group
  also renames it back, which Commerce may or may not then undo. Recommended: record the group's
  code as read after the catalog is made, or name the catalog after the group, before such a pack
  ships.

### Fixed after the second live run (2026-10-30, scratch-1028)

Measured: the pack made group 25 (renamed to its catalog's name), customers 63 (buyer) and 64
(the company's admin), catalog 20 on group 25, company 28 (`super_user_id` 64, `customer_group_id`
25) and catalog 20's company, category and product assignments. The SC made customer 65 in group 25
and put it in company 28 (`PUT customers/65/companies/28`, answered `[]`; `GET hierarchy/28` then
listed 65 under 64). `reset_datapack` then:

1. unassigned the company, the category and the product from catalog 20 before deciding anything
   else; `GET company/28` then read `customer_group_id: 1` and customer 65 `group_id: 1`, so the
   SC's customer changed group without a word;
2. sent `DELETE customers/64` for the kept company's admin; Commerce answered 400 ("Cannot delete
   the company admin…") and the removal stopped half done;
3. had cleared `project.datapack` when the reset was accepted (21:31:39), nine seconds before the
   engine stopped (21:31:48), so the project named no pack while the record listed 8 objects.

Fixed:

- **A kept company keeps its admin, its catalog and that catalog's group** (`b2bContainers.ts`).
  The admin is `super_user_id` from `GET company/{id}` (the record's `previous.superUserId` only
  when that read fails); the catalog is the one its recorded company assignment names, read with
  `GET sharedCatalog/{id}` for its name and group. One line: "Kept the company ZZ Test Company
  DB08, its admin db08.admin@example.com, its shared catalog ZZ Test Catalog DB08 and that
  catalog's customer group ZZ Test Catalog DB08: it holds 1 customer you added."
- **An assignment is taken out only when neither side it links is staying** (`decideRemovals`,
  `removers.ts`), so nothing assigned to a kept catalog is unassigned, and nothing is unassigned
  from a kept company or category. Companies are decided first, assignments last, everything
  before the first write. The preview counts a staying assignment as kept (`storeChanges.ts`).
- **`project.datapack` is cleared only when a reset finishes having taken everything out**
  (`importJobWatch.ts`): outcome `success` and no `leftInStore` from the engine, and only for the
  project the reset was started from. A reset that stops, is still running, or keeps containers
  leaves it, so project reset still offers the removal and the next one takes what has emptied.
- **The setup guide's catalog undo** (`sharedCatalogsFix.ts`) keeps the catalog while its customer
  group (`customer_group_id` from `GET sharedCatalog/{id}`) holds customers outside the company it
  assigned (`GET customers/search` on `group_id`, read by `company_attributes.company_id`). All
  reads come first; every line uses the catalog's name now.
- Captured as typed fixtures: `PUT_CUSTOMER_COMPANY_ANSWER_DB08`, `HIERARCHY_28_DB08` (two levels,
  flat), `DELETE_COMPANY_ADMIN_REFUSED_DB08`, `COMPANY_28_DB08` (only `super_user_id` and
  `customer_group_id` were recorded; the rest is company 27's body).

Still open:

- **Not run live yet**: the fixed removal against scratch-1028 (live test step 5, then step 6).
- `GET sharedCatalog/{id}` (single) and the `customers/search` on `group_id` are still not captured.
- Whether deleting a company also removes its shared-catalog assignment. A company taken out while
  its catalog is kept leaves its assignment on the record; a later removal unassigns it, and an
  "already gone" answer counts as done (`isAlreadyGone`), but the answer Commerce gives was not
  measured.
- Whether Commerce moves a group's customers to General when a setup-guide catalog is deleted with
  its group: measured for the engine's catalog (2026-10-30), assumed the same for the guide's.

### Companies are made Active (owner, decided 2026-10-30; built 2026-10-30)

Commerce makes a company sent with no `status` Pending Approval (`status: 0`, `COMPANY_27_DB08`, live
2026-10-30), as the Data Installer service's are. Adobe's "Create a company account" (Experience
League, Status field) says only an **Active** company's administrator and members can log in from the
storefront and buy. So the engine's `POST company` now sends `status: 1`, unless the pack's row carries
its own `status`, which wins (`companiesKind.ts`, `installCompanies`). A repeat install's `PUT` sends
the row's status only when the row has one, else keeps the store's.

Where the row carries it: **beside** the create call (`row.status`, next to `query`, `variables` and
`extension_attributes`), never inside the GraphQL `variables.input`, so a pack published to the Data
Installer (step 13) still sends that service a `createCompany` it accepts. Capture writes the store's
status there (`companyPackForm`), so a saved pack keeps what the store had, and the "edited since"
fingerprint now covers a status changed in the Admin. Records made before this have no status in
their company fingerprint, so the first reinstall over them counts each company as changed in the
Admin and keeps it (only scratch-1028's test pack; no SC has one yet).

Tests: `companiesKind.test.ts` asserts the `status` in the `POST company` body for both cases, and
that capture keeps the store's status outside the GraphQL input.

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
   **How to add one** (2026-10-30): `POST customers` with `extension_attributes.company_attributes`
   does NOT put the customer in the company (measured: it answered `company_id: 0`, which Adobe's
   "Manage company users" page says every new customer starts at). That page's next step,
   `PUT /V1/customers/{id}` with `company_attributes`, is marked there as not supported on Adobe
   Commerce as a Cloud Service. The ACCS route is `PUT /V1/customers/{customerId}/companies/{companyId}`
   (no body; "Integrate with B2B using REST", service `companyCompanyCustomerAssignmentV1`,
   developer.adobe.com/commerce/webapi/rest/b2b/integrations/), undone by `DELETE` on the same path.
   So: make the customer (`write_commerce_rest` `POST customers`, or the Admin), then
   `write_commerce_rest` `PUT customers/<id>/companies/27`, then `GET hierarchy/27` should list it.
   In the Admin the same is the customer's Account Information, "Associate to Company". Not yet
   called.
6. Delete your customer, remove the pack again: it finishes and the record file goes. Delete the
   test pack from the library. Check in the Admin that no group, customer, catalog or company named
   `DB08` is left, and that the category and product are out of the catalog: the store is back to
   before step 1.
