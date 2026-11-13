# The Data Installer

An Adobe App Builder service, owned by another team, that stores Commerce sample-data
"datapacks" and installs them into live Commerce instances. Demo Builder creates the
backends those datapacks go into and drives the service from inside the extension.

Everything below was measured against the running service. Where a claim carries a
date, re-probing it is cheaper than trusting it.

## Configuration

Two address settings, read in one place — `services/dataInstallerConfig.ts`:

| Setting | Default | |
|---|---|---|
| `demoBuilder.datapackStore.apiBaseUrl` | the team's deployment | Demo Builder's own **datapack store**, the list every SC gets. Its default is a path on a host the repository already publishes (the PDP overlay's), pinned by a test. `https` only, ≤2048 chars, trailing slash stripped |
| `demoBuilder.dataInstaller.apiBaseUrl` | **empty** | The Data Installer, an **extra**. Same URL rule |

**Datapacks work with or without the Data Installer** (owner, 2026-11-03; beta.153).
Every surface lists the store first and adds the Data Installer's packs when it
answers, asked at each load (`handlers/catalogLibraryRows.ts`). A pack in both shows
once, as the store's. Nothing gates on the Data Installer any more: the wizard's
Datapacks step and the dashboard tile always show, and the panel is titled
**Datapacks**. That screen and the wizard's Datapacks step load every pack once, and their
**Show** list filters what they hold (`ui/catalogShow.ts`, owner, 2026-11-05): **Recommended** (the default: your packs, the team's and the Data Installer's curated ones),
**My Datapacks**, **Team Datapacks**, **Data Installer Datapacks**,
**Community Datapacks** and **All Datapacks**. Both surfaces read the list again when
`dataInstaller.apiBaseUrl`, `dataInstaller.enabled` or `datapackStore.apiBaseUrl` changes
(`affectsDatapackList`), with no Refresh. The Data Installer choice
appears only once the Data Installer has answered this SC (an address is set and it accepts
their sign-in). Agents can still leave it unasked (`includeInstaller: false`, answered with
`installerOff`). When it is asked and missing, a blue house banner
above the cards says only Demo Builder's datapacks are shown, and why (`installerMissing`:
`no-access` when it turned the SC's sign-in away, `no-answer` when it is down). No address
(`no-address`) shows nothing: that is most SCs (owner, 2026-11-03). Neither does `turned-off`:
`demoBuilder.dataInstaller.enabled` turns the Data Installer off without deleting its address
(owner, 2026-11-05). When the store does not
answer, an amber banner says so (`storeMissing`). Only when neither
answers does the list fail, with the store's reason, and its title is "Datapacks
Aren't Available".

The store's default list is its **team** packs (marked with `mark_team_datapack`)
and the SC's own; a colleague's shared pack is **Community**. Every Data Installer pack is tagged
the Data Installer's, curated or not (owner, 2026-11-05); Recommended leaves out its uncurated ones.
Packs nothing can install yet, empty ones and Adobe Commerce Optimizer ones, are not listed, except
the SC's own (`isListable`). Removed with this: the
on/off setting that gated the whole feature, the check that read it, and the Open
Settings button that both surfaces offered when it was off.

## Credentials: none are sent

The Data Installer service signs in to Commerce with a credential of its own. Since its
security fix (DEMOSYS-1698) it ignores any a caller sends, and its maintainers confirmed
on 2026-10-28 that this is intended. So Demo Builder sends none, and gathers none for it:
a datapack write needs only a project with a Commerce backend (`datapackWriteGate.ts`).
An ACCS export still names the ACCS scope in `x-client-scope`; that is a scope, not a
secret.

Removed on 2026-10-28 (DI-6), each with the reason it existed: the shared credential
handed out by the discovery service, and its broker ([ADR-014](../architecture/adr/014-data-installer-shared-credential.md),
now Superseded); the credential-service probe in the Connection step, Configure and
Diagnostics; and the "Set up credentials automatically" offer that minted a pair in the
project's workspace.

## The contract, as measured

**`operation_mode` is one of four**: `import`, `validate`, `delete`, `export`.

The important part is how a wrong one fails: **an unknown mode answers `200` with an
empty processor list — it never returns 400.** So the readable signal is the
processor count, not the status code. Nine candidates plus a deliberate nonsense
string all behaved identically, which is what makes the four real answers mean
something.

**The service derives the site type; nothing sends it.** `buildBody` uploads
`commerce_instance` and no site type, so classification is server-side
inference from the instance's shape. Across all 1,063 log records the vocabulary is
`accs` (a 21–22 char base62 id) and `local` (a full URL). **There is no `paas`
value** — code branching on one would never match.

**Datapacks carry no product images, by design.** The service's pack-prep tooling
strips `base_image`, `small_image`, `thumbnail`, `swatch_image` and
`additional_images` to avoid broken references. Image import is an open question for
that team, not a shipped feature. Missing imagery after an import is not a defect to
chase.

**Customer segments are not supported.**

## Delete is scoped to the pack — proven, not assumed

This is the safety property the feature rests on, so it was tested rather than
trusted. Run live against a populated instance (14 pre-existing categories, 130
products), with before/after snapshots via the instance's own REST API:

- import `bodea` `categories` → **+12 nodes**: the 11 pack categories plus a `Bodea`
  root the import created. Packs bring their own root; they do not merge into an
  existing tree.
- delete, same body → **exactly those 12 removed.** The pre-existing tree and all 130
  products untouched, category count byte-identical to before.

Corroborated by the service's own records: all 434 historical delete runs carry a
scenario expressed in terms of the *pack's* items. No type-wide wipe scenario exists.

## Demo Builder's engine: removal, and an install that hits trouble

Demo Builder's own engine (`services/demoBuilderEngine/`, the default) removes a pack
from its install record, `<project>/.demo-builder/datapacks/<name>@<version>.json`,
which lists every object the install made. It never removes by name.

- **An install takes the whole pack on screen; an agent may ask for less; a removal takes what the
  record lists** (`demoBuilderEngine/askedKinds.ts`). The screen installs every data type the pack
  holds (step 03, decisions J2-1); `start_datapack_import`'s `dataTypes` still installs the kinds asked
  for and what they need (`ui/importDependencies.ts`), and nothing else. A kind left out is left
  alone: not installed, not compared, not removed, not put back, and still on the record. The dry run
  and `preview_datapack_changes` decide it the same way. A removal takes what the record lists,
  whatever is sent. **Uninstall** (named for the pair of Install, owner 2026-11-09, walk F120; the
  same word everywhere this action appears, Project Reset's and Reset Selected's **Uninstall
  Datapack** and Delete Project's box included) is the flyout's own action, in its More menu on the
  version whose data Demo Builder installed in this demo's store (walk F118). It opens the job window
  (`DatapackJobWindow`, step 03 S7; decisions J5-1, J5-2) on its check, then asks **"Uninstall My
  Luma?"** over what the install record lists, counted by data type (`get-datapack-removal-scope`), with
  a red **Uninstall** and Cancel; no store in the title. With unsaved changes **"Save Your Changes
  First?"** follows, its verb Uninstall, the same question a switch asks. The run is steps: **Save Your
  Changes** when saving first, then **Uninstall My Luma** (`uninstallSteps`), titled "Uninstalling My
  Luma"; a clean end is "My Luma Uninstalled", which closes itself; a stop is "Couldn't Uninstall My
  Luma" on its steps with Retry, which takes out what the record still lists. A root a store kept
  ends on its Admin step instead. A removal's check asks nothing of the pack, so a pack deleted from
  its store can still be removed (`validateRemoval`); it refuses only a store other than the one on
  the record. With no record it is refused, and Clear Demo Data clears what that install left.
- **Installing another pack over the project's is a Switch; another version of it is an Install
  that does the same** (walk F97, 2026-11-09, `handlers/importReplacement.ts`). Both uninstall the
  held pack and install the new one. It used to run as a first install: products already in the store
  were left alone, the project named the new pack, and the old data had nothing pointing at it. Now,
  when Demo Builder installed the pack the project uses, the job window's check reads what installing
  changes and the SC's changes to the held pack together ("Checking for your changes", walk F114), then
  asks over the type table: **"Switch to Bodea?"** with a blue Switch for another datapack (step 03
  S6, decisions J2-3, J8-1), or **"Install Bodea, eds-compatible?"** with a blue Install for another
  version of the same one (S7; a save's dated version is never named). With changes **"Save Your
  Changes First?"** follows: the changes counted by type, no names, with **Switch Without Saving** (or
  **Install Without Saving**) at the footer's start and **Cancel** and **Save and Switch** (or **Save
  and Install**) at its end, and an editable "My Bodea" name when the held pack is not the SC's; with
  none it starts at once. The start and the removal wait up to
  `TIMEOUTS.DATAPACK_SAVE_THEN_WRITE` (10 minutes), since a save runs before they answer: the
  webview's 30 s default gave up on a 1 min 28 s save and said it couldn't start over an
  install that then ran (walk F105). **The run is steps** (owner, 2026-11-09, `importSteps.ts`,
  `.rptc/research/replace-flow-steps/`), each named for what it does, in the order it runs, only those
  that apply: **Save Your Changes** (its stage, then "Saved to My Luma", the datapack the record's
  `savedAs` names), **Uninstall Luma** (the held pack by name, never by date: "Reading the new
  version", then "Uninstalling 1,200 of 2,197", then "Uninstalled"), **Install My Luma** (or
  "Install Luma, eds-compatible" for a named version; its line a plain count, "5 of 11 data
  types"), its data types under it, small, with small icons, the one in progress with a
  second line, the word first and then the count: "Installing 1,200 of 2,046", or "Linking product
  options 2,044 of 2,046" while configurable products go in (walk F133, `doingLine`), and **Verify Installation** ("Recording installed items", "Checking products", then "2,048
  products match the datapack", or in amber "3 of 2,048 products differ from the datapack"). The job removes the old
  pack by its record, through the same removal a reset runs (`demoBuilderEngine/engineRemoval.ts`),
  after the new pack is read and checked and before anything is installed. The window is fixed to
  the import it opened for (`useImportWindow`, walk F113: it used to follow the flyout, and closed a
  second into an import whose save moved the flyout), reads its own version's data types when the
  flyout has not (`useVersionTypes`, F107), keeps one height to the end (F116, with room for the
  working data type's second line held the whole time, F133), and offers no Back once the import
  ran to its end (F117): a clean end has only Close, one with a problem Fix with AI beside it. Step titles are bold over a small muted line, with the same space
  between every step (F132). No line wraps or is cut short: the window picks its width when it
  opens, two columns of data types at large for more than six, one at medium for six or fewer or
  in an editor too narrow for two (`runColumns`, F135), and the check and question before a switch
  take that width (F127). **A clean finish hands off to the small result** (owner, 2026-11-10, walk
  F134): "My Luma Installed", then "New products can take 20 minutes to show in search." when
  products went in, after any line the engine has for the SC (what it kept of theirs, a step left
  in the Admin). With nothing under its title it closes itself. A save that ran first is not
  repeated there: its own step said where the changes went (Phase 2).
  A finish with a problem (a data type refused rows, the check found products that differ, the
  store configuration failed) stays on its steps under the same title in amber, with Fix with AI,
  how long search takes and "Took …" under them; a stop is "Couldn't Install My Luma" on its
  steps, with Retry while a retry can get past it (twice), then Fix with AI. A save or removal that fails installs nothing, says why in red on its step, and leaves the
  project naming the old pack; the project names the new pack once the old one is gone, so a reset
  then removes the new one. Agents get the same through `start_datapack_import` (`changes`,
  `saveAs`, `CHANGES_NEED_ANSWER`). Installing the same version again replaces nothing.
- **What a removal keeps is decided several reads at a time** (2026-11-09, `removers.ts`,
  `fewReadsAtOnce.ts`). Before anything is taken out, `decideRemovals` asks of each container the
  record lists whether something not being removed sits in it (a category's products and child
  categories, a set's products, a rule's coupons). Timed live on Luma: 134.8 s of a 3 min 5 s
  removal, one container at a time. Now up to five containers are read at once, in the same order of
  decisions where one depends on another (a category counts only child categories decided before
  it; companies, shared catalogs and customer groups one after another), with exactly the reads it
  made before. A Luma-sized test store: the same 153 reads in 33 rounds instead of 153.
- **A save's record is built from what the save read** (`rebaseRecord`, `recordFingerprints.ts`). The
  record moving onto the version a save made used to read every recorded object from the store again
  (36 s on Luma), moments after the capture read the same store through the same converters. It now
  hashes the captured rows (products, gift cards, attributes) and the capture's own lookups, and
  reads only the small kinds a pack row cannot name by the store's id. `recordReuse.test.ts` proves
  the two records equal for every recorded kind, with edits in the store.
- **The save and the uninstall after a changes check reuse what the check read** (2026-11-10,
  `services/commerceReadWindow.ts`). Importing over the demo's pack read Commerce three times on
  Luma: the check (45 s), the save of the SC's changes (40 of its 48 s) and the uninstall's decision
  of what to keep (34 s), with nothing written to Commerce in between. The check (both
  `get-datapack-removal-changes` and `preview-datapack-changes`) now opens the project's Commerce
  client to `remember`: it always reads Commerce itself and keeps each answer. The save (`openSave`)
  and the engine's runs open it to `reuse`: a GET the check made is answered from what it read,
  anything else reads Commerce. Any write through the project's client throws the kept reads away,
  and they last `CACHE_TTL.MEDIUM`. The check never reuses, so an Admin edit is always seen by the
  next check. Debug Logs say "reusing what the changes check read from Commerce N s ago".
- **An uninstall counts in one bare count** ("2,062 of 2,197", walk F131): each run's objects, and
  products as each Import API call deletes them (`bulkRemoval.ts` `deleted`).
- **The check after an install reuses the read-back's products** (`verifyInstall.ts`). The read-back
  that records what an install wrote reads the products it wrote; the check, ten seconds later,
  reused to read all 2,048 again (14.8 s). A first install's check now reads no products. A
  reinstall that wrote nothing still reads them, since its read-back read none.
- **Anything the SC changed since the install is settled first** (step 05,
  `handlers/removalChanges.ts`). The job window's check reads it (`get-datapack-removal-changes`,
  the preview's own read) and, when there is something to lose, Uninstall or Switch asks **"Save
  Your Changes First?"** (`SaveFirstWindow`): the changes counted by type, **Uninstall Without
  Saving** at the footer's start, **Cancel** and **Save and Uninstall** at its end (a switch's
  say Switch, or Install for another version). When the demo's pack is the SC's own, saving is Save, a new version
  of it, the previous one kept. There is no "Always" box (removed 2026-11-12, step 03 S6): with
  `demoBuilder.dataInstaller.changesOnRemoval` set to `save` in Settings, the SC's own pack is saved
  without asking, and the first answered save question shows a one-time tip pointing to that
  setting (`datapack-save-question-answered`). When it is not (a team pack), saving makes a new
  pack: the question has a **Save As** field, starting "My Luma", or "My Luma 2" when that is taken,
  and a name it refuses says why and holds the save button. The removal is then of the saved
  version, since the install record moved onto it. A save that fails removes nothing. A read that
  fails still asks, saying "Your changes couldn't be checked." in place of the counts. A project
  reset or an Edit that removes the pack saves first without a second question when the pack is the
  SC's; when it is not, it asks in its progress window (**Save Changes As**, required and starting
  empty, then **Save As New and Uninstall**, or **Uninstall Without Saving**), and closing the
  question keeps the data (owner, 2026-11-04: an empty name used to lose the changes). `reset_datapack` names the changes and refuses until `changes` is `keep` or
  `drop`, unless the setting answers.
- **A project delete removes the data only when asked** (owner, 2026-11-09, walk F96,
  `projects-dashboard/services/datapackDataRemoval.ts`). Its question has **Uninstall Datapack**,
  unticked, offered only when the project has a datapack Demo Builder installed and a Commerce
  backend, and its sentence says the data stays in Commerce unless removed. Ticked, the data comes
  out FIRST, through the reset's own removal and its changes question above; if it does not all
  come out, the delete stops and the project is kept, since deleting it would leave the data with no
  record. Delete Selected asks the same per project, with a second step for names, as Reset Selected
  does; `delete_project` takes `removeData` with `changes` and `saveAs`. A project delete never
  deletes a datapack: that is the library's Remove.
- **A pack it has no record of** (one the service installed, or one installed from
  another project) is refused, and nothing is removed (owner, 2026-10-30, step 14
  item 20). The refusal points the SC at **Clear demo data** on the Data Installer
  screen (agents: `check_demo_data`, then `clear_demo_data`), which clears what Demo
  Builder did not install from the stores the SC picks (`demoDataWipe/wipePlan.ts`):
  products, categories, customers and cart rules; companies with their customers,
  shared catalogs with their customer groups, customer groups, attribute sets and
  attributes, each only when nothing else on the instance uses it; and the wholly
  chosen websites' settings, set to the default's value (Commerce cannot make a
  value inherited again, so "Use Default Value" in the Admin stays the one way to
  do that). Orders are closed, never deleted. What another demo also uses stays, and
  the dialog names it. Rules, write order and live proof:
  `.rptc/plans/datapack-engine/step-10-wipe.md`.

When an install hits trouble (step 14 items 1 to 3):

- **Every kind's rows are checked before the first write**, by the install and by the
  dry run (`validate_datapack_import`), which now reads the pack's rows too
  (`packRowProblems` in `runPack.ts`). A bad row in any kind stops it with nothing
  written, naming each kind at fault.
- **One refused row does not stop the rest** (`refusedRows.ts`). A row Commerce answers
  400, 404, 409 or 422, or one naming something the store lacks, is skipped; the rest
  go in. A row that needs a skipped one is skipped with it and says which it needed: a
  category's children, the products in it, the products and assignments of a set, a
  coupon of a cart rule, a customer of a group, a link to a stock, a catalog's
  members. The job's note starts "Skipped N rows, and installed the rest:" and names
  each, with Commerce's own message. Each kind still ends `success`, because it ran to
  its end; the note is where the skips are said. A setting Commerce refuses is skipped
  the same way, and so is a repeat install's update (tried again next install).
- **What is the store's fault still stops the install:** 401, 403, 429, a 5xx, no answer
  at all, a read a kind makes before its rows, and anything unexpected. Running the
  install again carries on from the record.
- **A create whose answer is lost is still the pack's** (`pendingCreates.ts`,
  `pendingFinders.ts`). Each create is written to the record as pending before it is
  sent. A 4xx drops the entry; no answer, a 5xx or an answer missing the new id keep
  it. The next install, and any removal, look each pending entry up the way its kind
  looks before creating: found, it is recorded as the pack's (and removed with it);
  not found, the entry goes. The record's `pending` field is optional and only written
  while something is pending, so records from earlier versions read unchanged.

