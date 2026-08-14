# Datapack Import Targeting — website/store picker + dependency guardrails

**Status**: planned (design inputs verified live 2026-08-14)
**Parent**: data-installer DoD item 3b — split out as its own feat per the user,
2026-08-14. The branch does not land without it.

## Why

The Data Installer rewrites every pack `website_ids` with the session website
(`replaceWebsiteIdsWithSession()`), driven by optional request params
`website_code` + `store_code` (validated as a pair against the instance;
default `base`/id 1). The extension's `buildBody`
(`dataInstallerWriteClient.ts`) sends neither, so today every import lands on
`base` with no say from the user. Proven live: a bodea import with
`website_ids: [3]` throughout put all 56 products on website 1.

The same run surfaced a second UX gap this feat owns: `products` imports
atomically and fails entirely when tier prices name a customer group that
`customer_groups` would have created — a cross-type dependency the type
checkboxes let users walk into and validate cannot catch.

## Decisions already made (do not relitigate)

1. **The picker consumes the extension's own store discovery**
   (`discoverStoreStructure`, method 1) — NOT the Data Installer's
   `get-websites-and-stores`. Audit 2026-08-14: method 2 needs the Commerce
   credential pair the wizard doesn't have yet, returns only 2 levels (its
   "stores" are store *views*; store groups never fetched), and belongs to
   another team on a stage endpoint. Method 1 is 3-level, admin-stripped at
   the seam (id-0 trio), IMS-token-only for ACCS, and ours to fix.
   `get-websites-and-stores` remains exactly what it is: the pre-flight
   credential probe.
2. **One website per run is a service invariant**, not a UI choice — the
   substitution collapses every `website_ids` to one element. The picker is a
   single selection, not a multi-select.
3. **Filter by id 0, never by code** if any admin-scope filtering is needed
   locally (the admin group's code is 'default').

## Shape

- **Target section in the import modal** (`ImportDatapackModal`): optional
  "Target website / store" fields, populated via the existing
  `discover-store-structure` handler path, defaulting to `base`. Store options
  constrained to the chosen website (the service 400s a mismatched pair — catch
  it client-side instead).
- **`buildBody` gains the pair** (`website_code`, `store_code`) — sent only
  when the user picked something; omitted = today's behavior.
- **Dependency guardrail**: when `products` is selected without
  `customer_groups`, say so before start (warning, not a block — packs without
  tier prices are fine). Keep it data-driven if cheap; hardcode the one known
  edge if not (YAGNI).
- **Reset symmetry**: deletes are pack-scoped by item, and the live 6-type
  reset restored a targeted import byte-identical without any website param —
  no `website_code` needed on delete. Verify once in tests against the client,
  not assumed in code comments.

## Verification inputs (all measured, 2026-08-14 run)

- Import: 202 + activation id; per-type status via `datapack-process-status`.
- 5-type import: 4 success + `products` fail (atomic, zero landed).
- Recovery: `customer_groups` + `products` → success; 56 products, all on
  website 1.
- Reset of all 6 types → instance byte-identical to baseline
  (14 categories / 130 products / 3 websites).
