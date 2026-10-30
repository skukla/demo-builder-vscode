---
name: import-datapack
description: Loads sample data (products, categories, customers, B2B companies) into a project's Commerce instance from a datapack, removes it again, or captures data back out into a pack. Use when a demo needs catalog data, when the storefront renders but has nothing in it, or when the user asks to seed, populate, install, reset or export sample data. Six ordered calls with three traps — read this before calling any of them.
---

# Import a Datapack

A datapack is a named bundle of Commerce data — products, categories, customers, B2B
companies, shared catalogs. Importing one writes into a **live Commerce instance**, so
the order below is not a suggestion.

## The sequence

```
find_datapacks                  → which packs exist
get_datapack_import_target      → WHICH INSTANCE this project implies
list_datapack_import_scopes     → optional: narrow to a website / store view
validate_datapack_import        → dry run; free, ungated, do it every time
start_datapack_import           → confirm:true; returns a HANDLE, not a result
get_datapack_import_status      → poll until outcome is not "watching"
```

## Trap 1 — the start call does not mean it worked

`start_datapack_import` returns as soon as the job is accepted:

```json
{"activationId": "..."}
```

That is a receipt, not an outcome. A fourteen-type pack takes minutes. **Poll
`get_datapack_import_status`** until `outcome` is something other than `watching`:

| `outcome` | Meaning |
|---|---|
| `watching` | still running — poll again |
| `success` | done; `perType` says what landed |
| `unwatchable` | the watch was lost, NOT the import failed. `reason` says why. The job may well have finished — say so rather than reporting a failure |

Reporting success from the start call is the single most likely mistake here, and it is
invisible: the user sees a confident "imported" and an empty catalog.

## Trap 2 — never guess `commerceInstance`

It is required and deliberately not defaulted. From the handler that refuses it:

> Required, and deliberately NOT defaulted from the project: an import writes into
> whatever instance this names, and a wrong default writes sample data into someone
> else's live demo.

`get_datapack_import_target` reports the instance this project implies, plus the project
name so you can confirm it with the user. If it returns nothing, ask — do not infer one
from anything else you can see.

### The website and store view default to the project's, not the service's

`websiteCode` and `storeCode` are optional, and omitting them is safe: the import lands
on the scope the project recorded, which `get_datapack_import_target` also reports.

That was not always true. Omitting them used to mean the SERVICE's own `base`/`default`
— so an import, or worse a **reset**, could run against a website nobody chose. Send both
to override deliberately, or neither to inherit. Never send one: half a pair is refused
rather than completed.

## Trap 3 — validate first, every time

`validate_datapack_import` sends the same guard, the same credentials and the same
request body as a real start, and stops. It is **ungated on purpose** so there is never a
reason to skip it.

A refusal comes back as a verdict, not an error:

```json
{"valid": false, "reason": "..."}
```

`success: true` with `valid: false` means the call worked and the answer is no. Read the
reason to the user rather than retrying.

## Arguments that are required and look optional

All four, on every write call:

- `datapackName` — from `find_datapacks`
- `version` — e.g. `main`. There is **no "latest"**; omitting it fails
- `commerceInstance` — see trap 2
- `dataTypes` — at least one, from `list_datapack_data_types`. Omitting it does not mean
  "all"; it fails

## Removing data — scoped, not a wipe

`reset_datapack` is **import in reverse**: it walks the datapack's own data files and
deletes those entities. It removes what the pack knows about and nothing else — it is not
an instance wipe, and data that arrived some other way is untouched.

It is confirm-gated and **cannot be undone** — the service has no undo — but "cannot be
undone" and "unbounded" are different claims, and only the first is true here. Say the
scope when you ask the user, rather than implying the instance is at risk.

Like an import it returns a handle and is polled, and **the service supplies its own
dependency ordering for the delete** — a different order from import, over the same data
types. You do not have to reason about what to remove first.

## Saving the store into a pack (Demo Builder's engine, the default)

`save_store_changes_to_pack` saves the project's store into a NEW version of this demo's own
pack in the datapack library: the pack Demo Builder installed here, plus anything you pick in
`selections`. With no pack named it uses the project's own when Demo Builder installed it, else
it saves only what is picked, which is how a store built by hand in the Admin becomes a pack.
`start_datapack_export` is the same save with this engine: send only `selections` and `confirm`.

