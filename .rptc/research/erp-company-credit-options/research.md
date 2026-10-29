# Company credit with two ERPs: what Commerce can hold, show and enforce

Date: 2026-09-26. Report only. No code changed, nothing written to Commerce, the ERPs or any cloud service.

Labels: **READ** means I read it in the named source or measured it with a GET. **INFERRED** means I reasoned it from what I read. **INTERNAL** means an internal Adobe source; it is labelled and not quoted. "Could not read" means the source failed, not that it is silent.

## The answer in five lines

1. Commerce company credit is one limit, one balance and one currency per company (READ). It cannot hold two ERP accounts. Two integrations writing its limit overwrite each other, and each reset restores its own "before" value, so one ERP's reset can undo the other's write (INFERRED from `src/lib/detach.js` and `src/lib/ledger.js`).
2. Commerce as a Cloud Service **does** have company-level custom attributes. They are free key/value strings, set by REST `POST /V1/company/setCustomAttributes` or GraphQL `setCustomAttributesOnCompany`, shown and edited on a Custom Attributes tab on the Admin company page, and returned to the buyer in GraphQL `company.custom_attributes` (READ, sources in section 2). This is the right home for per-ERP credit figures.
3. Customer attributes exist on ACCS, but they sit on each person, not on the company. They are the wrong tool for an account that belongs to the company (INFERRED).
4. Enforcement at checkout has two supported webhooks on this sandbox: the payment-method filter and order placement (READ, live `webhooks/supportedList`). The ERP's own create-and-hold, which the integration already mirrors as a Commerce hold, is the standard ERP behaviour and needs nothing new.
5. Recommendation: keep Commerce company credit as one group-wide line that the ERPs do not write when there are two of them; put each ERP's account in company custom attributes under that ERP's own key prefix; keep per-ERP enforcement in the ERP (hold), with the payment-method filter as an optional hard stop. Details in section 7.

## 1. Company credit on ACCS

### What it holds

