# Demo Builder installs datapacks itself, beside the service — plan (2026-10-27)

Supersedes the "install" half of `.rptc/plans/datapack-primary/` (on `feature/datapack-zip`),
which proposed the same direction and left it undecided. Decided by the owner today.

## Why

The Data Installer service is not something we can rely on (owner, 2026-10-27). In one day:
its old address went dark (404); its new Production deployment cannot reach its own database;
its new Stage deployment needs an org header we did not send (fixed in beta.150/151); and a
commit that morning ("remove the postman backward compatibility params") made it ignore the
Commerce credentials callers send, so every dry run and import now fails with "Pre-flight
check failed for all configured site types (accs, local)". Reading still works: the catalog,
every pack, every item.

## The shape (owner, 2026-10-27)

- **Two engines behind the same buttons.** Dry run, install and remove look and work the same
  for the SC, from the screen, the wizard's creation step and the agent tools. Underneath:
  the **Demo Builder engine** (new: writes the pack into Commerce over REST from the
  extension) and the **service engine** (what exists today, unchanged).
- **One setting picks the engine.** `demoBuilder.dataInstaller.engine`: `demo-builder` or
  `service`. If the service is fixed, switching back is a setting change.
- **Our engine installs a pack from wherever the screen lists it** (owner, 2026-10-27): the
  service's catalog, the datapack library, or a datapack zip file. It needs only the pack's rows,
  so a library pack is installed straight from the library, with no copy into the service's
  catalog first. That copy ("Copy to the Data Installer", `copy_library_datapack_to_installer`)
  is kept only for the service engine, which can install nothing else; it cannot be undone from
  the extension and has never run live. Store-settings packs (step 5) depend on this, since the
  service's catalog will most likely refuse that kind. The library and zip files came in by
  merging `feature/datapack-zip` into this branch.
- **Each installed pack records which engine installed it, and removal always goes through
  that engine.** Each engine knows exactly what it wrote; nothing either creates is ever
  removed by the other, and nothing is stranded (rule 1: whatever can be done can be undone).
- **Our engine's record of what it created lives beside the project**, not in the manifest:
  one file per installed pack, listing every Commerce object it created by kind and id. The
  manifest's `datapack` gains `engine`.

## What is reused, and what is not (owner, 2026-10-01 rule, reaffirmed today)

Reused: all the DATA (read from their catalog), all of their KNOWLEDGE (we read their
processors as the specification: order, endpoints, request shapes, transforms, the quirks
they hit, how they remove), and our own parts (Commerce REST writes from the ERP work, the
progress window, agent tools, the datapack library and zip files). Not reused: their code.
Ours is written from scratch, tested, and checked live.

## What a pack holds (measured 2026-10-27, read-only, Stage)

42 packs; 25 data kinds. Catalog kinds are the common ones (categories 30 packs, product
attributes 29, attribute assignments 29, products 28, stock links and source items 25,
attribute sets 22). Customers 12, cart rules 11, coupons 9, ACO kinds 8, customer groups 6,
B2B kinds 4, stocks and sources 4, gift cards 2. Bodea `main` (ACCS) holds 14 kinds, about
100 items in all: 56 products, 7 attributes, 4 attribute sets, 6 customers, 3 companies.

## Steps

1. **The engine seam, no behaviour change.** A `DatapackEngine` interface over what the write
   side does today: check credentials, dry run, start install, start remove, follow the job,
   list installed. The service engine wraps today's clients exactly. Every caller (Data
   Installer screen, wizard creation install, project reset removal, agent tools) goes through
   the seam. The setting exists, defaulting to `service`. The record gains `engine`. Proved by
   today's tests passing unchanged.