**Products and gift cards go through Commerce's bulk queue** (`bulkProducts.ts`,
`bulkRemoval.ts`; owner, 2026-11-05). One product per call took 13 to 25 seconds on ACCS, so
Luma's 2,046 would have taken hours. Now:

- One read per 100 SKUs finds which ones the store already has.
- Products go 50 to a call to `V1/async/bulk/products`, in two waves: everything that links
  nothing, then the configurable, bundle and grouped products that link them. That way a child
  exists first whatever order the pack holds them in.
- Each batch is followed to its end and read back row by row (`readBulkRows`). A row Commerce made
  is recorded. A row it refused is skipped with its words, as above. A row it marks worth retrying,
  or that is still queued after ten minutes, is sent again on its own.
- A call refused for its shape (400, 404, 413) sends that batch one at a time. Not signed in, too
  many calls, a 5xx or no answer stops the install, as for a single create.
- The progress window counts them: "450 of 2,046 products".
- A batch's status read that fails is read again, up to three times in all, before the install
  stops. Once Commerce has accepted a batch, a failure while following it leaves the batch's
  products pending, so the next install or removal settles them. Only a refusal of the batch call
  itself means nothing was made. Both were found live on 2026-11-06, when one 401 stopped an install
  and 50 products made by the accepted batch dropped off the record.
