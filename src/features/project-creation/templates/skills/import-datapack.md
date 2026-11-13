---
name: import-datapack
description: Installs a datapack (products, categories, customers, B2B companies) into a project's Commerce instance, switches, restores or uninstalls it, saves Commerce back into a datapack, and clears demo data. Use when a demo needs catalog data, when the storefront renders but has nothing in it, or when the user asks to install, switch, restore, uninstall, save, undo a save or clear sample data. Seven ordered calls with three traps — read this before calling any of them.
---

# Install a Datapack

A datapack is a named bundle of Commerce data — products, categories, customers, B2B
companies, shared catalogs. Installing one writes into a **live Commerce instance**, so
the order below is not a suggestion.

## The sequence

```
find_datapacks                  → which packs exist
get_datapack_import_target      → WHICH INSTANCE this project implies
list_datapack_import_scopes     → optional: narrow to a website / store view
validate_datapack_import        → dry run; free, ungated, do it every time
preview_datapack_changes        → when the pack is installed already: what installing again changes
start_datapack_import           → confirm:true; returns a HANDLE, not a result
get_datapack_import_status      → poll until outcome is not "watching"; read its check
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
| `unwatchable` | the watch was lost, NOT the install failed. `reason` says why. The job may well have finished — say so rather than reporting a failure |

Reporting success from the start call is the single most likely mistake here, and it is
invisible: the user sees a confident "installed" and an empty catalog.

`success` itself says only that Commerce took the rows, not that they came out right. An
install that wrote products ends with `check`: the store checked against the pack.
`check.verdict: "differs"` names products that are missing, configurables with no options,
and select values or prices that are not what the pack says. Report those to the user rather
than calling the install clean. `verify_datapack_install` (a read) runs the same check later,
for example after products were edited by hand.

## Installing a pack again

When `get_datapack_import_target` or `list_installed_datapacks` shows the pack is already
installed, **call `preview_datapack_changes` before `start_datapack_import`**. It reads only, and
says by data type what installing again would update, add, remove, or keep because it was changed
in the Admin. Show the user what it would remove: removing things can blank product values with
them, and it cannot be undone.

If the same version is installed again and its contents have not changed, the preview should
show nothing to update, add or remove. If it shows any, stop and tell the user rather than
installing: it means Demo Builder has lost track of what it made. That check is only for the same,
unchanged version. A Demo Builder datapack updated in place since it was installed, or another version, is
expected to change things: show the user the preview and go on. Afterwards the note says what was
taken out ("Took out 3 items the pack no longer has: …"), and `check.leftOut` counts products the
check skipped because they were kept; `verify_datapack_install` checks every product.

## Putting the store back: restore_datapack

To throw away what the user changed in Commerce and put the datapack back as it was last saved,
use `restore_datapack`, not `start_datapack_import` (installing the same version again updates in
place and keeps Admin edits). It checks first: when nothing has changed it answers up to date and
does nothing; otherwise it uninstalls the datapack and installs its latest save in one job. It asks
the user first, since anything changed since the last save is lost.

## Switching to another pack, or another version

When the project uses a pack Demo Builder installed and you install **another pack** (a switch, the
screen's Switch) **or another version of it**, `start_datapack_import` uninstalls the pack in use
first: its data is removed in the same job, the way `reset_datapack` removes it, then the new one
installs. Tell the user that before you start.

- Changes the user made to the old pack since it was installed are saved into their own pack first,
  without asking. When the old pack is not theirs (a Demo Builder datapack, a colleague's), the call installs
  nothing and answers `CHANGES_NEED_ANSWER` with the changes in a sentence. Ask the user, then call
  again with `changes: "keep"` and `saveAs` (a new pack of theirs; ask them for the name) or
  `changes: "drop"` (lost).
- An uninstall that fails installs nothing: the status's `stoppedAt` is `replacing`, its `reason`
  says why, and the project still names the old pack.
- Once the old pack is gone the project names the new one, and `reset_datapack` removes the new one.

Installing the same version again uninstalls nothing: it updates in place, as above.

## A failed install, and Retry

When the install of the project's datapack at creation did not succeed, `get_datapack_import_target`
answers `installFailed` with the `reason` and how many `retries` were made. The screen shows the card
with a red dot and offers Retry. Retry is `start_datapack_import` with the same datapack, version and
scope; read the reason to the user first, since a cause in the pack or the instance fails again.
After two failed retries the screen offers Fix with AI instead: find the cause before a third try.
An install that succeeds clears the record.

## Trap 2 — never guess `commerceInstance`

It is required and deliberately not defaulted. From the handler that refuses it:

> Required, and deliberately NOT defaulted from the project: an install writes into
> whatever instance this names, and a wrong default writes sample data into someone
> else's live demo.

`get_datapack_import_target` reports the instance this project implies, plus the project
name so you can confirm it with the user. If it returns nothing, ask — do not infer one
from anything else you can see.

### The website and store view default to the project's, not the service's

`websiteCode` and `storeCode` are optional, and omitting them is safe: the install lands
on the scope the project recorded, which `get_datapack_import_target` also reports.

That was not always true. Omitting them used to mean the SERVICE's own `base`/`default`
— so an install, or worse a **reset**, could run against a website nobody chose. Send both
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

The check also reads the pack's rows, every kind's, and names each kind whose rows Commerce could not take; the real install checks the
same before its first write. Once writing, a row Commerce refuses is skipped and the rest go
in: the status's `note` starts "Skipped N rows" and names each row with Commerce's reason,
and any row that needed a skipped one (a product in a skipped category) is skipped with it,
by name. Every kind still reads `success`, so read the note. Sign-in, throttling, a Commerce
error or no answer at all still stop the install; running it again carries on, and anything
the store did make without answering is found then and counted as the pack's.

## Arguments that are required and look optional

All four, on every write call:

- `datapackName` — from `find_datapacks`
- `version` — e.g. `main`. There is **no "latest"**; omitting it fails
- `commerceInstance` — see trap 2
- `dataTypes` — at least one, from `list_datapack_data_types`. Omitting it does not mean
  "all"; it fails. An install writes only these and what they need, and leaves the rest of the
  pack alone: not installed, not removed. `reset_datapack` is the one exception: it ignores
  them, as the next section says

## Removing data — scoped, not a wipe

`reset_datapack` is **install in reverse**: it takes back what the install made. It removes
what the pack put there and nothing else — it is not an instance wipe, and data that arrived
some other way is untouched.

It is confirm-gated and **cannot be undone**, but "cannot be undone" and "unbounded" are
different claims, and only the first is true here. Say the scope when you ask the user,
rather than implying the instance is at risk.

Removal takes back everything the project's install record lists and nothing else, whichever
`dataTypes` you send, so say that to the user rather than naming the kinds you sent. A pack
Demo Builder never installed in this project (the Data Installer service installed it, or
another project did) is refused and nothing is removed by name; to clear what that install
left, use `check_demo_data` and then `clear_demo_data` (the screen's "Clear Demo Data").
`clear_demo_data` uninstalls the project's datapack first, asking the save question below, then
clears every website the project uses; a save or uninstall that fails clears nothing. To clear
whole websites of the instance, whoever put the data there (the screen's "Clear Commerce
Instance"), call `check_demo_data` with `websites: []` to see the websites and the projects using
each, then with the chosen website codes for the list, show the user that list and which projects
lose their data, and call `clear_commerce_instance` with its token and `understood: true` once they
agree. It uninstalls each listed project's datapack first: answer each project's changes by its
path (`changes` keep with a `saveAs` name, or drop) when it answers `CHANGES_NEED_ANSWER`. It cannot
be undone, except the datapacks.

Like an install it returns a handle and is polled. Demo Builder removes in the reverse of the
install's order, so you do not have to reason about what to remove first.

## The save question

Uninstall, Switch, Clear Demo Data, Clear Commerce Instance, and a project's reset or delete with
Uninstall Datapack all take the datapack out of Commerce. Changes the user made in it since it was
installed are saved into their own datapack first, without asking. When the datapack is not theirs,
the call changes nothing and answers `CHANGES_NEED_ANSWER` with the changes in a sentence. Ask the
user, then call again with one of:

- `changes: "keep"` and `saveAs` (a name the user gives): saved as a new datapack of theirs;
- `changes: "drop"`: lost (in the user's own datapack too).

## Saving the store into a pack

`save_store_changes_to_pack` saves the project's store into My Datapacks, as Save or
Save As New: everything the demo uses, with nothing to pick. That is the pack Demo Builder installed
here as the store holds it now, and whatever of the demo's the pack does not hold yet (what someone
added in the Admin), never another demo's on a shared instance.

- **Save** (no `saveAs`): the NEW latest save of the pack the project uses, only when that pack is
  the user's own. Two saves are kept: the save before it stays, for `undo_last_save`; older saves are deleted. When it is not (a Demo Builder datapack such as Bodea, or a colleague's), nothing is written and
  the answer carries `data.needsName`.
- **Save As New** (`saveAs: { displayName }`): a NEW pack of the user's, under the name they give.
  Ask the user for the name; do not make one up.

Either way the project then uses the new save: it installs from it and resets to it. With no
pack named it saves only what is picked, which is how a store built by hand in the Admin becomes
a pack (send `saveAs`; the screen's Create). `start_datapack_export` is the same save: send
`selections`, `saveAs` and `confirm`. Every save goes into My Datapacks, never into the Data
Installer. A name the user already has for one of their own datapacks is refused: ask for
another.

- **From a pack, pick nothing**: the save takes everything the demo uses, and `selections` with
  a pack is refused.
- **With no pack, pick everything** with `list_datapack_export_items` (`dataType`: products,
  giftcards, categories, cart_rules, customers, b2b_companies, customer_groups,
  b2b_shared_catalogs, product_attributes, attribute_sets).
- Each item's `id` goes into `selections` as `{kind: {field: [ids]}}`: products and gift cards by
  `sku`, cart rules by `rule_id`, attributes by `attribute_code`, attribute sets by
  `attribute_set_id`, the rest by `id`.
- **A pick brings what it needs**: a product its categories, set, attributes and quantities; a
  cart rule its typed-in coupons; a company its admin. You do not pick those separately.
- **Read the answer's message to the user.** With no pack, it says what the store has that the
  version left out (`leftOut`); always, any id kept because the store could not name it (`unnamed`). A version
  the install would refuse is not saved, and the message says which kind and why.
- Undo is `undo_last_save`: Commerce goes back to the save before, and the newest save is deleted
  once that install succeeds. It asks the user first, since anything changed since is lost. A
  picked thing is never removed when the pack is.

## ACO packs

**ACO packs** (Adobe Commerce Optimizer) come with ACO support, in a later release:
`start_datapack_export` refuses `aco: true` until then. Say so if the user asks for one.

## The Datapacks screen's words, and the tool for each

| The screen says | The tool |
|---|---|
| Install, Switch to | `start_datapack_import` |
| Uninstall | `reset_datapack` |
| Restore | `restore_datapack` |
| Save, Save As New, Create | `save_store_changes_to_pack` |
| Undo Last Save | `undo_last_save` |
| Clear Demo Data | `check_demo_data`, then `clear_demo_data` |
| Clear Commerce Instance | `check_demo_data` with website codes, then `clear_commerce_instance` |
| Save as File | `save_datapack_zip` |
| Add from File (Install from File is this, then Install) | `open_datapack_zip`, then `load_datapack_zip` |
| Share, Stop Sharing | `share_datapack` |
| Delete | `delete_library_datapack` (a datapack of saves: `everyVersion: true`, as the screen does) |

Use the screen's words with the user: Install, not import; Uninstall, not reset; Save, not export.
Datapacks Demo Builder publishes are "Demo Builder datapacks". An agent cannot put a datapack into the
Data Installer: `load_datapack_zip` adds a file to My Datapacks only. Every write above asks the user
first.

## What the INSTANCE needs, which the install cannot check

Three limitations live on the Commerce instance rather than in the datapack. None
is detectable from here, so raise them with the user when they apply rather than
waiting for the symptom.

- **B2B data needs B2B features enabled**, in the Commerce Admin. Without it the
  B2B types fail. There is no API that reports whether they are on, so if the
  pack contains `b2b_*` types, ask.
- **A non-default website or store view must already exist** on the instance
  before data can be installed into it. Nothing can create one from here.
  `list_datapack_import_scopes` reports what exists, so a scope missing from that
  list is a Commerce Admin task, not a bad argument.
- **Customer segments are not supported.** A cart rule that references one still
  installs, and is silently non-functional until someone fixes it in the Admin.
  If the pack has `cart_rules` or `coupons`, say so — nothing will report it
  later.

And one that only bites AFTER a successful install: **a pack's own root category.**
A store shows only the categories under its root, and no API can change a store's
root (the store routes are read-only):

- **The store's root is its own** (no other store shows it): the pack's
  categories go straight under it, and the install's note says so. Nothing to do.
- **The root is shared with another store**: the pack keeps its own root, and the
  install pauses to ask the SC to set it in the Admin (Stores > All Stores > the
  store > Root Category). "Skip for now" finishes the install with that step left
  open; the note (`get_datapack_import_status`) names the store and the value, and
  `preview_datapack_changes` says it beforehand (`root`). Pass the step to the
  user word for word: you cannot do it. Running `start_datapack_import` again
  re-checks it (nothing else is rewritten) and marks it done once it is set.

`diagnose-demo` carries the full symptom, including why `GET /V1/categories` hides it. On an Edge Delivery storefront, `republish`
rebuilds the catalog menu once the categories show.

## If a pack from the Data Installer is not listed

Datapacks come from Demo Builder's datapack store first, and that needs no setup. The Data Installer
is an extra: `find_datapacks` adds its packs only when `demoBuilder.dataInstaller.apiBaseUrl` is set,
`demoBuilder.dataInstaller.enabled` is on, and it answers this person's Adobe sign-in, and says why not
in `installerMissing`: `no-address` (not set up), `turned-off` (the person turned it off), `no-access` (it turned this Adobe account away; an admin of the Adobe org can add them to the
Data Installer's product profile, which nothing in Demo Builder can do) or `no-answer` (down; try again
later). `includeInstaller: false` leaves it out on purpose, and the answer says `installerOff`. The URL
reports as `{configured: true|false}` rather than its value.