- **Pick with `list_datapack_export_items`** (`dataType`: products, giftcards, categories,
  cart_rules, customers, b2b_companies, customer_groups, b2b_shared_catalogs,
  product_attributes, attribute_sets). It leaves off what the pack being saved already holds
  (`inPackCount`), so what is left is what someone added by hand. Each item's `id` goes into
  `selections` as `{kind: {field: [ids]}}`: products and gift cards by `sku`, cart rules by
  `rule_id`, attributes by `attribute_code`, attribute sets by `attribute_set_id`, the rest by `id`.
- **A pick brings what it needs**: a product its categories, set, attributes and quantities; a
  cart rule its typed-in coupons; a company its admin. You do not pick those separately.
- **Read the answer's message to the user.** It says what the store has that the version left
  out (`leftOut`) and any id kept because the store could not name it (`unnamed`). A version
  the install would refuse is not saved, and the message says which kind and why.
- Undo is `delete_library_datapack` on the new version. Nothing in Commerce changes, and a
  picked thing is never removed when the pack is.

## Exporting (the service's engine)

With `demoBuilder.dataInstaller.engine` set to `service`, `start_datapack_export` captures data
from an instance INTO a datapack. It writes to a catalog **other teams depend on**, so it needs
`confirm: true` and `confirmName` equal to the datapack name — the same bar as deleting a repo,
for the same reason: the risk is not to your own work.

Use `list_datapack_export_items` first to see what would be captured. It is paged;
`totalCount` tells you how many exist beyond the page.

### Export is the one operation you must order yourself

Import and reset are ordered BY THE SERVICE. Export is not. You can export data types
individually, and if you do, **you own the dependencies** — attributes before products,
and so on down the chain.

`list_datapack_data_types` returns the types for an operation mode **already in dependency
order**. Ask it with `operationMode: "export"` and keep the order it gives you. The import
and export sets genuinely differ, so do not reuse an order you got for another mode.

Re-exporting a data type **rewrites the previous one** in the pack rather than appending or
duplicating. So a wrong-order export is fixable by re-exporting in the right order — it is
the one mistake in this skill that does not require starting over.

## What the INSTANCE needs, which the import cannot check

Three limitations live on the Commerce instance rather than in the datapack. None
is detectable from here, so raise them with the user when they apply rather than
waiting for the symptom.

- **B2B data needs B2B features enabled**, in the Commerce Admin. Without it the
  B2B types fail. There is no API that reports whether they are on, so if the
  pack contains `b2b_*` types, ask.
- **A non-default website or store view must already exist** on the instance
  before data can be imported into it. Nothing can create one from here.
  `list_datapack_import_scopes` reports what exists, so a scope missing from that
  list is a Commerce Admin task, not a bad argument.
- **Customer segments are not supported.** A cart rule that references one still
  imports, and is silently non-functional until someone fixes it in the Admin.
  If the pack has `cart_rules` or `coupons`, say so — nothing will report it
  later.

And one that only bites AFTER a successful import: **a pack's own root category.**
A store shows only the categories under its root, and no API can change a store's
root (the store routes are read-only). With Demo Builder's engine:

- **The store's root is its own** (no other store shows it): the pack's
  categories go straight under it, and the install's note says so. Nothing to do.
- **The root is shared with another store**: the pack keeps its own root, and the
  install pauses to ask the SC to set it in the Admin (Stores > All Stores > the
  store > Root Category). "Skip for now" finishes the install with that step left
  open; the note (`get_datapack_import_status`) names the store and the value, and
  `preview_datapack_changes` says it beforehand (`root`). Pass the step to the
  user word for word: you cannot do it. Running `start_datapack_import` again
  re-checks it (nothing else is rewritten) and marks it done once it is set.

With the service engine, the root is never attached: the storefront reads empty
until someone sets it by hand. `diagnose-demo` carries the full symptom, including
why `GET /V1/categories` hides it. On an Edge Delivery storefront, `republish`
rebuilds the catalog menu once the categories show.

## If the Data Installer is not there at all

Check `get_settings`. `demoBuilder.dataInstaller.enabled` and
`demoBuilder.dataInstaller.apiBaseUrl` are functional gates — with either unset the whole
surface is absent, which looks like a broken service rather than an unconfigured one. The
URL reports as `{configured: true|false}` rather than its value.
