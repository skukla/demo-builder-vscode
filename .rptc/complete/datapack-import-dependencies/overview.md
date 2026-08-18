> **Archived 2026-08-18.** Verified on `develop`: `src/features/data-installer/ui/importDependencies.ts`
> exists, landed by `16428dd8` (*feat(data-installer): resolve data type dependencies when
> importing part of a pack*). The commits this plan's body cites are pre-rebase hashes and no
> longer resolve — check the artifact, not the hash.

# Datapack import — data type dependency selection

**Goal.** When someone imports part of a datapack, help them pick a coherent set:
selecting `products` selects what products needs, and a type cannot be unticked
while something still selected depends on it.

**Status:** SHIPPED 2026-08-17. Two things changed after this was written, both
recorded below rather than silently folded in.

1. **Both alternatives to the local map are now eliminated by measurement.** The
   service author confirmed `depends_on` is export-only. His suggestion, validate
   mode, does not cover it: validating `products` with none of its three
   dependencies answers `{valid: true}` (control: an unknown type answers
   `{valid: false}`). The map is the only option, not the expedient one.
2. **Unticking clears what ticking added**, which this plan did not describe. Found
   by using the built UI: unticking `products` left three types selected that
   nobody chose, bound for a live instance. Fixed with a provenance record — see
   "What gets built".

**Still open, deliberately:** whether the B2B assignment types depend on their
parents for IMPORT. The export graph says they do; the same assignment shape is
exactly what bodea disproved for inventory; and bodea imported all its B2B types
together, so there is no partial-import evidence either way. A question for the
service author, not an inference.

## The finding that shaped this

The obvious design — read `dependsOn` from `get-export-data-types` and apply it to
import — is **wrong**, and it was measured rather than argued.

The `bodea` datapack imported **all 14 of its types successfully** with no `stocks`
and no `sources` present. The export graph says:

- `stock_source_links` dependsOn `[stocks, sources]`
- `source_items` dependsOn `[products, sources]`

Driving import selection from that graph would have force-selected two types the pack
does not contain, and reported a problem on a pack that imports perfectly.

Export dependencies exist for **reverse substitutions** — the Export guide says so
outright: "converting customer group ID to code requires fetching customer groups."
They describe what an EXPORT needs in order to write names instead of ids. They are
not import requirements.

**No endpoint exposes import edges.** `get-processor-order?operation_mode=import`
returns 21 ordered names and nothing else (416 bytes live, versus 3,448 for export).

## Where the edges come from, and how much each is worth

Decision (user, 2026-08-17): a local map derived from documented substitutions.

The Import guide documents substitutions for **`products` only**, so a strictly
documented map has one entry. The map below is therefore tiered, and the tier is
recorded per edge in the source so the weak ones are visible rather than implied.

| Edge | Evidence | Tier |
|---|---|---|
| `products` → `attribute_sets` | Import guide, substitution `attribute_set_id` ← attribute set name | documented |
| `products` → `categories` | Import guide, substitution `category_ids` ← category URL keys | documented |
| `products` → `customer_groups` | Import guide, substitution `tier_prices.customer_group_id` ← group code. Already encoded as `needsCustomerGroups` | documented |
| `coupons` → `cart_rules` | The live catalog's own description: "converts rule_id to rule_name **for import compatibility**" — an import-facing statement | strong |
| `attribute_assign_to_set` → `attribute_sets`, `product_attributes` | The assignment cannot resolve without both sides; matches the observed import order | inferred |
| `customers` → `customer_groups` | Mirrors the products/customer_groups substitution; matches the observed import order | inferred |

**Deliberately NOT included:** every inventory edge (`stock_source_links` → `stocks`,
`sources`; `source_items` → `sources`).

**Correction (2026-08-17, after shipping).** This was first written as "bodea disproves
them," and that overstates the evidence. What bodea shows is that the import did not
FAIL without them — every type reported `success`. It does not show that rows landed.
`docs/systems/data-installer.md` records the distinction directly: `GET /V1/categories`
returns only the default store group's subtree, so "a multi-root instance makes an
import look like a no-op through that endpoint while `per-type: success` is telling the
truth." A per-type success is not a row count.

