# Bodea thin end-to-end smoke test

**Purpose:** prove the pipeline before investing in Step 04 content. Every check below is
cheap to fix now and expensive to fix after a full content build. Stop at the first failure
and record it here rather than working around it.

**Not in scope:** a complete demo. One page with a handful of blocks is enough.

---

## Preconditions (who does what)

| # | Precondition | Owner | Notes |
|---|---|---|---|
| P1 | A Commerce instance to test against (ACCS or PaaS) | **User** | Can be a throwaway. Its store scope must exist — the importer cannot create one. |
| P2 | `bodea` datapack imported, version `main` | **User** (or the data-installer session) | **`customer_groups` MUST be imported with or before `products`** — 49 of 56 products carry tier prices naming "Platinum Buyer" by name, and the lookup failing kills the whole `products` type atomically. Suggested types: `attribute_sets, product_attributes, attribute_assign_to_set, categories, customer_groups, products, source_items, stock_source_links`. |
| P3 | Catalog Service / Live Search indexed after import | **User** | Blocks read Catalog Service, not core catalog. Products saved but unindexed are invisible. |
| P4 | Extension Dev Host running from this worktree | Claude prepped, user launches | `npm run watch:all`, then F5. |
| P5 | `hidden: false` on the bodea package | **Claude, uncommitted** | Must be reverted before any commit — see "Cleanup". |

The import UI lives on the `feature/data-installer` branch, not on develop. Either import from
that worktree's Dev Host, or use the documented direct call
(`docs/systems/data-installer.md` §6 shape, with `operation_mode: 'import'`).

**Operational detail from the data-installer session's own runs (2026-08-14):**
- Send `customer_groups` **in the same request** as `products` — order within a request is the
  service's to decide, so no sequencing needed; just never send `products` alone.
- `commerce_instance` is the **22-char tenant id, not a URL** — the segment before `/graphql`
  in `ACCS_GRAPHQL_ENDPOINT`.
- Timing to budget: 5 types ≈ 74s · products-only retry ≈ 110s · 6-type reset ≈ 470s.
  Roughly ten minutes for install → inspect → reset.
- Their shared instance sits at **baseline (no Bodea)** — imported and reset this morning,
  verified byte-identical: 14 categories, 130 CitiSignal products, websites `base` + `citisignal`.
  Seeding it needs the owner's approval; it is not ours to write to unasked.