- Everything an install makes goes on the record with its key at creation (`createOne`), not
  only in the hash pass at the end. A keyless record reads as one from before keys were kept. For
  categories, that means "the pack made its own root", so a resumed install once rebuilt Luma's
  whole tree under a second root.
- Products are deleted through Commerce's Import API in delete mode (`POST V1/import/json`,
  `behavior: 'delete'`), 200 SKUs to a call, then read back. Only a SKU the store no longer has
  leaves the record. One still there, or every SKU of a call the store refused for its shape, is
  deleted on its own, five at a time. It is the Data Installer service's own route for removing a
  pack's bulk products (`ProductExportDeleteProcessor`). Removal, installing a pack again, and Clear
  Demo Data all use it (`deleteByImport`, `removeProductsInBulk`, `afterImportDelete`).
- The bulk queue's delete does not work on ACCS. Commerce accepted every batch and failed every
  row, "The product couldn't be removed" (live, 2026-11-06), so a Luma removal ran one product at a
  time and took 26 minutes.

## What agents are not given

Six read tools. Three groups are held back deliberately — the most reviewable
judgement in this feature:

- **Changing or deleting a pack.** The catalog is shared infrastructure with 23
  entries other teams depend on, `delete-datapack` cascades, there is no undo and no
  ownership guard. One agent typo removes a colleague's demo. Creating a NEW pack is
  offered in two ways, both of which only add: `start_datapack_export` (with the service
  engine; with Demo Builder's it saves into the SC's datapack library instead, Save or Save As) and
  `load_datapack_zip`. Each needs the pack's name typed back, and loading a file
  never updates an existing pack in this catalog. The datapack library does have an
  ownership check, so updating your own pack is offered there.
