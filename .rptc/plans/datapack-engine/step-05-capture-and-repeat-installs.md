# Step 05: capture and repeat installs

Status: **built 2026-10-29, not yet committed or run live**, except the two parts left out
below. Specification of the service's export:
[export-spec.md](../../research/datapack-engine/export-spec.md).

Two ways an SC or an agent works, and the one design that serves both:

- **The pack changes and the store follows.** An agent writes a pack, installs it, looks, edits
  the pack, installs again. A repeat install updates what this engine made where its row changed,
  adds what is new, and removes what the pack no longer has, but only what this engine made.
- **The store changes and the pack follows.** An SC installs a pack, fixes things in the Admin,
  and makes that the pack. **Capture** reads back what the install record lists and saves it as a
  new version of the pack, in the library; the old version stays, so it can be undone.

## What it takes, kept to what those two need

1. **Every name-to-id lookup runs both ways.** Install turns names into this store's ids; capture
   turns ids back into names, so a captured pack installs anywhere. The service has the reverse of
   every lookup we need (`.rptc/research/datapack-engine/export-spec.md` §2); ours is written once per field, both directions.
2. **One fingerprint per object: its row in pack form, hashed.** Recorded when the object is
   written: from Commerce's answer where it carries the saved object, else one read (a new stock
   is answered with its id alone, seen live by the ERP warehouse step), and compared at the next install or capture. The pack's row changed: update it. The
   store's copy changed: someone edited it in the Admin. The same capture transform makes both
   fingerprints, so there is no second mechanism. (`updated_at` was considered and dropped: it
   exists on products and categories, not on attributes, sets, sources or stocks, live-checked
   2026-10-27, and a category's changes when a child is added under it.)
3. **An Admin edit is never overwritten silently** (rule 2, applied to a store). What happens
   instead is in "What an SC sees" below: each action does what the SC most likely meant, and
   says in one line what it kept.
4. **Capture takes what the record lists, plus what those objects need**: the categories, sets,
   attributes and options a captured product names, so the new version installs on an empty store.
   The service's export pulls in nothing a selection depends on (`.rptc/research/datapack-engine/export-spec.md` §4). Things an
   SC made by hand in the Admin are added by picking them, through the export item list that
   already exists; guessing which ones belong is left until someone needs it.
5. **SKUs are kept exactly.** The service's export lowercases every SKU and strips characters
   (`.rptc/research/datapack-engine/export-spec.md` §2), so a round trip makes different products. Ours does not.
6. **The root category is named, never guessed.** The service can only match it by name, and
   without one exports the store's root as an ordinary category.
7. **The agent can drive all of it:** dry run, install, "what would change", capture, remove, each
   answering with what it did and, when it stops, what to fix.

## What an SC sees (owner, 2026-10-27: as few choices as possible, anticipate the intent)

Who owns a thing decides what an undo does with a change made since. The ERP is transient by
design (owner, 2026-09-23): while connected it owns the fields it writes, and its next sync would
overwrite an Admin edit anyway. A pack and a setup-guide fix are the SC's starting point, and
their later edits are the SC's.

| Action | What it does | What the SC sees |
|---|---|---|
| Remove the ERP | Puts back everything the ERP wrote, edited since or not | One line in the result naming what had been edited ("Put back 1 price you had changed: VR Rack") |
| Undo a setup-guide step | Undoes the step, keeping any setting changed since | One line ("Kept Price scope, which you had changed since") |
| Install a pack again | Brings in the pack's changes, keeps the SC's own edits | One line ("Kept 2 things you had changed in the Admin") |
| Remove a pack, nothing changed | Removes what it made | The confirmation that exists today |
| Remove a pack, things changed | Removes what it made; first saves the changes to the demo's own pack, if the SC keeps the box ticked | The confirmation below |
| Save store changes to this pack | Makes the demo's own pack match the store; the previous version is kept | One sentence saying exactly that |

The confirmation when a removed pack holds the SC's changes:

> **Remove Bodea from this store?**
> You changed 3 things in it since it was installed: the category Critical Power, and 2 product
> prices.
>
> ☑ **Save my changes to the Acme Demo pack first**
> ☐ Always do this, and stop asking
>
> [Remove] [Cancel]

- The box starts ticked: keeping the work is the likely intent, and unticking is the one choice.
- "Always do this, and stop asking" (owner, 2026-10-27) turns on a user setting. After that, a
  removal that finds changes shows the ordinary confirmation with one line, "Your changes will be
  saved to the Acme Demo pack first", and the setting turns it back off. The setting is named when it
  is built, in `package.json`, its schema and its type together. The agent's removal tool follows
  it too: with it on, the tool saves without asking for a keep-or-drop answer.
- The changes go to the demo's own pack ([step 07](step-07-demo-packs.md)). If saving fails, nothing is removed and the
  screen says why.
- A container the pack made that now holds the SC's own things (a category with a product they
  added, say) is kept; removal takes out only what the pack put in, and says so. Emptying a
  store whoever made what is the wipe's job ([step 10](step-10-wipe.md)), with its own warning.
