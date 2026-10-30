# The Data Installer

An Adobe App Builder service, owned by another team, that stores Commerce sample-data
"datapacks" and installs them into live Commerce instances. Demo Builder creates the
backends those datapacks go into and drives the service from inside the extension.

Everything below was measured against the running service. Where a claim carries a
date, re-probing it is cheaper than trusting it.

## Configuration

Three settings, read in one place — `services/dataInstallerConfig.ts`:

| Setting | Default | |
|---|---|---|
| `demoBuilder.dataInstaller.enabled` | `true` | A corrupted non-boolean reads as `true` — a broken `settings.json` should not look like a deliberate opt-out |
| `demoBuilder.dataInstaller.apiBaseUrl` | **empty** | `https` only, ≤2048 chars, trailing slash stripped |
| `demoBuilder.datapackStore.apiBaseUrl` | the team's deployment | The datapack **library**: the team's own store, which answers the same catalog routes. Same URL rule. Its default is a path on a host the repository already publishes (the PDP overlay's), pinned by a test |

**Nobody has the URL set until they set it**, and that is the whole first-run story.
A fresh install has the feature enabled and pointed nowhere, so the wizard's
sample-data step refuses and the dashboard tile is hidden
(`isDataInstallerConfigured()` gates it). Both surfaces name the setting and offer an
**Open Settings** button rather than reporting a dead end — this was mistaken for a
bug on 2026-08-18.

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

## What agents are not given

Six read tools. Three groups are held back deliberately — the most reviewable
judgement in this feature:

- **Changing or deleting a pack.** The catalog is shared infrastructure with 23
  entries other teams depend on, `delete-datapack` cascades, there is no undo and no
  ownership guard. One agent typo removes a colleague's demo. Creating a NEW pack is
  offered in two ways, both of which only add: `start_datapack_export` and
  `load_datapack_zip`. Each needs the pack's name typed back, and loading a file
  never updates an existing pack in this catalog. The datapack library does have an
  ownership check, so updating your own pack is offered there.
- **`DELETE get-installed-datapacks`** — clears tracking without uninstalling
  anything. Its only effect is to make the tracking lie.
- **`async-process-status`** — reports `in_progress` for jobs that finished hours
  earlier, so an agent polling it would wait forever.

## Stage 3 (export)

Implemented (`handlers/exportHandlers.ts`, `services/dataInstallerExportClient.ts`). A
probe on 2026-08-14 found it authenticating and connecting but storing nothing
("MongoDB connection URI required"). That investigation is in
[`.rptc/research/data-installer/stage-3-export-probe-2026-08-14.md`](../../.rptc/research/data-installer/stage-3-export-probe-2026-08-14.md),
and it read the cause as the deployment's configuration.

**Corrected 2026-10-01, with the service's source in hand**
(`Adobe-CoreTech/dsc-data-installer-api`, internal): the deployed export action DOES carry
its database address. The service's `buildContext()` builds the processor context from a
fixed field list that omits every `MONGO_*` input, and every export processor asks that
context for the address. One line fixes it; the proof and the prepared patch are recorded in
`.rptc/plans/datapack-store/overview.md`. The service also has active maintainers (merges in
July and September 2026), so "blocked indefinitely" in older notes is out of date.

A dated finding about a service we do not own — re-verify before relying on it.

## The library in the catalog

The Data Installer screen's catalog shows both stores: one request
(`find-datapacks` with `includeLibrary`) returns the Data Installer's packs and then
the library's, each library row tagged `store: 'library'`. Cards are grouped by store
AND name, so a library pack never folds into a Data Installer pack of the same name.
A library card is tagged "Library", or "Yours" when the SC owns it — the library says
so itself (`mine`), because only it knows the caller's verified email.

A library pack's flyout offers Import, Save as file and, when it is yours, Remove.
Demo Builder's engine (the default) installs it straight from the library; agents pass
`source: "library"` to `validate_datapack_import`, `start_datapack_import` and
`reset_datapack`. With the service engine chosen, which installs only from its own
catalog, the flyout offers Copy to the Data Installer in place of Import
(`copy-library-datapack-to-installer` / `copy_library_datapack_to_installer`). The copy
writes into the shared catalog, so it carries the load's guards — the pack name sent
back, an existing pack never overwritten — and it cannot be undone from the extension.
If the library cannot be reached, the Data Installer's packs still show, with a line
saying why the library's are missing. Agents get the same through `find_datapacks`
(`store`, `includeLibrary`) and `get_datapack` (`store`).

## Datapack files (save to a zip, load from one)

Neither the service nor the datapack library has a file form, so the zip is built and
read in the extension (`services/datapackZip.ts`) and works the same for both stores:

```
<name>-<version>.datapack.zip
  datapack.json            name, version, display name, description, data types,
                           which store it came from, when; plus a format marker
  data/<data_type>.json    one per data type: the rows, as the store holds them
```

A zip whose files sit under one root folder reads the same.

| | Panel | Agent tool |
|---|---|---|
| Save a pack from either store | "Save as file" in a pack's flyout, and after an export | `save_datapack_zip` |
| Remove your own library pack | "Remove it from the library" in its flyout | `delete_library_datapack` |
| Install a library pack | "Import" in its flyout | `start_datapack_import` with `source: "library"` |
| Put a library pack in the Data Installer's catalog (service engine only) | "Copy to the Data Installer" in its flyout | `copy_library_datapack_to_installer` |
| See what a file holds, writing nothing | the first step of "Load from file" | `open_datapack_zip` |
| Write it into a store | "Load from file", library by default | `load_datapack_zip` |
| Undo a load into the library | "Remove it from the library", in the load result | `delete_library_datapack` |

Loading puts a pack in a store; installing it into Commerce is still Import. Each data
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
  A skipped step stays in the pack's flyout on the Data Installer screen, with its own Check.
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