- **`DELETE get-installed-datapacks`** — clears tracking without uninstalling
  anything. Its only effect is to make the tracking lie.
- **`async-process-status`** — reports `in_progress` for jobs that finished hours
  earlier, so an agent polling it would wait forever.

## Saving a store into a pack, with Demo Builder's engine (datapack-engine step 14)

**Create Datapack and Save Changes** (owner, 2026-11-03 and 2026-11-04, `.rptc/plans/datapack-save-as/`).
There is no automatic pack per demo. The demo's pack (`project.datapack`, the pack it installs from
and resets to) is one of the library's cards, wearing the check wherever it lives, the SC's library
included, and opening on the version the demo uses (`DatapackCatalogGrid`):

- **Create Datapack**, in the catalog's header while the demo has no pack Demo Builder installed: the
  new pack's name, then what goes in it. It makes a new pack of the SC's, whose library name is
  generated from the name typed (`packIdFor`: a slug and a random suffix, so it can never land on a
  colleague's). The demo then uses it.
- **Save Changes** or **Save As New Datapack**, once the demo has a pack Demo Builder installed: in
  the header only (step-04 S5 removed the flyout's copy; owner, 2026-11-09, walk F83: an SC could not
  tell which door saved what). On the SC's own library
  pack (`mine`, not `team`) it is Save Changes, a new version; the header's Save ▾ also offers
  **Save As New** to branch off into a second pack. On a team pack or a colleague's it is Save As New
  Datapack, named for what it does ("Save Changes" read as changing the team pack): it makes a new
  pack of the SC's. Save opens **"Save Changes to My Luma"** (`components/save/SaveChangesWindow`,
  step-04 S2, J3-1): what My Luma will hold, read-only, one row per type from what its install record
  lists (`get-datapack-removal-scope`), "2,046, 4 changed" where the SC changed some
  (`get-datapack-removal-changes`), no line above the table; Review Records opens the install's spot
  check, Back only; Cancel and Save. Records added by hand since the install show only once saved:
  neither read sees them. Save As New opens **"Save As New Datapack"** (`SaveAsNewWindow`), the house
  form with one field, Datapack Name, Cancel and Save and no line; its name starts empty, or "My
  Bodea" from someone else's datapack ("My Bodea 2" when taken), and a refused name shows under the
  field in room kept for it ("Give it a name.", "You already have a datapack named My Luma."); the
  save refuses the same names (`saveIntoFor`, `saveAsName.ts`). A save into the SC's own pack ends on
  "Saved to My Luma", a new pack on "Saved as Luma Holiday" (J3-1, owner 2026-11-12). The server
  decides where it goes the same way (`saveIntoFor`): a team pack is never saved into, even by its
  owner.