- No "capture", "baseline" or "version" on screen. The agent tools use the same actions and
  names; the removal tool reports the changes and needs a keep-or-drop answer, so an agent tells
  the user rather than guessing.

## Agent surface

Names are proposed; fixed when built.

| Tool | New or changed | Read or write | Chat wording | Dialog |
|---|---|---|---|---|
| `preview_datapack_changes` | new: what installing a pack again would update, add, remove and keep, by kind, with counts and names | read | "Checking what installing Frescopa would change" | none |
| `save_store_changes_to_pack` | new: the screen's "Save store changes to this pack" | write | "Saving the store's changes to the Acme Demo pack" | yes: makes the pack match the store; the previous version is kept. Names the pack |
| `start_datapack_import` | its answer says what it kept ("Kept 2 things you had changed") | write | unchanged | unchanged |
| `reset_datapack` | names the changes it found, and needs a keep-or-drop answer unless the "always" setting answers it | write | unchanged | unchanged, plus the changes |

**Lean answers:** `preview_datapack_changes` answers counts per kind and at most a few names per
kind, never rows; its ceiling is set from Frescopa and Bodea measured live. **Battery prompts:**
"I changed some prices in the Admin. Make that the Frescopa pack", expecting
`save_store_changes_to_pack`; "What would reinstalling Frescopa change?", expecting
`preview_datapack_changes`. Each traced, then `ai-coverage-scan`.

## Reuse

| Need | Reuse | Where it is |
|---|---|---|
| The removal confirmation with changes | The import window's existing removal view gains the list and the box, in place | `ImportDatapackModalBody`, view `confirm-reset` |
| The list of what changed | Labelled lines | `FactList` (a host bundle imports `fact-list.css`) |
| "Save my changes to the Acme Demo pack first", "Always do this, and stop asking" | The house checkbox row | `CheckboxRow` (`checkbox-row.css`) |
| "Always do this" as a setting | The same shape as the setting that answers a project delete for the SC | `demoBuilder.cleanupBehavior` (`deletionConfirmation.ts`) |
| The one line saying what was kept | The import window's result lines | `importResult.ts` |
| "Save store changes to this pack" | A button in the pack's flyout, beside the ones there | `DatapackDetailPanel`, as `SaveDatapackFileButton` and `RemoveFromLibraryButton` are |
| Its progress | The house progress window | `OperationProgressModal` |
| Writing the new version | One writer for every store | `writePackToStore` (`datapackTransfer.ts`) |
| The agent tools | Descriptor rows with confirmation gates | `mcp-tool-authoring` |

## Left out, and later

Left out on purpose: incremental export (each capture is a full version; packs are small, and a
full version installs on its own), and automatic suggestions of hand-made objects.

Later, recorded so they are not lost:
- **Images**, as an optional kind. Nothing carries them today: the service's export removes
  `media_gallery_entries`, keeps the file paths, and uploads nothing (`.rptc/research/datapack-engine/export-spec.md` §6). Open:
  how today's demo storefronts get their images, before packing any.
