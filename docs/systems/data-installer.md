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

## Credentials: three sources, in precedence

| | Source |
|---|---|
| 1 | the pair declared on the `adobe-commerce-accs` component |
| 2 | the shared credential service (`get-commerce-credentials`) |
| 3 | nothing — the operation refuses, and offers Console provisioning only where that could succeed |

**A declared pair always wins**, so a project that has one is unaffected by source 2
existing. Source 2 exists because the pair can only be *created* inside an Adobe I/O
workspace, and a demo project selecting no App Builder components never gets one — it
could browse the catalog and never import.

**The brokered pair is never persisted** ([ADR-014](../architecture/adr/014-data-installer-shared-credential.md)).

## The contract, as measured

**`operation_mode` is one of four**: `import`, `validate`, `delete`, `export`.

The important part is how a wrong one fails: **an unknown mode answers `200` with an
empty processor list — it never returns 400.** So the readable signal is the
processor count, not the status code. Nine candidates plus a deliberate nonsense
string all behaved identically, which is what makes the four real answers mean
something.

**The service derives the site type; nothing sends it.** `buildBody` uploads only
`commerce_instance` and the credential pair, so classification is server-side
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

Implemented (`handlers/exportHandlers.ts`, `services/dataInstallerWriteClient.ts`). A
probe on 2026-08-14 found it authenticating and connecting but returning nothing,
with a root cause in the service's own infrastructure rather than in this extension.
That investigation is in
[`.rptc/research/data-installer/stage-3-export-probe-2026-08-14.md`](../../.rptc/research/data-installer/stage-3-export-probe-2026-08-14.md).

A dated finding about a service we do not own — re-verify before relying on it.

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
| See what a file holds, writing nothing | the first step of "Load from file" | `open_datapack_zip` |
| Write it into a store | "Load from file", library by default | `load_datapack_zip` |

Loading puts a pack in a store; installing it into Commerce is still Import. Each data
type is one `add-data-item` request, so a type too large for one request is refused by
name and the others still land. An agent's paths must be inside the open project; the
panel uses VS Code's own dialogs.

**Not yet reversible from the extension:** nothing deletes a library pack, so a load
into the library cannot be undone here. That is a reversibility gap, recorded rather
than hidden.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Two matter here: the
credential pair is served and never persisted, and a destructive tool refuses without
`confirm: true` — which is why the delete scoping above is proved rather than
asserted.