- **A pack of saves is one thing** (owner, 2026-11-09, walk F99; Phase 2, 2026-11-12). A save's
  version is never shown as its id: everywhere it appears it reads as when it was saved, in the SC's
  own time ("Nov 9, 9:15 AM", `versionLabel` in `packVersions.ts`). The card shows the save the demo
  uses (or, for a pack no demo uses, the newest) as "Saved Nov 9, 1:56 PM", with no version picker;
  named versions (`main`, `eds-compatible`) keep their picker, since each is a variant, and a pack
  holding both lists its saves there as the one on show. A save keeps the pack's two newest saves.
  Version History was removed (Phase 2): the flyout's More menu offers **Undo Last Save** instead,
  only on the datapack the demo uses, when it is the SC's own with an earlier save and the demo is
  on the newest. It asks "Undo Last Save?" (Cancel, and Undo in blue), sends `undo-last-save`, and
  opens the import window on the earlier save, which picks the running job up; the job uninstalls
  the newest save, installs the one before it, and then deletes the newest. **Delete** (renamed from Remove Datapack, owner
  2026-11-09: it leaves the library for good, where Uninstall can be undone by installing; a bare
  verb since J8-3) on a pack of saves deletes it whole, every version and each one's settings layer
  (`delete-library-datapack` with `everyVersion`); on a named version, that version and its layer.
  It asks "Delete My Luma?", "Permanently deletes it.", naming no version, with a red Delete. It is
  offered on the SC's own library datapack and never on a Demo Builder datapack, its owner's
  included; agents can still delete one (`delete_library_datapack`). The storage is unchanged: each
  save is still its own version, so nothing was migrated.
- **Switch to** (J8-1, owner 2026-11-12; step-04 S5). Over a datapack the demo holds and Demo Builder
  installed, another datapack's main button reads "Switch to Bodea", exactly when the job window
  opens on a switch (`windowRoute`); another version of the held datapack keeps Install.
- **Restore** (Phase 3/5, owner 2026-11-12, J4-2 to J4-4). On the version whose data Demo Builder
  installed in the demo's store, the flyout's main button reads "Restore My Luma" in place of
  Install. It sends `restore-datapack` without `confirm`, the flyout waiting on "Checking for your
  changes": the check compares Commerce with the version installed (`previewChanges`) and writes
  nothing. Up to date (the target is the version installed and nothing differs): the small result
  "My Luma Is Up to Date", nothing started. Unsaved edits: "Restore My Luma?" ("Commerce goes back to
  My Luma as you last saved it. Anything you changed since is lost.", Cancel and Restore in blue),
  then sent confirmed. Anything else (a newer save, the amber dot) starts at once. The target is the
  SC's own pack's newest save, else the version installed. A start is one job through
  `startDatapackImport` that uninstalls the pack by its install record and installs the target,
  changes dropped, never saved, and opens the import window on it; a same-version restore is a
  real replace (`restore`), where an ordinary import of the same version updates in place.
- **The updated dot**, the house amber dot beside the card's version picker, when the named version
  installed changed in the library since (`updatedAt` after the install record's `startedAt`; team
  packs are updated in place as `main`): "Updated on Nov 9". A later save never lights it: a later
  save is not a newer version. It is deliberately not an update in the Updates window: a
  demo may stay on an older version on purpose.

A finished save reads the catalog again at once (`useSaveStoreChanges`), so closing its window
only closes it. A pinned section above the grid with Save and Save As beside the demo's card
shipped for one day and was removed (owner, 2026-11-04): it looked like no other screen, Save As
was the header's Create Datapack a second time, and the card already had a selected look that a
library pack had never been given.

A pack reaches the Data Installer's shared catalog only by Copy to the Data Installer, afterwards.

**A save from a pack has nothing to tick** (owner, 2026-11-09, walk F85). It takes everything the
demo uses (`demoUses.ts`): the pack's data as the store holds it now, and whatever of the demo's the
pack does not hold yet, which is what the SC added in the Admin. Products, gift cards, customers and
cart rules are the demo's website's, categories sit under its root, and companies are its
customers', so all of them are the demo's. Customer groups, shared catalogs, attribute sets and
product attributes Commerce keeps for the whole instance, several demos' on a shared one, so each
counts only when something of the demo uses it: a group its customers, cart rules or companies are
in; a catalog for one of those groups; a set one of its products has; an attribute one of its products
has a value for (read live on Scratch 1028: an attribute counted by its sets took three that no
product had a value for). Add Unused Items, which listed the rest of those four kinds to pick, was
removed (overview 7b, 2026-11-10), and the save refuses `selections` with a pack. Nothing of what
the demo uses is left out, so the left-out list is a save from nothing's alone.

**Create Datapack, from nothing,** walks the pick screens (`create-flow/DatapackFlowDialog`): a card
per kind (products, gift cards, categories, cart rules, customers, companies, customer groups, shared
catalogs, attributes, attribute sets), and clicking one opens that kind's checklist. Each kind is listed when first opened,
from the project's store with its own credential (`list-datapack-export-items`, `storeItems.ts`),
scoped to its website where Commerce scopes the thing, Commerce's own left out. The cards show at
once, and a kind with none is greyed out without a click: `count-datapack-export-items` reads all ten
kinds' `total_count` at once (`pageSize=1`, `storeItems.ts`), reads only, with no agent tool since
`list_datapack_export_items` answers per kind. Only a count of none is shown or acted on. Cart rules
and companies are scoped in code after their read, so theirs count the whole store and grey only when
the whole store has none; a failed count says nothing. Any other card stays clickable until its list
answers, and greys then if nothing was left to pick. **Select All Data**, at the head of the kinds,
ticks every item of every kind that may have some, reading any kind not opened yet with a spinner
beside it; a kind whose list does not answer says "Couldn't be read" on its row. Unticking it clears
them all, and its box is dashed when some are ticked. The save (`packSave.ts`, `saveStore.ts`)
writes what was picked, from a store Demo Builder did not fill. A pick brings what it needs (a
product its categories, set, attributes and quantities; a rule its coupons; a company its admin),
and never joins the install record, so removing the pack leaves it.

**The save's window shows two steps** (owner, 2026-11-09, walk F91; two steps since step-04 S4,
decisions Phase 7b): "Export from Commerce", with a row per data type the save holds under it, in
the order capture reads them, then "Save <the pack's name>" as its own row, so a failed write shows
on its own row (`captureRows`, beside `captureLines`). The export spins with what the save does
first ("Reading this demo's data"), then counts the data types exported ("2 of 5 data types"), the
type being read saying "Exporting", and ends "Exported"; the save row waits, then spins with the
library write ("Saving to My Datapacks", then "Finishing the save"). Rows read together, products
with gift cards, spin together. A save that stops ends on the rows it stopped on (`stoppedRows`,
from `saveInWindow`): the row that was spinning red, "Stopped", what had not started "Not run", the
reason the sentence under them. They reach the shared progress window as the message's `rows`
(`OperationRow`, the data types in `types`), drawn by `StepRows` as the import window draws its
steps, and the data types are built by the import's row model (`runRows.ts`, `SAVE_RUN`). Only the
window gets rows: an agent's save answers its sentence. From a pack the website's products are read whole
once, both to find what the demo uses and as capture's products, and the set list once for every
product (walk F90).