So the inventory edges are **unproven in both directions**, not disproven. Leaving them
out remains right for a different reason than first given: bodea contains neither
`stocks` nor `sources`, so auto-selection could not add them regardless — the only
effect of including the edges would be a `missingDependencies` notice, and whether that
notice would be TRUE is exactly what is unestablished. Settle it by asking the service
author, or by checking whether bodea's `stock_source_links` item actually holds rows. Also excluded:
the B2B assignment edges, which the export graph carries but no import evidence
supports — bodea imported all four B2B types with no ordering help from us.

**The rot this accepts.** A hardcoded map goes stale exactly as the vendor docs did —
their type list said 11 where the deployment has 18, and their `products` edge list
said 4 where the live catalog says 5. Two mitigations, both cheap:

1. A test asserts every type named in the map still appears in the live import order.
   A renamed or removed type fails the suite instead of silently doing nothing.
2. Each edge carries its evidence in the source, so the next person can tell a
   documented edge from an inferred one without re-deriving this analysis.

The durable fix is Jeff exposing `depends_on` for import mode; the service already
has it in `data_processors_import.json`. Worth asking for, not worth blocking on.

## What gets built

**`importDependencies.ts`** (new, `features/data-installer/`) — pure, no React:

- `IMPORT_DEPENDENCIES` — the tiered map above
- `withDependencies(selected, available)` — adds each selected type's dependencies,
  transitively, limited to types the pack actually has
- `blockedBy(type, selected)` — which selected types still need this one; empty means
  it can be unticked
- `missingDependencies(selected, available)` — dependencies that are NOT in the pack,
  so cannot be auto-selected. This is the case `needsCustomerGroups` half-covered and
  the one with the most value: the user learns before importing, not after.
- `selectType` / `deselectType` over a `TypeSelection` — the tick and untick
  transitions, carrying a provenance record.

**Provenance, and why it is not optional.** Unticking has to undo what ticking did
and nothing more. Without a record of WHO chose each type, "clear the dependencies"
is wrong half the time: clear blindly and a type the user ticked before it was
borrowed is discarded; clear nothing and one click leaves types selected that nobody
picked, headed for a live Commerce instance. So `auto` records what the system
added, and a dependency is dropped only when the system added it AND nothing still
selected needs it.

**`ImportForm.tsx`** — wire the checkbox group:

- ticking a type also ticks its satisfiable dependencies
- unticking is refused while `blockedBy` is non-empty, with the reason named
- `missingDependencies` renders where the customer-groups warning does today
- **delete `needsCustomerGroups`** — auto-selection makes its warning unreachable, and
  the project does not keep soft-deprecated code

**Handler** — `list-datapack-data-types` fetches `catalog` only for export mode. Not
needed for this feature, since import edges come from the map. Left alone.

## What this is NOT

Not a general dependency engine. Six edges over a 21-type list, with a resolver small
enough to read in one screen. If the import edges ever arrive from the API, the map is
the only thing that changes.

## Found while building this, NOT part of it

**The import scope defaulted to `base` instead of to the project.** FIXED —
`08382431` (modal seeds from the project) and `e2716d81` (an omitted payload falls
back to it). Three surfaces now resolve through one `resolveInstallTarget`.

**The reset worry that drove it is DOWNGRADED.** The concern was that a
freshly-opened modal reset against `base` rather than wherever the data landed.
Per the service author, delete "is limited to the products it knows about — think
of it like import in reverse, it goes through the data files and deletes those
entities." Identity comes from the pack's files, so a wrong scope is unlikely to
mis-target them; scope's documented job is resolving names to ids in a session
context (`session_website_id` / `session_store_id`), not selecting the set.

So this reads as a papercut rather than a lurking defect, and the fix stands on
its own merits — three paths agreeing, at no cost. **Still not established**, and
deliberately not asserted in any user-facing doc: whether a scope pair changes
WHICH entities a delete removes, or only how names resolve. One question to the
service author closes it; a destructive test would too, and neither is worth
scheduling on its own.

**Instance prerequisites the UI never mentions**, all from the vendor docs and none
of them type dependencies: B2B features must be enabled in the Admin UI before
importing B2B data; a non-default website or store view must already exist on the
instance; store config including the root category is manual after import; and a
cart rule naming a customer segment imports but needs fixing by hand.

## Test strategy

Pure resolver first (RED before any UI change):

- transitive selection, and that it stops at what the pack contains
- deselect blocked by a dependent; allowed once the dependent goes
- missing dependencies reported, and NOT auto-selected
- the inventory edges are absent — a regression guard tied to the bodea measurement
- every mapped type exists in the live import order (the anti-rot test)

Then the form, using the existing webview test patterns.