- **`product_export`** (Luma's only product form; Venia has both): Commerce's bulk import,
  `POST /V1/import/json`. The service sends `behavior: "import"`, not one of Commerce's own four;
  unverified on ACCS (`.rptc/research/datapack-engine/export-spec.md` §5).

## What was built (2026-10-29)

Everything above except what "Left out this run" names. Not yet run against a live store; the
live test is at the end of this section.

**Lookups both ways.** `productLookups.ts` holds each field's two directions side by side over
one read of the store: set name and id, category url key and id, attribute code and id, option
label and id, customer group code and id, SKU and product id. An id capture cannot name is kept,
as the service's export keeps it.

**Pack form and the fingerprint.** `packForm.ts` turns what the store holds back into pack rows
(ids named, this store's ids, timestamps, stock block, websites and images left out, SKUs kept
exactly) and names each row (`keyOf`: a SKU, a category's place under its root, a set's name).
`fingerprint.ts` hashes a row with the shared `sha256` after sorting its keys and its custom
attributes. `storeCopies.ts` reads the store's copy of each recorded object (products a page of
SKUs at a time) and lists a pack's rows by key.

**Two hashes per object, one rule** (a change from "one fingerprint" above). The install record
(`installRecord.ts`) now keeps, per object, its key, `fingerprint` (the store's copy, in pack form,
read back once the install ends, `recordFingerprints.ts`) and `wrote` (the pack row it was made
from). A pack row and a store answer never match field for field (Commerce adds a dozen
attributes of its own), so comparing them directly would update every object on every install.
Instead "edited since" compares the store with itself through the same transform, and "the pack
changed" compares the pack row with the row installed. Both go to `decideOwnedChange` unchanged;
`repeatInstall.ts` says how.

**Repeat install** (`repeatInstall.ts`, called from `installPack`). For the kinds the request
installs: an object whose pack row changed, still as it was left, is brought up to the pack
(products by `PUT products/{sku}` without the stock block, categories by `PUT categories/{id}`
leaving their place in the tree, sources by `PUT inventory/sources/{code}`, attributes by adding
the options they lack; sets, assignments, stocks and links have nothing to update but their
name). One the pack no longer has is taken out, after every kind is installed, newest kind
first, unless it is a category or set that holds something this engine did not make (the
container rule below). One the SC
changed is kept; one the SC deleted stays deleted and stays on the record, so the next install
leaves it too. A kind's install finds what this engine made by its key, so a category or set
renamed in the Admin is not made a second time. Objects recorded before keys and hashes were
kept are left alone once and hashed from then on. Quantities are set only for products not made
by an earlier finished install: a product's fingerprint leaves its stock out, so an SC's stock
change in the Admin could not be told from the pack's (a re-run after an install that stopped
part-way still sets them).

**The one line.** `keptLine` ("Kept 2 things you had changed in the Admin.") rides the job
(`engine.ts`), the job status, `watchImportJob`'s result and the job record (`note`), and shows
as the first detail line of the import window's result (`importResult.ts`) and in a
backgrounded install's notification. `start_datapack_import` itself answers as soon as the job
starts, as it always has, so an agent reads the line in `get_datapack_import_status`'s outcome;
the tool's description says so, and `preview_datapack_changes` gives the same line beforehand.

**What "what the record lists" means for capture and the preview** (owner, 2026-10-29): the
install record's objects, **and the installed version's own rows**, read back from the store by
the pack's own names: its SKUs, attribute codes and set names. So a pack installed onto a store
that already held some of its SKUs saves a version that still holds them, read from the store
with their SKUs exact; they are never added to the record (this engine did not make them). The
save reads the installed version from the store the flyout or the agent names, else the library,
else the Data Installer, and stops without saving when it can read neither. The preview counts
the same rows the same way: a row the store already has is `inStore` (installing leaves it as it
is; a save takes it in), not `add`. Told apart for products, attributes and sets; for the other
kinds a row with no record still counts under `add`.

**The container rule** (owner, 2026-10-29), one function (`decideRemovals`, `removers.ts`) for
whole-pack removal, reinstall and the preview: a category or attribute set this engine made is
kept while it holds anything the engine did not make or is not taking out in the same removal
(a category's children; a set's products). Decided up front, read-only, newest first, so a kept
child keeps its parent too. A kept container stays on the record, so a later removal takes it once
it is empty, and the result says so in one line: "Kept the set Racks: it holds 2 products you
added." Removal's line rides the job's `note`, as the reinstall line does; a reinstall that keeps
both says both.

