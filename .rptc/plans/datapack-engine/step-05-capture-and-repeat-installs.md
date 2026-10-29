# Step 05: capture and repeat installs

Status: **to do**, after step 04 (owner, 2026-10-27). Specification of the service's export:
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