Before the version is stored it is checked by the install's own parsers (`packRowRefusals` in `runPack.ts`, the same check the install and the dry run run); one the
install would refuse is not saved, and the save says which kind and why. A save from nothing's sentence also
says what it left out ("Left out, because nothing picked them: 3 products (...)") and any id it
could not turn into a name and kept as it is. Custom option and bundle option and link ids are
left out of a saved product, as the service's export leaves them out; a company with no region id
is saved with its region's name. Nothing reaches the Data Installer or its shared catalog. A round
trip (install a pack into an empty store, save it back, compare) is pinned by
`tests/features/data-installer/services/demoBuilderEngine/roundTrip.test.ts`.

## The Data Installer service's engine and export (deleted 2026-11-06, DI-12)

Until 2026-11-06 the SC could choose the Data Installer service to install and remove packs
(the Engine setting under Sample Data), and Create Datapack could ask the service to export a store
into its shared catalog. Since 2026-10-27 the service has ignored the Commerce credentials a caller
sends, so both did nothing for us, and both were deleted with the setting, under "no soft
deprecation". Nothing that worked was lost: Demo Builder installs the service's packs itself
(`readPackItems`), including its import-form products and customers; Save As captures any store,
hand-built ones included; and Copy to the Data Installer puts a pack in its shared catalog. A pack
the service installed before then has no install record, so its removal points to Clear Demo Data.
The owner's note: the split between the two sources is to be reconsidered when they become adapters
(DI-12, part 1).

### A pack in the Data Installer's form

Copy to the Data Installer, and loading a file into it, send the pack in the form the Data Installer
takes, or nothing (`installerForm.ts`). The service checks every item against its own schema as it
is written, and a pack there is never replaced, so one refused item would leave half a pack in the
shared catalog. Checked against every item of all 14 packs in Demo Builder's store on 2026-11-06,
three things differed:

| What | What the copy does |
|---|---|
| A gift card names its attribute set ("Gift Card"); the service takes a number, which differs between stores | Sends the Default set's, 4 on a standard Commerce store, which holds every gift card attribute (owner's choice); the result's `changed` says so |
| An import-form item's `allowed_error_count` as text | Sends it as a number |
| An item over the service's 1 MB request limit (Luma's and Venia's products) | Refused before any write (`itemParts.ts`): those packs cannot go to the Data Installer |

A data type the service has no schema for, store configuration, is refused before any write too.

**Not offered on screen yet** (owner, 2026-11-06): the Data Installer does not let our accounts write
to it, so Copy to the Data Installer would fail every time. The button is off
(`COPY_TO_INSTALLER_SHOWN` in `PackActions.tsx`, one line to turn on once access exists). The agent
tools stay, and a refusal for who we are (401 or 403) answers in plain words
(`INSTALLER_WRITE_REFUSED`) rather than the service's.

### An ACO pack from a Commerce store

**Held back in beta.153** (owner, 2026-11-03): Create Datapack opens straight on the Commerce
pack, with no pack-type screen, and `start_datapack_export` refuses `aco: true`
(`ACO_HELD_BACK`). An ACO pack saved now would sit in the library with nothing to install it. The
code below ships unreached. The ACO line reverts the hold commit when ACO support is released.

The export screen's "Pack type" choice, and `start_datapack_export` with `aco: true`, make an
Adobe Commerce Optimizer pack from the project's own store (datapack-engine step 14 item 19,
PL-60): `aco_metadata`, `aco_categories`, `aco_products`, `aco_price_books` and `aco_prices`,
for the store views the SC ticks (none named means every one). It is Demo Builder's port of the
service's `process-aco-datapack` export (`services/acoExport/`), so it runs in the extension,
reads Commerce only, and saves into the SC's datapack **library**, never the shared catalog.
Each kind is checked against the service's own schemas (`config/aco-schemas/`, copied
verbatim). An existing name and version is refused, and so are `commerceInstance` and
`selections` sent with `aco`; deleting the pack from the library undoes
the save. What it reads and where it differs from the service, with file:line, is
[`.rptc/research/datapack-engine/aco-export-spec.md`](../../.rptc/research/datapack-engine/aco-export-spec.md).
Installing an ACO pack is not built: Demo Builder's engine refuses ACO kinds, and PL-60 owns it.

