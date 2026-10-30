# Step 11: cart rules, coupons and gift cards

Status: **built 2026-10-30, not yet live** (no commit). Owner-approved scope (2026-10-29): build cart
rules, coupons and gift cards; the ACO kinds only if they map cleanly (they do not, below); images
and `product_export` become their own backlog items: [[DI-7]] and [[DI-8]]. What was known of those
two before is in [step 05](step-05-capture-and-repeat-installs.md), "Left out, and later".

## Which packs, and which rows were read

Kept packs holding these kinds (`get_datapack`, 2026-10-30): cart rules in Health & Beauty, Carvello
and wknd `main`, Luma and Venia `eds-compatible` (5); coupons in all but Carvello (4); gift cards in
Luma only (1). Rows read with `save_datapack_zip` (read-only), typed into
`tests/helpers/commerceSalesRuleFixtures.ts`: **Health & Beauty, Carvello and wknd `main`**. Luma and
Venia could not be read: their `product_export` item is too big for the service's answer, and the
zip read stops there ([[DI-8]]). So **no real `giftcards` row was read**; the gift card fixture is
CitiSignal's store gift card, read live (below), in pack form.

What the rows hold that mattered: rule `website_ids` and customer groups by CODE (`VIP`, `NOT LOGGED
IN`, `General`, …); conditions naming categories by url key list (`skincare,beauty,hair-care`), an
attribute set by name inside a subselect (`Wipers`), SKUs; Commerce's `times_used` counter; a coupon
naming its rule by NAME; Carvello's customer segment condition (segment `1` of its source store);
Health & Beauty's `ampromo_spent` action (an Amasty extension's).

## What was built

| Kind | Install | Recorded as (key) | Updated by | Taken back by |
|---|---|---|---|---|
| `cart_rules` | `POST salesRules` when the store has no rule of that exact name: on the install target's website only (as the service, `replaceValueArray(session_website_id)`), groups by code to this store's ids, conditions both ways (`ruleConditions.ts`), no `rule_id`/`times_used`, only the default store label | rule id (name) | `PUT salesRules/{id}` | `DELETE salesRules/{id}`; Commerce deletes its coupons |
| `coupons` | `POST coupons` when the store has no such code: on the rule this install made for that name, else the store's rule of exactly that name, else stop naming both; code kept exactly; no `coupon_id`/`times_used`/`created_at` | coupon id (code) | `PUT coupons/{id}` | `DELETE coupons/{id}` |
| `giftcards` | rides the products kind: `POST products`, recorded under `giftcards` (so a repeat install finds its rows there); amounts sent once in `extension_attributes.giftcard_amounts`, every website (`website_id` 0) with this store's attribute id, never the custom-attribute copy | SKU | `PUT products/{sku}` | `DELETE products/{sku}` |

- **Gift cards: their own kind, the products kind's machinery.** `PRODUCT_KINDS` (`productsKind.ts`)
  makes every place that reasons about "a product" take both: quantities (`sourceItemsKind.ts`), the
  category and set container rule (`removers.ts`), "already in the store" in the preview, the wipe's
  recorded products, capture (gift cards are read with products, for their set, categories and
  quantities, and written under `giftcards`). The amounts fix applies to `products` rows too.
