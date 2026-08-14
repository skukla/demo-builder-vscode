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
| 4a product-teaser | Renders "Bodea VR Rack"-class product, name + price | **Image placeholder** — the pack ships no images (by design; AEM Assets supplies them) |
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

---

## Cleanup

- [ ] Revert the local `hidden: false` flip (`git checkout src/features/project-creation/config/demo-packages.json`)
- [ ] Delete the throwaway GitHub repo and DA site if not being kept
- [ ] Optionally reset the datapack off the test instance (`operation_mode: 'delete'` restores it byte-identical — proven 2026-08-13)

## Results

_Record pass/fail per check, with the date and instance type. A failure here is a finding,
not a setback — it is exactly what this test is for._