## A pack's settings layer (datapack-engine step 09)

The service cannot set Commerce configuration, so settings live **beside** a pack, in the library: a
**settings layer** is a library pack named `<pack name>-settings` that holds only `store_config`
rows. It is ordinary pack rows, moved like any pack. Only Demo Builder's engine applies one.

| When | What happens |
|---|---|
| Install | the pack's data, then the newest version of its layer, on the pack's own install record. A pack holding `store_config` itself wins, so nothing applies twice |
| Install of part of the pack | the layer goes in only when every kind the pack holds is asked for, or `store_config` by name. Otherwise settings are left as they are, set or not, on the record or not, and the note says "The store configuration was left as it is: it goes in when every data type is installed." The preview says the same |
| Remove | one removal takes both: the record's settings go back first, by the settings fix's "changed since" rule, then the data. No library is needed |
| Install again | a setting still as Demo Builder left it follows the layer; one the SC changed is kept and counted; one the layer dropped, or every one when the library says the layer is gone, is put back |
| Refused | a path outside `catalog/`, `sales/`, `checkout/`, `customer/`, `btob/`, `cataloginventory/`, under `web/` or `admin/`, or ending in password, secret, token or key, and a store-view row, stop the whole install before any write, by path, in the dry run too. So does the same path in a file's layer at Open and Load |
| Trouble after the data | a setting Commerce refuses, one with no value anywhere, or a write with no answer: the data stays, and the note names it. Removal takes the data out and puts back what was applied |
| Library cannot be asked | the data installs and the note says so. A recorded setting is left alone, since "cannot ask" is not "gone" |

**Where a person sees it.** The pack's flyout has a **Store Configuration** row ("4 Settings", each
path and value behind Show) before Install is pressed (`StoreConfigurationRow`). The install's note says "From bodea-settings@2: Set catalog/frontend/grid_per_page: 12 →
24." `preview_datapack_changes` answers `settings` (`layer` and `changes`, by path, old and new value).

**The catalog offers no card for a layer while its pack is listed** (`withoutLayerCards`, the Data
Installer screen and the wizard's Datapacks step). That would strand one an SC could otherwise not
remove, so it keeps its card when no pack of its name is listed or when it was installed on its own;
and Delete takes a pack's layer with it (the flyout's Delete Store Configuration was removed,
step-04 S5). `find_datapacks`
still lists every row: an agent can tell a layer by its name and `get_datapack`'s `settingsLayer`.

**Saving.** "Save store changes" never writes a layer's settings into the new version, which would
make that version hold settings and win over its layer for good, and never onto the layer installed,
which may be a colleague's. They go to a new layer beside the new version, named for the pack saved
into, at the same version, read at their values now. A pack holding its own settings keeps them.
Deleting a version takes your layer of the same version with it, so the save is still undone in one
step. Sharing a pack shares its layer.

**Files.** A pack's file carries its layer as a second section, and the format version stays 1, so
an older extension loads the data and ignores the rest. Loading puts the data where the SC chose and
the layer in the library; a version already there is left unless the SC asked to replace. An older
file, with no section, loads as it always did. The layer's reversal is on the load result (Delete
Store Configuration, unless removing the pack takes it).