- **Order** (`runPack.ts`, the service's): products, **gift cards**, quantities, customers, **cart
  rules, coupons**, then shared catalogs. Rules before catalogs on purpose: a catalog renames its
  group (step 08), and a rule names groups by code.
- **The container rule**: a cart rule this engine made is kept while it holds a code it did not make
  (`GET coupons/search` on `rule_id`), through `decideRemovals`, so removal, reinstall and the
  preview agree: "Kept the cart rule 10% Coupon: it holds 1 coupon you added." A read that fails
  keeps it.
- **Repeat install keeps Admin edits**: both hashes per object, `decideOwnedChange` unchanged. The
  counters are left out of pack form, so a demo order using a rule or code is never taken for an edit
  (tested). Website ids are left out of pack form, as a product's are.
- **Capture** (`capturePromotions.ts`): the recorded and installed-by-name rules and codes, every
  rule a captured code needs, and every TYPED code on a captured rule (the SC's own included);
  generated codes (`type` 1) left out.
- **Preview**: a rule or code the store already has by name counts under "already in the store".
- **Customer segments**: a segment condition is sent as it is and Debug Logs says the rule needs its
  segment chosen in the Admin (the import-datapack skill already tells agents this).

**The wipe** (`demoDataWipe/wipeCartRules.ts`, through `planWipe`/`runWipe`/`withinPlan`): a rule on
ONLY wholly chosen websites is deleted (its coupons with it); one also on a website not chosen is
read whole and sent back with only the others (`GET` then `PUT salesRules/{id}`); one on a website
only PARTLY chosen is left ("they apply on a website a store not chosen also sells on"); one an
install record lists, or holding a coupon one lists, is left to the pack's removal. Rules go after
products, before categories (their conditions name categories). Shown in the Data Installer's Clear
demo data list ("Cart rules: 1 to remove, with their coupons, 1 taken off the chosen websites"),
in reset's question, and in `check_demo_data` / `clear_demo_data` (descriptions updated, catalog
regenerated). A store answering `salesRules/search` 404 reads as no rules.

**ACO kinds: not built** (owner's condition). They target Commerce Optimizer's ingestion API (another
backend and credential), which has no list or get, so no fingerprint, capture, container rule or
wipe is possible, and every row is keyed by the pack's own name. Kinds, row shapes (read from
`aco_wknd@main`) and endpoints are recorded in [[PL-60]], with the recommendation to build them as
its data step after beta.153. The engine keeps refusing them before any write.

**Files.** New: `cartRulesKind.ts`, `couponsKind.ts`, `ruleConditions.ts`, `giftCardAmounts.ts`,
`capturePromotions.ts`, `demoDataWipe/wipeCartRules.ts`, `src/types/commerceSalesRule.ts`. Changed:
`runPack`, `repeatInstall`, `removers`, `storeCopies`, `packForm`, `productsKind`, `sourceItemsKind`,
`capture`, `storeChanges`, `wipePlan`, `wipeRun`, `types/demoDataWipe`, `clearDemoDataWords`,
`edsResetOtherData`, `datapackStages`, `dataInstallerDescriptors`, `mcp-server.md`, `mcp-tools.md`.

**Tests.** New suites: `cartRulesKind`, `couponsKind`, `giftCards`, `runPack-promotions` (a stateful
fake store: install, Admin edit kept, back to zero, kept with an SC code), `capturePromotions`,
`wipeCartRules`; added cases in `removers`, `storeChanges`, `ClearDemoDataModal`, `edsResetOtherData`.
Pins that moved, each because the contract did: the install order and the "cannot install" kind in
`runPack`/`engine` (now `product_export` / `aco_products`), the wipe's removed counts.

### Which reads and writes are confirmed against a captured real response

| Read or write | Endpoint and field | Captured? |
|---|---|---|
| rule search | `GET salesRules/search` page (`items`, `search_criteria`, `total_count`) | **page yes, empty** (2026-10-30); an item **no** |
| coupon search | `GET coupons/search` page | **page yes, empty**; an item **no** |
| gift card amounts attribute | `GET products/attributes/giftcard_amounts` (`attribute_id` 134, `price`, `scope` website) | **yes** |
| a gift card's copy | `GET products` item, `giftcard_amounts` in both places | **yes** (`GIFT_CARD_6`) |
| a rule's / coupon's copy | `GET salesRules/{id}`, `GET coupons/{id}` | **no** |
| make / update / remove a rule | `POST salesRules` (`rule_id` answered), `PUT`, `DELETE salesRules/{id}` | **no** |
| make / update / remove a code | `POST coupons` (`coupon_id` answered), `PUT`, `DELETE coupons/{id}` | **no** |
| a rule's codes | `GET coupons/search` on `rule_id`; on `coupon_id` in (the wipe) | **no** |
| a rule's coupons go with it | Commerce's FK, the service's delete config relies on it | **no** |
| a gift card made with the amounts in `extension_attributes` only | `POST products` | **no** (the sandbox's own holds each amount twice: a lead that sending both duplicates them) |
| take a rule off a website | `PUT salesRules/{id}` with its whole body and fewer websites | **no** |

### Decisions for the owner (recommendation first)

1. **A rule holding codes the SC generated or typed is kept on removal** (the container rule).
   Recommended: keep; a code handed to a customer in a demo should not vanish. The cost: a reset
   leaves that rule until the SC deletes the codes.
2. **Gift card amounts go on every website (`website_id` 0).** Recommended: keep; it works whether
   the store prices globally or per website. Per-website amounts are lost on capture.
3. **Capture saves typed codes, not generated ones.** Recommended: keep.
4. **The wipe leaves rules on a partly chosen website.** Recommended: keep; a rule cannot be tied to
   one store.
5. **Health & Beauty's `ampromo_spent` rule** (an Amasty action ACCS likely lacks) is sent as it is;
   if Commerce refuses it, the install stops at that rule, naming it. Recommended: see it live first;
   then either drop that row from the library's copy or skip unknown actions with a line.
6. **Website edits to a rule are not seen as Admin edits** (websites are out of pack form, as for
   products), so a pack change to that rule would put it back on the install target's website only.
   Recommended: accept for now.

### Not built, and checks not run

- The live test below: **not run**. This run was told to make no Commerce writes; it is the owner's call.
- `security-review`, `ai-coverage-scan` and a response-ceiling re-measure (`check_demo_data`'s answer
  gained two small fields). No new tool and no new button: both surfaces reach the same handlers.

### Live test (owner's call; project `scratch-1028`, website `justrite_test_website` only)

A throwaway pack: one rule `ZZ Test Ten Off DB11` (specific coupon, groups `General`, one
`category_ids` condition on a test-website category), its code `ZZTEN-DB11`, one rule `ZZ Test Cart
DB11` (no coupon), and gift card `zz-giftcard-db11` (two amounts, in the test website's root).

1. `load_datapack_zip`, `preview_datapack_changes` (add 2 rules, 1 coupon, 1 gift card),
   `start_datapack_import`. Read the record: `key`, `fingerprint`, `wrote` on all four; read back
   once and capture as fixtures: `GET salesRules/{id}`, `GET coupons/{id}`, the gift card's `GET
   products/{sku}` (are its amounts there once?).
2. In the Admin change the rule's discount; preview: keep 1. Install again: "Kept 1 thing you had
   changed in the Admin."
3. "Save store changes": the new version holds both rules, the code by its rule's name, the gift card
   under `giftcards`.
4. Add a code `ZZMINE-DB11` to the rule in the Admin; remove the pack: "Kept the cart rule ZZ Test Ten
   Off DB11: it holds 1 coupon you added."; delete your code, remove again: the record goes, and the
   Admin shows no `DB11` rule, code or gift card (back to zero).
5. Wipe: make `ZZ Wipe DB11` by hand on `justrite_test_website` only; `check_demo_data` on
   `justrite_test_store` lists it under cart rules; `clear_demo_data` deletes it. (A rule also on
   JustRite's website is not to be made: the take-off path stays unexercised live.)