2. **Our catalog engine.** Product attributes, attribute sets, attribute assignments,
   categories, products, sources, stocks, stock links, source items — install, dry run and
   remove, from the specification read off their processors. Each writes, then records what
   it created; remove takes away exactly that, in reverse order. Dry run lists what install
   would create and writes nothing. Unit tests from captured Commerce answers, then live on a
   throwaway ACCS store (never Justrite or a colleague's), on the owner's go.
   **Built 2026-10-27, not yet wired:** the install record and every catalog kind's install and
   removal (`services/demoBuilderEngine/`). Next in this step: run the kinds in order against a
   target, remove from the record, the dry run, and the engine setting.
2b. **Packs and stores stay in step, both ways** (owner, 2026-10-27). See "Repeat installs and
   capture" below, with each demo's own pack and sharing by reference. Comes before customers and
   B2B, because it shapes how every kind is written. In order: the shared "still as we left it?"
   rule; capture and repeat installs; the setup-guide undos (AB-83); each demo's own pack; sharing
   by reference.
3. **Our engine becomes the default.** A test-plan row for each of dry run, install and remove.
4. **Customers and B2B** (customer groups, customers, companies, shared catalogs and their
   assignments). Completes Bodea.
5. **Store settings in a pack** (owner's ask, 2026-10-27). A new kind, `store_config`: rows of
   `{path, value, scope, scope_code}`. Install reads and records each setting's current value,
   then writes the new one through `PUT /V1/system/config` (the writer the setup guide's config
   steps already use; ACCS since 2026-09, proven live 2026-10-10), and reads the response's
   `errors`, since a 200 can carry refused items. Remove restores the recorded values. Scope
   codes are mapped to the install target's website and store. Export reads a chosen list of
   paths back out of a store. Limit: packs that carry it live in OUR library and zip files;
   the service's catalog checks each kind against its own list and will most likely refuse an
   unknown one.
6. **Later, when a pack needs it:** cart rules, coupons, gift cards, ACO.

## Repeat installs and capture (owner, 2026-10-27)

Two ways an SC or an agent works, and the one design that serves both:

- **The pack changes and the store follows.** An agent writes a pack, installs it, looks, edits
  the pack, installs again. A repeat install updates what this engine made where its row changed,
  adds what is new, and removes what the pack no longer has, but only what this engine made.
- **The store changes and the pack follows.** An SC installs a pack, fixes things in the Admin,
  and makes that the pack. **Capture** reads back what the install record lists and saves it as a
  new version of the pack, in the library; the old version stays, so it can be undone.

What it takes, kept to what those two need:

0. **One rule for "is this still as we left it?", shared, built first** (owner, 2026-10-27). It is
   already written twice: `generatedFileWriter.ts` (ADR-013, files in a project) and
   `ownedPages.ts` (DA.live category pages, hashed from a read after the write). Commerce objects
   are the third, so the rule becomes one pure function: given what was recorded, what is there
   now and what is wanted, answer create, update, leave (changed by someone else), remove, or
   leave (not provably ours). The rule only answers "still as we left it, or changed?"; each
   caller decides what to do with a change (see "What an SC sees" below). It lives in
   `src/core/utils/` (owner, 2026-10-27), since four features use it. Each caller keeps its own
   read and write. The two existing copies
   move onto it with their tests unchanged, which is the proof nothing moved. The sha-256 helper,
   written three times (`generatedFileWriter.ts`, `ownedPages.ts`, `envFileWatcherService.ts`),
   becomes one. The setup guide's and the ERP's undos use it too, on this branch and in an ERP
   repo PR (AB-83, owner 2026-10-27).
1. **Every name-to-id lookup runs both ways.** Install turns names into this store's ids; capture
   turns ids back into names, so a captured pack installs anywhere. The service has the reverse of
   every lookup we need (`export-spec.md` §2); ours is written once per field, both directions.
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
   The service's export pulls in nothing a selection depends on (`export-spec.md` §4). Things an
   SC made by hand in the Admin are added by picking them, through the export item list that
   already exists; guessing which ones belong is left until someone needs it.
5. **SKUs are kept exactly.** The service's export lowercases every SKU and strips characters
   (`export-spec.md` §2), so a round trip makes different products. Ours does not.
6. **The root category is named, never guessed.** The service can only match it by name, and
   without one exports the store's root as an ordinary category.
7. **The agent can drive all of it:** dry run, install, "what would change", capture, remove, each
   answering with what it did and, when it stops, what to fix.

### What an SC sees (owner, 2026-10-27: as few choices as possible, anticipate the intent)

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
- The changes go to the demo's own pack (below). If saving fails, nothing is removed and the
  screen says why.
- A container the pack made that now holds the SC's own things (a category with a product they
  added, say) is kept; removal takes out only what the pack put in, and says so. Emptying a
  store whoever made what is the wipe's job ("Wiping a store completely"), with its own warning.
- No "capture", "baseline" or "version" on screen. The agent tools use the same actions and
  names; the removal tool reports the changes and needs a keep-or-drop answer, so an agent tells
  the user rather than guessing.

### Each demo has its own pack (owner, 2026-10-27)

A shared library pack (Bodea) is a template. A demo built from it gets its own pack, and every
save from that demo goes there, so one SC's customer edits never change the team's Bodea. The
team's pack changes only on purpose, through "promote" (making a pack shared), which stays a
curator's action.

| Moment | What happens |
|---|---|
| Creating a project | Nothing new: no step, no choice, no write. The Datapacks step shows one line: "Your changes to this data are kept in this demo's own pack." |
| First save (on purpose, or on removal) | The demo's pack is made then, so a demo with no edits never has one. A notice: "Saved to the Acme Demo pack." |
| Naming | It takes the project's name, and follows a project rename until the SC renames the pack themselves. Renamed from the pack's card |
| Each later save | A new version of the demo's pack. Reinstalling uses the newest; older ones stay listed in the pack's flyout |
| Where it is managed | The Data Installer screen's catalog, which already lists Library and Yours packs with a flyout each: the flyout gains Rename and Delete (and Make shared, for curators). The project dashboard shows one line, "This demo's pack: Acme Demo", linking to it |
| Copying a project | The copy starts from the original's demo pack, and gets its own on its first save |
| Deleting a project | Its confirmation offers "Also delete its pack", unticked: keeping is reversible, deleting is not |
| Agents | The same actions under the same names: save, rename, delete, list my packs |

**Sharing a demo with a colleague: by reference, copied on arrival.** A project file already
carries `datapack: { name, version }` (`DatapackReference`, the portable-demos contract, PL-56a).
It gains which store the pack is in, and the pack it was made from. Creating a project from the
file copies the referenced pack into the colleague's own library as that demo's pack, then
installs it; from then on the colleague's demo stands alone. Owner's choice over the file
carrying the whole pack, which makes files heavy (megabytes once images exist) and changes their
format more.

- **The library's "private" becomes "unlisted":** a Yours pack is left out of everyone else's
  catalog, but anyone the library's guard admits (the team) can read it by its exact name and
  version. Today private means only its owner can read it, which would leave a colleague's
  reference unreadable. A truly owner-only pack can be added if one is ever needed.
- **If the referenced pack has gone** (its owner deleted it before the colleague used the file),
  project creation does not stop. The Datapacks step says "The Acme Demo pack this project uses
  has been deleted by its owner. You can continue with Bodea, the pack it was made from; their
  changes won't be included." If that version of Bodea has gone too, it uses Bodea's newest and
  says so; if Bodea has gone entirely, the project continues without sample data and says why.
- **Exporting marks the pack as shared in a file**, and deleting such a pack warns: "You shared
  this pack in a project file on 27 October. Anyone who hasn't created that project yet will get
  Bodea instead."

Left out on purpose: incremental export (each capture is a full version; packs are small, and a
full version installs on its own), and automatic suggestions of hand-made objects.

Later, recorded so they are not lost:
- **Images**, as an optional kind. Nothing carries them today: the service's export removes
  `media_gallery_entries`, keeps the file paths, and uploads nothing (`export-spec.md` §6). Open:
  how today's demo storefronts get their images, before packing any.
- **`product_export`** (Luma's only product form; Venia has both): Commerce's bulk import,
  `POST /V1/import/json`. The service sends `behavior: "import"`, not one of Commerce's own four;
  unverified on ACCS (`export-spec.md` §5).

## Where packs live: the library is home, the service is read (owner, 2026-10-27)

- **The library is where the team's packs live.** It answers the same routes as the service's
  database (datapack-store step 02b), so one writer (`writePackToStore`) puts a pack into
  either store, and one reader (`readPackFromStore`) reads from either.
- **The service is a source we read from, not something we depend on.** Reading works; its
  install, removal and export do not. Our engine installs a service pack by reading its rows
  from the service, with no copy first. A pack we depend on should also be in the library,
  since the service's reads have failed before (its old address went dark).
- **"Copy to the Data Installer" stays**, with its agent tool, and it is the way back to the
  service: the service engine installs only packs in the service's own database, so if the
  service is fixed, or we are allowed to upload into it, a library-only pack is copied there
  first. It still cannot be undone from the extension and has not run live.
- **Export is the gap.** Export, reading a store an SC set up into a new pack, is the only way
  new packs are made, and the service's has failed to save what it reads since August. Ours
  is written per data kind, beside its install and removal, and writes into the library.
- **Next, in order:**
  1. **Audit the service's 42 packs** (read-only): owner, dates, kinds, size, for the owner to
     mark keep or drop. Some are old.
  2. **Bring the kept packs into the library** with the existing copy from the service.
  3. **Keep in step, one way, service to library:** a pack is its name plus version; bring
     over any pair the library lacks and never overwrite one it has. On demand first.
  4. **Research:** whether a Stage workspace has limits or clean-up rules a production one
     does not, before the library is relied on.

### The packs the library starts with (owner, 2026-10-27)

Audited read-only on the service's Stage catalog the same day: 42 packs, 23 shared. Versions
were compared item by item, by content hash.

- **Eleven brands, one version each:** `bodea`, `carvello`, `citisignal_new`, `frescopa`,
  `grocery`, `healthbeauty`, `wecafe` and `wknd` at `main`; `citisignal_original`, `luma` and
  `venia` at `eds-compatible`. Bodea's `tierpricingfix` and the `v1.0` of Grocery and We.Cafe
  are identical to `main`; each `hold` is an older copy.
- **The eight ACO packs** (`aco_<brand>` at `main`), held in the library although our engine
  does not install ACO kinds yet.
- **Left behind:** the `legacySkus-20260522` versions (older product SKUs than `main`), the
  archive copies, the test and personal packs, and `dsc-enablement-sample0`.
- Nothing in Demo Builder names a pack version, and no project on the owner's machine records
  one, so the choice strands nothing here.

### Items too big to read (measured 2026-10-27)

The `product_export` items of `luma` and `venia` (both versions each) cannot be read through
the service: with their rows, `batch-get-data-items` and `get-data-item` answer 400 "Response is
not valid 'message/http'"; without them, they are found. The service stores each data kind as
one document and has no way to return part of one (`actions/database/getDataItem.js`). The
largest item that did read was 357 KB. Most likely the runtime's limit on how big an answer can
be; the documented figure is not yet checked. Venia also ships its products as `products`, which
reads; Luma ships products only as `product_export`.

- **Our library will hit the same limit**, being on the same platform: it stores a large kind in
  several pieces, and the copy reads and writes it piece by piece.
- **The four items: read from the service's database directly** (owner's choice), with the
  connection settings the owner's Stage developer access can read. Read-only. Not yet done: the
  agent was refused access to another service's credentials, so the owner runs or authorises it.
  Tabled 2026-10-27 (owner away from the machine); Luma's products and Venia's `product_export`
  wait on it, and the other packs do not.

## Wiping a store completely (owner's ask, 2026-10-27; not designed yet)

Removing a pack takes away what that pack installed. The SC also needs to take a whole store
back to empty, whatever put the data there: a pack, an earlier demo, or hand edits.

- **The service has nothing for this.** It knows two operations, `import` and `delete`
  (`OPERATION_MODES`, `actions/constants.js`), and its delete removes one pack's named items.
  Its "purge by commerce_instance" (`getInstalledDatapacks.js`) deletes its own install
  RECORDS for an instance, not anything in Commerce.
- **The ERP work already knows some things Commerce will not delete over REST**, and what it
  does instead:
  - an inventory source cannot be deleted, so it is switched off (`warehouseFix.ts`);
  - notes the ERP wrote on orders cannot be deleted; its `erp/detach` reverts what it can
    (credit limits, blocks, ERP order numbers) (`erpDetach.ts`).
  Those are the start of the list, not the whole of it.
- **What a wipe has to settle before it is built:**
  1. **The full list of kinds a demo store holds**, and for each one whether Commerce deletes
     it over REST, only switches it off, or keeps it whatever we do. Orders, invoices and
     the store's own default website and root category are the likely "keeps" to check;
     none of this is verified yet.
  2. **The order to delete in**, the reverse of the install order (spec §0), so nothing is
     refused for still being in use.
  3. **What is never touched:** the default website, store and root category, the admin
     users, and the integration's own credential.
  4. **What the SC is told afterwards:** exactly what could not be removed, by kind and count.
- **It cannot be undone, and it says so.** A wipe removes things no install record lists, so
  there is nothing to restore from (rule 1: what cannot be undone is stated plainly). It is
  confirmed before it runs, names the store it will empty, and is never run by an agent
  without that confirmation (rule 5). A dry run lists what it would delete and writes nothing.
- **Afterwards every install record for that store is cleared**, since what they list is gone.

## Open questions

- Their service ran installs in background workers because of App Builder time limits; ours
  runs in the extension with no such limit, but VS Code must stay open. Is a long install
  resumable if the window closes? (Answer before step 2 ships; first answer: record per
  item, so a re-run skips what exists.)
- Which ACCS store to install into for live checks: a throwaway one is needed.