**Capture** (`capture.ts`): what the record lists and what the installed version names, plus the
categories (and their parents) a captured product sits in, its set, its user-defined attributes with their options and their place
in each set named, its quantities and the sources they are held in. The store's Default set and
default source and Commerce's own attributes are left out. The root is read from each category's
own path: the install target's root gives paths starting with its name; a root the pack made is
written as `root_category`.

**Save store changes to this pack** (`storeChanges.ts`, `storeChangesHandlers.ts`): the captured
rows are written into the library as `<version>-saved-<YYYYMMDD-HHMM>` (UTC) through
`writePackToStore` without `update`, so the version installed is never written over. The install
record moves onto the new version, hashed afresh, and the project records it. If the library
refuses any kind, the record stays where it was and the answer says which kind and to delete the
partial version. The pack's flyout (`DatapackDetailPanel`) shows the button only for the pack the
project holds with Demo Builder's engine chosen; the catalog view hosts the house progress window
(`useSaveStoreChanges.ts`, `OperationProgressModal`), two stages in `core/utils/datapackStages.ts`,
ending on one sentence: "Bodea now matches this store. What it held before is kept." The view's
grid moved to `DatapackCatalogGrid.tsx` unchanged, so the view stays inside the size rule's
import limit.

**Agent surface.** `preview_datapack_changes` (read: per kind, counts of update, add, remove and
keep with at most three names each, `installed`, and the kept line) and
`save_store_changes_to_pack` (write, confirm-gated, consent copy names the pack). Both have a
narration phrase, are in the response-size classification, are listed as pending a live
measurement for their ceilings, have battery prompts (the two this plan names), are in the
generated catalog, and go through the real SDK in `realSdkRegistration.test.ts`, which now
registers the whole Data Installer table (it had registered none of it).

### Left out this run (owner-approved scope, 2026-10-29)

- **The removal confirmation's "Save my changes to the Acme Demo pack first" box, and "Always do
  this, and stop asking"** with its setting. Both save to the demo's own pack, which is step 07's.
  Removal today removes everything the record lists, as before, edited or not.
- **Images and `product_export`**, as "Later" above says.

### Open, found while building

- **Resolved 2026-10-29 (owner):** capture now reads the installed version's own rows (above),
  and whole-pack removal applies the container rule too.
- **Removing an attribute set may delete the products in it.** That is Magento's schema as
  remembered, not verified here; the container rule now keeps such a set in every removal path,
  but whether Commerce would have taken the products is still worth checking live before step 10.
- **Undoing a save** is deleting the new version from the library; the install record and the
  project stay on the new version. Reinstalling the old version afterwards treats every object as
  the store's own.
- **Shapes not captured live:** `GET categories/{id}` (its `children` and `path` fields), the
  product search's configurable fields, `GET customerGroups/{id}`, `GET products/attributes`
  searched by `attribute_id`. Typed to Magento's interfaces; the live test below reads them.

### Live test (owner's call; on `justrite_test_website`, never JustRite's own site)

1. Install a small library pack with the Demo Builder engine; confirm the record file under
   `.demo-builder/datapacks/` has `key`, `fingerprint` and `wrote` on every object.
2. In the Admin, change one product's price and rename one category the pack made.
3. `preview_datapack_changes`: expect `keep` 2 with those names, nothing else.
4. Edit the library pack: change another product's price, drop one product, add one.
   `preview_datapack_changes` again: update 1, remove 1, add 1, keep 2.
5. Install again. Expect the window's result to say "Kept 2 things you had changed in the
   Admin."; the edited price and the renamed category untouched; no second category; the dropped
   product gone; the new one there.
6. Press "Save store changes to this pack". Expect a new `-saved-` version in the library, the old
   one still there, the record file renamed to it, and a reinstall preview of all unchanged.
7. Before removing, add a product of your own to a category the pack made. Remove the pack: expect
   "Kept the category …: it holds 1 …" in the result, that category and your product still there,
   everything else the pack made gone, and the record file holding only that category.
8. Take your product out of the category, remove the pack again (it finishes), and delete the
   saved version from the library. The store is back to before step 1.
9. Separately, install a pack onto a store that already has one of its SKUs, save store changes,
   and check the saved version still holds that SKU, spelled as the store spells it.
