> **Archived 2026-08-18.** Verified on `develop`: the `website_code` / `store_code` pair is sent
> from `dataInstallerWriteClient.ts` (`targetFields`), with `08382431` (*seed the import scope
> from the project, not from `base`*) and `e2716d81` (*an omitted import scope falls back to the
> project's*) on top. The `d3585249` / `c2b01651` hashes in the header are pre-rebase and resolve
> to nothing; the behaviour is what confirms this shipped.

# Datapack Import Targeting — website/store picker + dependency guardrails

**Status**: SHIPPED 2026-08-14 (commits d3585249 client+handler, c2b01651 UI)
**Parent**: data-installer DoD item 3b — split out as its own feat per the user,
2026-08-14. The branch does not land without it.

## Why

The Data Installer rewrites every pack `website_ids` with the session website
(`replaceWebsiteIdsWithSession()`), driven by optional request params
`website_code` + `store_code` (validated as a pair against the instance;
default `base`/`default`). Before this feat, `buildBody` sent neither, so every
import landed on `base` with no say from the user. Proven live: a bodea import
with `website_ids: [3]` throughout put all 56 products on website 1.

The same run surfaced a second UX gap this feat owns: `products` imports
atomically and fails entirely when tier prices name a customer group that
`customer_groups` would have created — a cross-type dependency the type
checkboxes let users walk into and validate cannot catch.

## The intended workflow, from the service author

Asked directly, 2026-08-14, what happens when a pack's hardcoded website
ids have no corresponding website: *"Yes before import. Then you can specify
site and store on the data pack import. It will validate to make sure they
exist."*

That settles the design question this feat existed to answer. **Targeting is the
intended path; landing on `base` is the skip-the-targeting fallback.** The
website and store are a PRECONDITION the user satisfies in Commerce Admin before
importing — `websites` is not an importable type, so the extension cannot create
it and must not pretend otherwise. The UI's job is to state the precondition,
offer what exists, and get out of the way.

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
- **Say the precondition where it's needed.** A user importing a
  brand-package pack (Bodea onto its own website) has to create that website in
  Commerce Admin FIRST. The picker lists only what exists, so the failure mode
  is "the website I want isn't in the list" — which needs a one-line hint
  naming the Admin step, not a silent empty dropdown. Do NOT offer to create
  the website: no importable type, not our job.
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

---

## What shipped

- `ImportRequest.target` + `buildBody` emits `website_code`/`store_code` — or
  omits both keys entirely, since absent means "the service default" while `""`
  is a value it would validate. Carried onto delete too, so a reset matches its
  import.
- Handler refuses a half pair up front (the service rejects it in the worker,
  minutes after the 202 that said the import started).
- `list-datapack-import-scopes` runs discovery EXTENSION-SIDE and returns codes
  only — the wizard's `useStoreDiscovery` posts admin credentials from the
  webview, and this feature keeps the pair out of the panel.
- Two cascading pickers, hidden when nothing was discovered, with the
  precondition named underneath ("create it in Commerce first, then choose it").
- The products/customer_groups warning from the live run.
- `useImportScopes` extracted when the modal hit the complexity ceiling; 469
  feature tests passed unmoved, which is what makes it a refactor.

**Not done, deliberately**: no live re-verification of a TARGETED import. The
substitution is proven and the pair is documented + validated by the service,
but nothing has yet run an import with the pair actually set. That is one run
against a Commerce instance with a second website, and it belongs to whoever
next has one.