| Field | Meaning | Source |
|---|---|---|
| `id`, `company_id` | one credit record per company | READ: [REST credit-manage](https://github.com/AdobeDocs/commerce-webapi/blob/main/src/pages/rest/b2b/credit-manage.md) |
| `credit_limit` | "The amount of credit granted to the company" | READ, same |
| `balance` | "The amount the company currently owes the seller"; negative means owed | READ, same; [Manage company credit](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/credit-company) |
| `available_limit` | computed: limit plus outstanding balance; negative when exceeded | READ, same two |
| `currency_code` | one credit currency; required on every PUT | READ; and measured 2026-09-24 in the integration (`commerce-erp-integration/src/lib/commerce.js:407-411`) |
| `exceed_limit` | "Whether companies can place orders exceeding available credit" | READ, EXL credit page |
| `credit_comment` | "Describes the change being made" | READ, REST credit-manage |

Live, Bodea company 21 (READ, GET `companyCredits/company/21`): `credit_limit 120000, balance 0, currency_code USD, exceed_limit false, available_limit 120000`.

**Multi-currency or multi-entity?** One currency per credit record. Operations can be in another currency: history rows carry `currency_credit`, `currency_operation` and `rate` (READ, live history), and the Admin grid shows a converted amount with the rate (READ, EXL). There is one credit record per company, no sub-accounts, no per-website or per-ERP split (READ: the REST model has no such key). A company hierarchy (parent/child companies) gives each child its own credit record (INFERRED: each company has its own record; I did not read how credit behaves across a hierarchy).

### Operations

| Call | What it does | Source |
|---|---|---|
| `GET /V1/companyCredits/company/:companyId`, `GET /V1/companyCredits/:id`, `GET /V1/companyCredits` (search) | read | READ, REST credit-manage |
| `PUT /V1/companyCredits/:id` | set limit, currency, exceed flag, comment | READ |
| `POST /V1/companyCredits/:creditId/increaseBalance`, `.../decreaseBalance` | move the balance; body `value`, `currency`, `operationType` (1 Allocated, 2 Updated, 3 Purchased, 4 Reimbursed, 5 Refunded, 6 Reverted), `comment`, `options{purchase_order, order_increment, currency_display, currency_base}` | READ |
| `GET /V1/companyCredits/history`, `PUT /V1/companyCredits/history/:historyId` | history search; the PUT edits only a Reimburse row's purchase order and comment | READ |

"Reimburse" is operation type 4, not its own endpoint (READ; agrees with `.rptc/research/erp-composite-entities/research.md` section 6).

**Live history for company 21** (READ, GET `companyCredits/history`): 7 rows, all `user_type 2` (an integration), types 1 then 2 (Allocated, then Updated), every `comment` empty. So today the history shows the limit moving but not **who** moved it or **why**. The integration's PUT sends no `credit_comment` (READ, `src/lib/commerce.js:412-421`). Whether a `credit_comment` on the PUT lands in the history row's comment was not tested (no writes allowed); the EXL page says the history comment is compiled from the "Reason for Change" field (READ).

### Payment on Account at checkout

- Payment on Account is an offline method. It "allows companies to make purchases up to the credit limit". It can be enabled globally or per company. It is not offered for multi-address orders (READ, [Enable B2B features](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/enable-basic-features)).
- Placing an order with it records a Purchased operation and lowers the balance; cancel records Reverted; a credit memo records Refunded (READ, EXL credit page operation list).
- When `exceed_limit` is false, an order larger than the available credit is refused (READ as a statement of intent on the EXL page; the exact storefront message and the point where it is checked were **not established**).
- The Admin shows a notice on sales orders when the company has an outstanding balance (READ, EXL credit page).

### How the buyer sees it

- GraphQL `company.credit` returns `available_credit`, `credit_limit`, `exceed_limit`, `outstanding_balance`; `company.credit_history` returns operations with `amount`, `balance`, `custom_reference_number`, `date`, `type`, `updated_by`. It needs a company user's customer token. **The GraphQL history has no `comment` field** (READ, SaaS schema reference `graphql-api-saas-types-c-e.md`, types `Company`, `CompanyCredit`, `CompanyCreditOperation`).
- EDS: the `commerce-company-credit` block renders the Company Management drop-in's `CompanyCredit` container, with `showHistory` on or off (READ, [block page](https://experienceleague.adobe.com/en/tools/commerce-storefront/merchants/blocks/commerce-company-credit/index.html)). **The `CompanyCredit` container exposes no slots** (READ, [container page](https://experienceleague.adobe.com/en/tools/commerce-storefront/dropins-b2b/company-management/containers/company-credit/index.html)). `CompanyProfile` has a `CompanyData` slot and `CompanyStructure` a `StructureData` slot (READ, [slots page](https://experienceleague.adobe.com/en/tools/commerce-storefront/dropins-b2b/company-management/slots/index.html)).

### What today's integration does with it

- `company/external/credit-updated` action: on the ERP's credit event, reads the credit record and PUTs the ERP's limit into `credit_limit`, then records `{before, after}` in the ledger (READ, `commerce-erp-integration/src/commerce-extensibility-1/actions/company/external/credit-updated/index.js`).
- Reset/uninstall: `detach` walks the ledger and PUTs each `before` back (READ, `src/lib/detach.js:19-30`, `src/lib/ledger.js:140-150`).
- The lookup screen shows Commerce limit and balance beside the ERP's limit, exposure and available, and labels them as different numbers (READ, `src/lib/lookup.js:98-132`).
- Per-order credit: the ERP creates the order and holds it; the integration puts the Commerce order On Hold with the ERP's reason and takes it off hold when released (READ, `actions/order/external/hold/index.js:21-30`).

**The two-ERP problem, concretely** (INFERRED from the code above): ERP A sets 100k (ledger A: before 50k). ERP B sets 80k (ledger B: before 100k). Resetting A writes 50k, which is neither B's value nor the original. Resetting B afterwards writes 100k, A's value, which no longer exists anywhere. Last writer wins while running, and resets do not compose.

## 2. Company-level attributes

### ACCS: yes, as custom (serialisable) attributes

- REST: `POST /V1/company/setCustomAttributes` with `company_id` and a `custom_attributes` array of `{attribute_code, value}`; all values are strings (READ, [REST custom attributes](https://github.com/AdobeDocs/commerce-webapi/blob/main/src/pages/rest/modules/custom-attributes.md)). Available automatically on ACCS (READ, same page).
- GraphQL: `setCustomAttributesOnCompany(input: {id, custom_attributes})` returns the `Company` (READ, [mutation page](https://github.com/AdobeDocs/commerce-webapi/blob/main/src/pages/graphql/schema/attributes/mutations/set-custom-company.md), SaaS mutations reference). **"To remove a custom attribute, rerun the mutation without the previously applied custom attribute."** (READ). So a set call replaces the whole set, not one key (READ for GraphQL; INFERRED for REST, since both sit on the same module).
- The B2B part of this module is ACCS-only; PaaS can install the base module but "the B2B module is available only on Adobe Commerce as a Cloud Service" (READ, [OOPE custom attributes](https://github.com/AdobeDocs/commerce-extensibility/blob/main/src/pages/oope-modules/custom-attributes.md)). The PaaS install page separately lists a `custom-attributes-b2b` composer package (READ, `includes/custom-attribute-installation.md`), so the two pages disagree for PaaS. Not relevant to Bodea.
- They are "independent of the EAV attributes defined in the Admin" and "do not apply to products, categories, or customers" (READ, attributes mutations index).
- **Admin**: the ACCS release notes say admins can manage company custom attributes on a Custom Attributes tab of the company edit page (READ, [ACCS release notes](https://experienceleague.adobe.com/en/docs/commerce/cloud-service/release-notes)). INTERNAL (Adobe design page): the tab shows existing values read-only until Edit, and the REST API applies no validation to keys or values.
- **REST reads and filters**: release notes say company and order REST results can be filtered by custom attributes, and that updating a company by REST no longer clears custom attributes left out of the payload (READ, ACCS release notes).
- **Buyer**: GraphQL `Company.custom_attributes` exists (READ, SaaS types reference). So a company user's token can read them. This means **anything written there is visible to the buyer**. Not established: whether a company user (not an integration) may call `setCustomAttributesOnCompany`; if so, a buyer could edit their own ERP figures.
- Live: GET `company/21` returned no `custom_attributes` key (READ). Most likely because none are set (INFERRED); I could not test a write.

### Other company fields

- `comment` on the company: "Admin only", free text, never shown to the buyer (READ, [Create a company account](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/account-company-create); REST `CompanyInterface`). Usable as a human note, not as data.
- `reseller_id`, `vat_tax_id`: real tax fields, shown to the buyer. Do not repurpose (INFERRED).
- `extension_attributes` on company: only what modules define. On Bodea they are `is_purchase_order_enabled`, `is_company_address_book_enabled`, `is_custom_shipping_address_allowed`, `quote_config` (READ, live GET `company/21`). There is no way to add your own extension attribute on ACCS without code in Commerce (INFERRED: ACCS takes no PHP modules).
- There is no company EAV. The live `eav/attribute-sets/list` for entity type 1 (customer) returned one "Default" set; `companyMetadata` does not exist (404, READ).

## 3. Customer attributes

- ACCS has Stores > Attributes > Customer and Customer Address (INTERNAL: Adobe Slack answer, medium confidence; also the ACCS release notes mention fixing "configuring several searchable customer or customer address attributes", READ).
- Bodea today has no merchant-defined customer attributes; the live `attributeMetadata/customer` list is system attributes plus two reward flags (READ).
- The company admin's customer record (id 44) ties to the company only through `extension_attributes.company_attributes` (READ, live GET `customers/44`).
- Verdict (INFERRED): wrong tool for per-ERP credit. The account belongs to the company, a company has many users, the value would be copied onto one person (the admin) and lost when the admin changes, and customer attributes that are on a storefront form can be edited by the customer. Use one only if the demo needs a per-USER fact, for example "this buyer may only order from ERP A".

## 4. Other Commerce pieces that can carry or show per-ERP credit

| Piece | What it could do here | ACCS | Source |
|---|---|---|---|
| Company status Blocked | "can log in and access the catalog, but cannot make purchases"; the integration already writes it on an ERP block | yes (in use) | READ, EXL create-company; `actions/company/external/...` |
| Applicable payment methods per company | Admin can restrict a company to selected methods; GraphQL `company.payment_methods` and `available_payment_methods` return them | yes for GraphQL fields; Admin setting READ in EXL; REST write not found | READ, EXL create-company; SaaS types |
| Purchase orders + approval rules | Rules on grand total, number of SKUs or shipping; could require approval above an ERP's remaining credit, but a rule is a fixed number, not live | yes (docs); not tested | READ, [createPurchaseOrderApprovalRule](https://developer.adobe.com/commerce/webapi/graphql/schema/b2b/purchase-order-rule/mutations/create/) |
| Negotiable quotes | Custom attributes on a quote (`setCustomAttributesOnNegotiableQuote`); could carry which ERP and its credit answer | yes | READ, attributes mutations index |
| Cart and order custom attributes | Stamp an order with its ERP and the credit decision; Admin order grid can filter by them (off by default, support ticket to enable) | yes | READ, REST custom attributes; ACCS release notes |
| Shared catalogs / customer groups | Price and visibility only; one group per company | yes | memory note (company is not a customer group); not credit |
| Company credit history `custom_reference_number` | Could carry the ERP's invoice or payment number on Reimburse rows | yes | READ |
| Admin UI SDK: menu page | The integration's own screen; can show per-ERP credit for every company | yes (measured: the integration runs one on Bodea) | READ, `app.commerce.config.ts:73-82` |
| Admin UI SDK: customer grid columns | Columns on Customers > All Customers filled by a Runtime action per visible customer id | docs say yes on V2; the page is tagged `edition: paas` but so is `menu`, which works on ACCS; not verified | READ, [customer grid-columns](https://github.com/AdobeDocs/commerce-extensibility/blob/main/src/pages/admin-ui-sdk/extension-points/v2/customer/grid-columns.md) |
| Admin UI SDK: order grid columns, order view button | Show which ERP holds an order and its credit status; a button to "Ask ERP for release" | as above | READ, V2 extension point index |
| Admin UI SDK: company page | **No extension point** for the company page or companies grid | no | READ, V2 index lists menu, customer, order, product, invoice, credit memo, shipment only |
| App Builder State / database | Per-company per-ERP credit cache, owned by each app | yes (the ledger already lives in State) | READ, `src/lib/ledger.js:15` |
| API Mesh | Could merge `company.credit` with each ERP's account into one storefront query | not assessed | could not establish in this pass |
| EDS drop-ins | `CompanyCredit` has no slots; `CompanyProfile.CompanyData` slot can add a panel; or a custom block beside `commerce-company-credit` | yes | READ, drop-in pages above |

## 5. Webhooks for enforcing credit at checkout

Live `GET webhooks/supportedList` on Bodea (READ) includes, among others:

- `plugin.out_of_process_payment_methods.api.payment_method_filter.get_list`: runs every time the payment method list is asked for; payload has the cart and the customer (id, group); the answer can remove methods (READ, [payment use cases](https://github.com/AdobeDocs/commerce-extensibility/blob/main/src/pages/starter-kit/checkout/payment-use-cases.md), "Filter out payment method").
- `plugin.sales.api.order_management.place` and `observer.sales_order_place_before`: run before the order is placed; returning `{"op":"exception","message":...}` stops the order with that message (READ, [order placement validation](https://github.com/AdobeDocs/commerce-extensibility/blob/main/src/pages/webhooks/use-cases/order-placement-validation.md), [responses](https://github.com/AdobeDocs/commerce-extensibility/blob/main/src/pages/webhooks/responses.md)).
- `plugin.out_of_process_totals_collector.*`: already used for contract prices and the discount ceiling (READ, live `webhooks/list`, both shown `required: true` although the app asks for `false`, which matches the 2026-09-26 measurement).

Not on the list: any company-credit webhook, and no hook on `companyCredits` operations (READ, live list).

Consequences (INFERRED): on this sandbox every webhook runs as required, so a place-order hook that cannot reach an ERP stops every order with its fallback message. A payment-method filter that fails would, by the same rule, stop the payment step. Keep both fast and fail open in code: return `success` when the ERP does not answer in time, and let the ERP hold catch it afterwards.

## 6. Two ERPs, one company: what each number should mean

In an ERP the credit account sits on the customer in that ERP (SAP: one credit segment per business partner), with limit, exposure (open orders and receivables) and blocks (READ, `.rptc/research/erp-composite-entities/research.md` section 6; `erp-standard-features-audit`). Two ERPs means two independent accounts. Neither ERP knows the other's exposure. A real merchant with two ERPs either keeps them separate (each ERP decides on its own orders) or runs a group credit limit in a credit-management layer above both. Commerce's single record fits the second model, not the first.

## 7. Design options

### Option A (recommended): Commerce line stays group-wide; per-ERP accounts in company custom attributes; ERP decides

- **Commerce company credit**: one group-wide number. With one ERP, today's behaviour stays (the ERP's limit writes through). With two ERPs, neither integration writes `credit_limit`; the merchant sets it, or the SC setup guide sets it to the sum. The Payment on Account balance stays Commerce's own record.
- **Per-ERP data**: each integration writes its own keys, prefixed with its app slug (the slug already exists for webhook naming, `app.commerce.config.ts:13-45`): `northwind_erp_account`, `_limit`, `_exposure`, `_available`, `_blocked`, `_as_of`. Values are strings.
- **Admin view**: the Custom Attributes tab on the company page (no code). The integration's own screen shows the full account per company. Optional: customer grid columns for the company admin row.
- **Buyer view**: a small EDS block beside `commerce-company-credit` (that container has no slots) that reads `company.custom_attributes` and renders "Your account with Northwind: available 42,000 USD", one line per ERP. Or the `CompanyProfile.CompanyData` slot.
- **Enforcement**: the ERP's standard credit check on order creation, then the Commerce order goes On Hold with the ERP's reason (already built). Optional hard stop: the payment-method filter removes Payment on Account when the ERP that owns the cart's lines is blocked or out of credit.
- **Reset**: each integration removes its own keys and leaves the other ERP's keys. Because a set call replaces the whole set, removal must read the current set, drop only its own prefix, and write the rest back. The ledger records the keys it added.
- Trade-offs: needs two small builds (attribute writer with read-modify-write, EDS block). Two apps writing the same set at the same moment can lose one write (INFERRED race); a periodic mirror from each ERP repairs it. Buyers can read every key, so never store anything internal there. Unknown whether a buyer can write them (section 9).

### Option B: Commerce credit as the enforced sum, with ERP-tagged history

- Limit = sum of both ERPs' limits. Balance moves with real Payment on Account operations; each ERP's invoice and payment post as Purchased and Reimbursed rows with `custom_reference_number` = the ERP document number and a comment naming the ERP.
- Admin view: the native Company Credit grid, reference numbers per ERP. Buyer view: native drop-in, but the GraphQL history has no comment, so the buyer sees the reference number and not the ERP name.
- Enforcement: Commerce's own Payment on Account check against the sum; `exceed_limit` false.
- Reset: reverse each balance row with a counter-operation (Commerce cannot delete history rows; the rows stay). Limit restore needs one owner.
- Trade-offs: needs one writer for the limit (a coordinator, or one ERP designated primary), otherwise the section 1 overwrite problem remains. Enforces the wrong rule: a company can spend all of ERP A's line on ERP A's products, and the sum says yes. History rows are permanent, which clashes with the "return to zero" rule; that is a finding under rule 1 of the repo's non-negotiables.

### Option C: Hard per-ERP enforcement before the order

- Place-order webhook splits the cart by ERP (the routing rules already decide which ERP owns which line), asks each ERP "can this account take X?", and returns an exception naming the ERP that says no.
- Data storage as in Option A. Enforcement is visible at checkout, not after.
- Reset: nothing to undo in Commerce except the attributes; the webhook is removed with the app.
- Trade-offs: on this sandbox every webhook is required, so an ERP outage stops checkout (fallback message) unless the action fails open. Adds checkout latency (a cold action plus an ERP call measured 3.8 s warm on 2026-09-25, READ, `app.commerce.config.ts` comment). It is also less like a standard ERP, which accepts the order and blocks it for credit review (READ, `erp-composite-entities` section 6, SAP credit-blocked sales document).

**Recommendation: Option A.** It is the only one where both ERPs' figures show in Commerce, with no ERP overwriting the other, and where reset composes. It matches how an ERP really enforces credit (accept, then hold). Add the payment-method filter later only if the demo needs a visible "you cannot pay on account" moment. Keep Option B's one good idea on its own: when the integration posts a Reimburse for an ERP payment, put the ERP's document number in `custom_reference_number`.

A cheap fix in reach today, independent of the choice: send a `credit_comment` such as "Set by Northwind ERP" on the limit PUT, so the credit history says who changed it. Not verified that it reaches the history row (no write allowed).

## 8. Summary table

| Capability | Could hold or do for per-ERP credit | ACCS | Source |
|---|---|---|---|
| Company credit limit, balance, available, currency | one group line; not two accounts | yes | READ, REST credit-manage; live GET |
| `exceed_limit` | hard stop on the group line for Payment on Account | yes | READ, EXL |
| Credit history, `custom_reference_number`, comment | who and which ERP document; comment not in GraphQL | yes | READ |
| increase/decreaseBalance (Purchased, Reimbursed...) | post ERP invoices and payments | yes | READ |
| Company custom attributes (REST, GraphQL, Admin tab) | per-ERP account, limit, exposure, available, block | yes | READ, REST/GraphQL docs, ACCS release notes |
| Company `comment` | human note, Admin only | yes | READ |
| Company status Blocked | whole-company stop | yes | READ |
| Per-company payment methods | turn Payment on Account off for a company | yes (Admin, GraphQL read) | READ |
| Customer EAV attributes | per-user facts only | yes (INTERNAL + release note) | INTERNAL; READ release note |
| Purchase order approval rules | fixed-amount approval gate | yes (docs) | READ |
| Cart, order, quote custom attributes | stamp ERP and credit decision on the document | yes | READ |
| Payment-method filter webhook | hide Payment on Account per ERP state | yes (live list) | READ |
| Place-order webhook | refuse the order per ERP | yes (live list) | READ |
| Admin UI SDK menu page | full per-ERP credit view | yes (measured in use) | READ |
| Admin UI SDK customer / order grid columns | per-ERP figures in grids | likely; not verified | READ docs |
| Admin UI SDK company page | none exists | no | READ |
| EDS CompanyCredit container | native line only, no slots | yes | READ |
| EDS CompanyProfile `CompanyData` slot, or a custom block | per-ERP panel for the buyer | yes | READ |
| App Builder State | per-app cache and ledger | yes (in use) | READ |
| API Mesh | merge Commerce and ERP credit in one query | unknown | not assessed |

## 9. What I could not establish

- Whether a **company user** (buyer token) is allowed to call `setCustomAttributesOnCompany`. If yes, a buyer could edit their ERP figures, and Option A's keys would need a check. Test: one GraphQL call with a buyer token on a scratch company.
- Whether `credit_comment` on `PUT /V1/companyCredits/:id` becomes the history row comment. Test: one PUT with a comment, then GET history.
- Whether the REST `setCustomAttributes` call replaces the whole set like the GraphQL one says it does. Test: set two keys, then set one, then GET.
- Whether `GET /V1/company/:id` returns `custom_attributes` once some are set (none are set on company 21).
- The exact storefront behaviour and message when a Payment on Account order exceeds available credit with `exceed_limit` false. Not in the docs I could read.
- Whether Admin UI SDK V2 customer and order grid columns render on ACCS (the docs tag them PaaS, the same tag the working menu carries).
- How credit behaves across a company hierarchy.
- API Mesh as a merge layer: not assessed.
- Two live reads failed: `GET company?searchCriteria[pageSize]=50` and `GET companyCredits?searchCriteria[pageSize]=50` returned "Adobe sign-in required" partway through the pass. I did not sign in, since that needs the owner's consent. All other live reads above succeeded earlier in the same pass.
- The developer.adobe.com rendered page for company credit returned only its first paragraph; I read the same content from the docs' source repository instead.