- The import modal now offers an **optional target website/store**, defaulting to none (the
  service's `base`). Leave it unset for this smoke test — untargeted matches every assumption
  in this checklist, and our shipped `configDefaults` are `base`/`default` to match. Targeting
  requires the website to already exist in Commerce; the picker lists only what is there.
- The `customer_groups`-with-`products` trap is now guarded in that modal (a warning when
  `products` is selected and `customer_groups` is available but unticked), so following the UI
  is safe. The rule still holds if you drive the API directly.

---

## Run

### 1. Create the project
Wizard → **Bodea** → EDS + (ACCS|PaaS) → connect to the P1 instance → pick the real store view
in the picker → complete creation.

| Check | Pass looks like | If it fails |
|---|---|---|
| 1a Package appears | "Bodea" card in the picker | P5 not applied |
| 1b Repo created from template | New GitHub repo generated from `boilerplate-b2b-template` | Template-generate / token issue |
| 1c LKG pin applied | Repo pinned to the b2b LKG SHA, not `main` | `codePatchSource` wiring |
| 1d The six b2b patches applied | No unapplied-patch warning toast | Patch ledger / precondition drift |
| 1e Store picker shows real scopes | Dropdowns list the instance's actual websites/stores | Discovery, not us |

### 2. Brand assets — the one NEW mechanism, highest risk
| Check | Pass looks like |
|---|---|
| 2a `styles/bodea-theme.css` exists in the generated repo | File present, content matches bodea-source |
| 2b `scripts/bodea-customer-group.js` exists | ditto |
| 2c `head.html` carries the marker block | `<!-- demo-builder:brand-assets start -->` … `end` with the link + module script inside |
| 2d Theme visibly applies | Storefront renders in Bodea green/ink/gold, not stock boilerplate |
| 2e Re-run is idempotent | Reset the project → head.html has exactly ONE marker block, files unchanged |

### 3. Block library
| Check | Pass looks like |
|---|---|
| 3a `bodea-blocks` installed | The 28 blocks present under `blocks/` in the generated repo |
| 3b Component JSONs merged | Bodea blocks appear in `component-definition.json` |
| 3c No collision with template blocks | Boilerplate blocks unchanged (dedup skipped them) |

### 4. Blocks against real data — author ONE page in DA with:

```
product-teaser
sku	vrrack
details-button	true
cart-button	true
```
```
luxury-configurator
sku	bodea-vr-rack
attribute-groups	Configuration: Processor
```
```
commerce-account-hub
show-module-cards	true
```
```
catalog-highlights   (any two authored rows — no backend needed, proves the block pipeline alone)
```

| Check | Pass looks like | Known-acceptable |
|---|---|---|
| 4a product-teaser | Renders "Bodea VR Rack"-class product, name + price | **Image placeholder** for the 23 of 26 SKUs with no AEM asset yet. `AEM_ASSETS_ENABLED` stays TRUE — assets are where Bodea images belong; the coverage gap is a data task, not a reason to flip the flag. A PLP that renders EMPTY (not just image-less) is the unguarded-throw defect, worth reporting. |
| 4b product-teaser bad SKU | Author `sku  does-not-exist` → named "Product unavailable" card | — |
| 4c luxury-configurator | Real Processor options (2.4/3/3.2/4 GHz), price updates on select, Add to Cart enables when valid | Dropdowns not swatches — pack has no swatch data |
| 4d commerce-account-hub (signed out) | "Sign in to view live account…" | — |
| 4e commerce-account-hub (signed in as a company user) | Company tiles populate; **Quotes/Requisition Lists read 0** | 0 is correct — no pack can seed them |
| 4f catalog-highlights | Renders fully | — |

**Do not chase these — they are correct behaviour, not failures:**
- **No product images.** The pack ships none by design; AEM Assets supplies them.
- **Dropdowns, not swatches.** No swatch data exists in the pack.
- **Quotes / Requisition Lists read 0.** No datapack can seed them; the service has no processor.
- **Categories look missing via `GET /V1/categories`.** That endpoint shows only the default
  store group's subtree, so a successful Bodea import can read as a no-op. Use
  **`GET /V1/categories/list`** (flat search). This has cost a previous session real time.

Sign-in for 4e: a customer from the pack (`@adobedemo.com`; passwords are in the pack's
`customers` data type — read, don't commit). `mark@` and `kareena@` are company admins.

### 5. Customer-group pricing — the native story
| Check | Pass looks like |
|---|---|
| 5a Guest | Catalog Service requests carry `Magento-Customer-Group` (hashed guest `MA==`) |
| 5b Signed in as a Platinum Buyer customer | Header changes to that group's hash; tier price visible on a tier-priced SKU |

Observe in devtools → Network → the Catalog Service request headers.

### 6. Reset round-trip
Reset the project. Everything above should hold identically — brand assets re-vendored once,
blocks reinstalled, patches re-applied.

### 7. NEW since run 1 — none of this has been through a create

Run 1 predates the step-04 content work, the rack-finder schema, and the repricing fix.
These checks are the delta; everything above still applies.

| Check | Pass looks like | Fails if |
|---|---|---|
| 7a Schema vendored | `data/guided-selling/bodea-rack-finder.json` exists in the generated repo | brandAssets refused the target — the `data/` + `.json` allowlist rule did not ship |
| 7b Schema served | `https://main--<repo>--<owner>.aem.live/data/guided-selling/bodea-rack-finder.json` returns 200 and parses | it was written to DA instead of the repo (DA rejects non-sheet JSON) |
| 7c Block doc pages | DA Library lists the 28 Bodea blocks with real examples, not one-cell stubs | `copyBlockDocPagesFromSources` could not reach `bodea-source` on the CDN |
| 7d Nav | Every nav link resolves; no `/apparel`, `/shop`, `/order-status` | content copy pulled a stale nav |
| 7e Category pages | `/racks`, `/switching`, `/wi-fi`, `/cables`, `/cooling`, `/critical-power` each render products | the store group root category is not the Bodea root |
| 7f Rack finder | Author a page with `guided-selling-luxe` (`schema-url` `/data/guided-selling/bodea-rack-finder.json`); complete the quiz; result tiles show real products | a wrong `categoryPath` renders empty tiles, and the block cannot tell that from an empty category |
| 7h Commerce routes | `/cart`, `/checkout`, `/quick-order`, `/search`, `/wishlist`, `/order-status` all render | they were missing entirely until 2026-08-16 — a content copy from a stale page list would drop them again |
| 7g **Repricing — the unproven one** | With results on screen, sign in as a **group 7** buyer. Tiles repaint **without a reload**: a rack goes 7,500 -> 6,750 | `bodea/customer-group-changed` never fired, or the old vendored script shipped |

7g is the only check here that exercises code verified statically but never at runtime.
Measured group pricing to compare against (`bodea-datapack-facts.md` has the full table):

| Group | vrrack | switchlite24 | indoorpatchcable |
|---|---|---|---|
| 0 guest | 7500.00 | 999.00 | 4.00 |
| 6 | 7500.00 | 999.00 | 3.28 |
| 7 | 6750.00 | 899.10 | 4.00 |

### 8. Unhide — do this LAST, only once 1-7 pass

`hidden: true` is the gate marker for exactly this run, so flipping it early makes it
meaningless. Three edits, then `gate`:

- `demo-packages.json` -> `"hidden": false`
- `tests/templates/demo-packages-bodea.test.ts:53` — "should exist and be hidden"
- `tests/features/project-creation/ui/helpers/demoPackageLoader.test.ts:191` — the
  selectable-set pin asserts `not.toContain('bodea')`

---

## Cleanup

- [ ] Revert the local `hidden: false` flip if 1-7 did NOT all pass
- Nothing here needs deleting. The throwaway repo/DA site/Config Service entry from an
  earlier run are **reusable — a create or reset overwrites them**, and `brandAssets`
  re-vendors from `bodea-source@main`, so the fixed customer-group script and the schema
  land on the way through. The only stale-script trap is inspecting an OLD project without
  re-running create; a run that starts from the wizard is always current.
- [ ] Optionally reset the datapack off the test instance (`operation_mode: 'delete'` restores it byte-identical — proven 2026-08-13)

## Results

_Record pass/fail per check, with the date and instance type. A failure here is a finding,
not a setback — it is exactly what this test is for._

### Run 1 — 2026-08-15, ACCS (`na1-sandbox`), repo `skukla/bodea-template-test`

**Outcome: stages 1 and 3 PASS; stage 2 not reached. Blocked on an unmet prerequisite (empty
DA content), not a defect.**

| Stage | Result |
|---|---|
| 1a package visible | ✅ |
| 1b repo from template | ✅ `skukla/bodea-template-test`, 3342 files |
| 1c LKG pin | ✅ pinned to `37b7a64` |
| 1d patches | ✅ **4 of 6** applied (canonical phase). The other 2 target `blocks/` and run post-install — never reached, see below |
| 1e store picker | ✅ discovery returned 3 websites / 3 store groups / 3 store views |
| 3a–3c block library | ✅ **29 blocks installed**; 75 bodea-source and 52 demo-team duplicates correctly skipped (dedup firewall works) |
| 2a–2e brand assets | ⛔ **NOT REACHED** |
| 4–6 | ⛔ not reached |

Also verified working along the way: fstab push, inspector tagging, PDP404 vendoring (incl. a
stale-SHA retry that self-healed), Quick Edit wiring, code sync + CDN publish, DA.live permission
grant, and Config Service registration recovering from a 409 via delete → re-PUT (201).

**Failure:**
```
[EdsPipeline] Copying content from skukla/bodea-source to skukla/bodea-template-test
[DA.live] List API returned 0 files, falling back to content index
[EdsPipeline] Failed: Failed to fetch content index from skukla/bodea-source
```
The `bodea-source` DA site has no content — Step 04 has not been done. Predictable and
pre-verified (`main--bodea-source--skukla.aem.live/` 404s); should have been called out as a
blocker before this run.

**Architectural characteristic worth knowing (not fixed, deliberately):** content copy runs at
`edsPipeline.ts:554`, block-phase patches at `:579`, brand assets at `:588`. So a content failure
aborts code-side steps that do not depend on content — which is why 2 patches and the entire
brand-assets vendor point went untested. Reordering to work around an empty `contentSource` would
mask our own Step 04 gap; the fix is content, not order. Revisit only if a real content outage
ever costs a storefront its brand assets.

**To finish the test**, either seed `bodea-source` DA with minimal content, or temporarily point
`contentSource` at `adobe-commerce/boilerplate-b2b` (local, uncommitted) purely to exercise
stages 2 and 4–6.

**Cleanup owed:** `skukla/bodea-template-test` repo + its DA site + its Config Service entry.