**Putting a value back leaves a website row explicit.** The API has no delete route, so a removal
writes the value the website had inherited, and the website then holds it as its own. This work does
not change that; "Use Default Value" in the Admin restores inheritance (plan's decision 5).

## The library in the catalog

The Data Installer screen's catalog shows both stores: one request
(`find-datapacks` with `includeLibrary`) returns the Data Installer's packs and then
the library's, each library row tagged `store: 'library'`. Cards are grouped by store
AND name, so a library pack never folds into a Data Installer pack of the same name.
A library card is tagged "Library", or "Mine" when the SC owns it — the library says
so itself (`mine`), because only it knows the caller's verified email.

A library pack's flyout offers Install, with Save as File and, when it is yours, Share or Stop
Sharing and Delete in its More menu (`PackActions`); in the Datapack Library the bar is More alone. Demo Builder installs it straight
from the library; agents pass `source: "library"` to `validate_datapack_import`,
`start_datapack_import` and `reset_datapack`. While the Data Installer is on (its address set and
`dataInstaller.enabled`, the catalog's `installerOn`), the flyout also offers Copy to the Data
Installer beside Import (`copy-library-datapack-to-installer` / `copy_library_datapack_to_installer`):
it puts the pack where other teams can find and install it, and is not needed to install it here
(owner, 2026-11-06). The copy writes into the shared catalog, so it carries the load's guards —
the pack name sent back, an existing pack never overwritten — and it cannot be undone from the
extension.
If the library cannot be reached, the Data Installer's packs still show, with a line
saying why the library's are missing. Agents get the same through `find_datapacks`
(`store`, `includeLibrary`) and `get_datapack` (`store`).

## What is installed, and what happened, from both engines (step 14)

The service tracks what it installed on each store and logs every run it makes. Demo Builder's
engine keeps its own, beside the open project:

- **Installed:** one install record per pack, `<project>/.demo-builder/datapacks/<name>@<version>.json`
  (`installRecord.ts`). A record is there for as long as the store holds something the pack made,
  including after an install that stopped part way.
- **Activity:** `<project>/.demo-builder/datapack-activity.jsonl`, one line per install or removal
  the engine finished (`engineActivityLog.ts`), written when the job ends (`onJobEnd` in
  `engine.ts`) whether or not anything is still watching it. Appended, never rewritten, so a
  removal's line outlives the record the removal deleted. It sits outside the records' folder,
  because every `.json` file there is read as a record. A line that cannot be read is skipped.
  Nothing is decided from this log: removal reads the record.

`list-installed-datapacks` and `get-datapack-activity` (`engineHistoryReads.ts`) answer
Demo Builder's rows first and the service's after, each row tagged `source` (`demo-builder` or
`service`). Ours add `objectCount` (installed) and `outcome` and `detail` (activity). Paging
counts our rows first and asks the service only for the rest of the page, so the Activity tab's
"Load 50 more" neither skips nor repeats a row. A source that cannot be read costs only its own
rows and says why (`serviceError`, `engineError`); with no rows of ours, a service refusal is
answered as before. The catalog's check mark and the Activity tab both read these, and so do
`list_installed_datapacks` and `get_datapack_activity`.

What they do not cover: installs by Demo Builder's engine in another project, and runs from
before step 14 (no log was kept then).

The engine writes Commerce through the signed REST call the ERP work shares, which sends a read
again on a network failure, a 5xx or a 429, and a write again only on a 429
(`commerceRestRetry.ts`).

## Datapack files (save to a zip, load from one)

Neither the service nor the datapack library has a file form, so the zip is built and
read in the extension (`services/datapackZip.ts`) and works the same for both stores:

```
<name>-<version>.datapack.zip
  datapack.json            name, version, display name, description, data types,
                           which store it came from, when; plus a format marker
  data/<data_type>.json    one per data type: the rows, as the store holds them
  settings/store_config.json   its settings layer, when it has one (below)
```

A zip whose files sit under one root folder reads the same.

| | Panel | Agent tool |
|---|---|---|
| Save a pack from either store | "Save as file" in a pack's flyout menu, and after an export | `save_datapack_zip`; `dataTypes` saves only the types named (to leave out one the store cannot send) |
| Remove your own library pack | "Delete" in its flyout menu (not on a Demo Builder datapack) | `delete_library_datapack` |
| Install a library pack | "Install" in its flyout | `start_datapack_import` with `source: "library"` |
| Put a library pack in the Data Installer's catalog (needs write access, which our accounts lack today) | Not on screen until then | `copy_library_datapack_to_installer` |
| See what a file holds, writing nothing | the first step of "Load from file" | `open_datapack_zip` |
| Build a pack file from a Commerce product export | none (agent only) | `build_datapack_from_export` |
| Write it into a store | "Load from file", library by default | `load_datapack_zip` |
| Undo a load into the library | "Remove it from the library", in the load result | `delete_library_datapack` |

Loading puts a pack in a store; installing it into Commerce is still Install. Each data
type is one `add-data-item` request, so a type too large for one request is refused by
name and the others still land. An agent's paths must be inside the open project; the
panel uses VS Code's own dialogs.

**Undo is library-only, by design.** `delete-library-datapack` deletes one of the
caller's own library packs; the library refuses anyone else's as if it did not exist.
The panel offers it only after a load that CREATED the pack, where it is an exact
undo — after an update it would also remove what the pack held before. Deleting from
the Data Installer stays unoffered, for the reasons under "What agents are not given".
A load into the Data Installer therefore still cannot be undone from here.

## Setting up a store for a demo (for SCs)

What to know before installing a pack into a store, because the Commerce API cannot do it for you.

- **Create the website and store first, then aim the import at it.** No API creates or changes a
  website, a store or a store view (`POST /V1/store/storeGroups` and `POST /V1/store/storeViews`
  answer 404 on ACCS; measured 2026-10-30), and no data kind creates one. Make them in the Admin
  (Stores > All Stores), then pick them in the project's Business Structure step. This is the Data
  Installer author's own rule too.
- **Stores on one website always share prices and customer accounts.** Neither setting goes finer
  than a website: Catalog Price Scope (`catalog/price/scope`) is Global or Website, and Share
  Customer Accounts (`customer/account_share/scope`) is Global or Per Website. Two demos that need
  their own prices or their own buyers need two websites, not two stores on one.
- **A pack's own root category.** A store shows only the categories under its root category, and
  no API can change that root. When your store's root is its own, Demo Builder puts the pack's
  categories under it and there is nothing to do. When another store shares it (a test store made
  beside a demo's, say), the install asks you to set the store's Root Category to the pack's root in
  the Admin (Stores > All Stores > your store), with Open the Admin, I've done it and Skip for now.
  A skipped step stays in the pack's flyout on the Data Installer screen as one line, "1 step left
  in the Admin"; Show step opens it as the setup guide shows a step, with Open the Admin and Check.
  Removing the pack while your store still shows its root keeps that root: set the store's Root
  Category back first, then remove it again.
  When the pack's categories go under your store's root, one with a url key the store already uses
  for another category in the same place would be refused by Commerce, so Demo Builder checks first:
  the preview names it, and the install stops before writing anything. Change that category's URL
  Key in the Admin (Catalog > Categories, Search Engine Optimization), then install.
- **Commerce Optimizer (ACO)** groups its catalog by product family, not by a store's root, so it
  probably has no such step (not tested).
- **A customer group has one shared catalog.** Commerce allows only one per group. When a pack's
  catalog names a group your store already gave a catalog, Demo Builder's engine uses your
  catalog instead: it adds the pack's companies, categories and products to it, and removing the
  pack takes those back out but never deletes your catalog. The install log names the catalog it
  used.

## What Demo Builder's engine does with a pack's rows (step 14)

Where it now does what the Data Installer service did. None of these has run against a live
store yet; the step 14 plan's live-test script covers them.

| Rows | What happens |
|---|---|
| Swatch attributes (`swatch_visual`, `swatch_text`) | made in the service's two steps: the attribute, then each option with its swatch as its value |
| A company region named by `region_code` or by name | turned into its region id from the country's regions; a region the country lacks stops the install, naming it, before anything is made for that company |
| Shared-catalog product SKUs | the spaces around them are trimmed; their case is kept |
| A product's `additional_attributes` object | turned into custom attributes; the row's own custom attribute of the same code wins |
| Removing a stock the pack made | its website is taken off it first, then it is deleted, then the website goes back on the stock it sold from |

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). One matters most here: a
destructive tool refuses without `confirm: true` — which is why the delete scoping above is proved rather than
asserted.
