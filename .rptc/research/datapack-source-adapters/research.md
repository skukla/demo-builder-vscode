# Datapack sources as adapters

Researched 2026-11-05, at `ea6121e21` on `fix/release-walk-fixes`. Asked by the owner: the Datapacks
feature should be the glass over whichever data source is on, with each source an adapter, so an SC
sees little difference between a pack from Demo Builder's store and one from the Data Installer.
How close are we, and could the sources become one easy-to-read setting that allows either or both?

Backlog: [[DI-12]].

## The short answer

- **Reading is already adapter-shaped.** Demo Builder's store answers the same catalog routes as the
  Data Installer (`dataInstallerHandlers.ts:96`), both go through one `DataInstallerClient`, and the
  UI draws one merged list (`catalogLibraryRows.ts` `mergedCatalog`).
- **Acting is not.** The screen decides what a pack allows by asking which store it came from, at
  18 sites, instead of asking the pack what it can do.
- **Installing is a second axis.** `demoBuilder.dataInstaller.engine` (Demo Builder's or the
  service's) is separate from where a pack lives, and 14 sites branch on the two together. This is
  where "Copy to the Data Installer" and two Create routes come from.

## How the sites were found

Two greps over `src/features/data-installer` and `src/features/project-creation/ui`, comments
excluded:

1. A store or engine compared by name: `store ===/!== 'library'|'installer'`,
   `=== 'library'|'installer'`, `engine ===/!== 'service'|'demo-builder'`, `installsFromLibrary`.
   **58 sites.** (The figure given in chat earlier, 48, came from a narrower pattern that missed
   the bare `=== 'library'` comparisons; this is the complete one.)
2. Ownership read beside a store: `.mine` / `.team`. **4 more sites** in the UI that decide what a
   pack shows (the rest are parsing and grouping, not decisions).

**62 decision points**, 31 in the webview and 31 in the extension host.

Control: the first grep finds `PackActions.tsx:70` (Share on the SC's own pack), a site known to
branch on the store, so the pattern reaches the code it is meant to.

## What each kind of decision is

| Kind | Sites | What it decides | In an adapter world |
|---|---|---|---|
| **Capability** | 18 | Whether a pack can be shared, renamed, removed, saved into, updated from a file, undone | The source declares it per pack; the screen reads the flag |
| **Install path** | 14 | Import or Copy to the Data Installer, which Create route, the settings layer, refusing a library pack under the service engine | Disappears if the engine becomes automatic (see open question 1) |
| **Routing** | 13 | Which address, client and reads serve a pack; falling back to the other store | Stays as it is: one client and one access function, keyed by source |
| **Label** | 9 | The tag, Owner, Visible To, wording naming a store | The source describes itself; the screen prints it |
| **Validation** | 3 | A payload's store is one of the two | Stays |
| **View** | 2 | Recommended takes the Data Installer's curated packs; an empty view's words | Stays: a source is a fair facet to filter by |
| **Availability** | 2 | The Data Installer choice when it did not answer | Stays, generalised to "a source that did not answer" |
| **Install tracking** | 1 | The installed check reads the service's list for its packs | Moves into the source |

So 32 sites (capability, install path) are the ones that make the screen treat the two sources
differently, 10 (label, install tracking) move into the descriptor, and 21 (routing and the rest)
stay as they are.

## Every site

`W` = webview, `H` = extension host. Paths under `src/features/data-installer/`.

### Capability (18)

| # | Where | Side | Decides |
|---|---|---|---|
| 1 | `ui/components/PackActions.tsx:70` | W | Share and Stop Sharing only on the SC's own store pack |
| 2 | `ui/components/PackActions.tsx:130` | W | The store flag the menu's rows are built from |
| 3 | `ui/components/PackActions.tsx:167` | W | Remove Datapack only on the SC's own store pack (ownership grep) |
| 4 | `ui/components/DatapackPanelTitle.tsx:23` | W | Rename in place only on the SC's own store pack |
| 5 | `ui/hooks/useHeldPack.tsx:53` | W | Save Changes only on the SC's own store pack (also needs Demo Builder's engine) |
| 6 | `ui/hooks/useCatalogShow.ts:54` | W | A removed card is hidden only for store packs |
| 7 | `ui/components/LoadDatapackFileModal.tsx:103` | W | Loading a file may update a pack only in the store |
| 8 | `ui/components/LoadDatapackFileModal.tsx:104` | W | Loading into the Data Installer asks for the pack's name back |
| 9 | `ui/components/LoadDatapackFileModal.tsx:112` | W | A load can be undone only when it created a store pack |
| 10 | `ui/components/LoadDatapackFileModal.tsx:215` | W | Which choices the load offers per target |
| 11 | `handlers/datapackZipHandlers.ts:339` | H | The Data Installer refuses an update from a file |
| 12 | `handlers/datapackZipHandlers.ts:353` | H | The Data Installer needs the confirming name |
| 13 | `handlers/catalogLibraryRows.ts:37` | H | The SC's own store pack is always listed, so it can be removed |
| 14 | `handlers/dataInstallerHandlers.ts:417` | H | The shared-in-a-project-file warning exists only for store packs |
| 15 | `handlers/privatePackPrompt.ts:52` | H | Only a store pack can be private and offered for sharing |
| 16 | `handlers/privatePackPrompt.ts:76` | H | The same, for the project's own pack |
| 17 | `services/sharedInFiles.ts:78` | H | Only store packs are recorded as shared in a file |
| 18 | `services/arrivingPack.ts:41` | H | A private store pack arriving with a project is flagged |

### Install path (14)

| # | Where | Side | Decides |
|---|---|---|---|
| 19 | `ui/components/PackActions.tsx:49` | W | Prop: the engine installs from the store |
| 20 | `ui/components/PackActions.tsx:124` | W | The same, read |
| 21 | `ui/components/PackActions.tsx:166` | W | Import shows unless a store pack meets the service engine |
| 22 | `ui/components/PackActions.tsx:176` | W | Copy to the Data Installer for a store pack under the service engine |
| 23 | `ui/components/DatapackDetailPanel.tsx:78` | W | Prop, passed through |
| 24 | `ui/components/DatapackDetailPanel.tsx:106` | W | Prop, passed through |
| 25 | `ui/components/DatapackDetailPanel.tsx:146` | W | Prop, passed through |
| 26 | `ui/views/DatapackCatalogView.tsx:372` | W | The prop's value, from the engine |
| 27 | `ui/components/CatalogHeaderActions.tsx:66` | W | Create Datapack: Save As with Demo Builder's engine, the service's export otherwise |
| 28 | `ui/components/create-flow/datapackFlowStages.ts:89` | W | The Create flow's route by engine |
| 29 | `ui/hooks/useHeldPack.tsx:50` | W | The held pack's store is the SC's to save into only with Demo Builder's engine |
| 30 | `services/sampleDataInstallDeps.ts:90` | H | A store pack under the service engine needs copying first |
| 31 | `handlers/importHandlers.ts:379` | H | The same, on Import |
| 32 | `services/settingsLayer.ts:91` | H | A settings layer applies only with Demo Builder's engine |

### Routing (13)

| # | Where | Side | Decides |
|---|---|---|---|
| 33 | `ui/components/importModalJob.ts:16` | W | The import request names a store pack's source |
| 34 | `handlers/dataInstallerHandlers.ts:110` | H | Which address and sign-in a store uses |
| 35 | `handlers/dataInstallerHandlers.ts:377` | H | List the store alone |
| 36 | `handlers/dataInstallerHandlers.ts:378` | H | List the Data Installer alone |
| 37 | `handlers/dataInstallerHandlers.ts:402` | H | Tag a detail with its store |
| 38 | `handlers/packSave.ts:60` | H | Read the held store pack to save into it |
| 39 | `services/sampleDataInstallDeps.ts:81` | H | Read the pack from the store that holds it |
| 40 | `services/buildDatapackEngine.ts:58` | H | The store must be readable from here |
| 41 | `services/buildDatapackEngine.ts:61` | H | Read the pack's rows from the store |
| 42 | `services/recordedPack.ts:95` | H | A recorded pack outside the store is looked up elsewhere |
| 43 | `services/recordedPack.ts:168` | H | Try the recorded store first, then the other |
| 44 | `services/recordedPack.ts:174` | H | Which store answered |
| 45 | `services/sampleDataInstall.ts:226` | H | The install request names a store pack's source |

### Label (9)

| # | Where | Side | Decides |
|---|---|---|---|
| 46 | `ui/catalogShow.ts:24` | W | A pack's source: team, yours or community for store packs |
| 47 | `ui/catalogShow.ts:25` | W | Team before yours (ownership grep) |
| 48 | `ui/catalogShow.ts:26` | W | Yours or community (ownership grep) |
| 49 | `ui/components/DatapackDetailPanel.tsx:282` | W | Owner: the Data Installer's owner field, else "You" |
| 50 | `ui/components/DatapackDetailPanel.tsx:283` | W | "You" for the SC's own (ownership grep) |
| 51 | `ui/components/DatapackDetailPanel.tsx:288` | W | Visible To: "Only you" for a private store pack |
| 52 | `ui/components/LoadDatapackFileModal.tsx:183` | W | The load result's title names the Data Installer |
| 53 | `handlers/datapackZipHandlers.ts:91` | H | Wording: "the datapack library" or "the Data Installer" |
| 54 | `services/recordedPack.ts:59` | H | Which store's "not reachable" sentence |

### Validation (3), View (2), Availability (2), Install tracking (1)

| # | Where | Side | Kind | Decides |
|---|---|---|---|---|
| 55 | `handlers/storeChangesHandlers.ts:98` | H | Validation | A payload's source is one of the two |
| 56 | `handlers/recordedPackHandlers.ts:51` | H | Validation | The same, for a recorded pack |
| 57 | `handlers/importHandlers.ts:437` | H | Validation | The same, for an import |
| 58 | `ui/catalogShow.ts:79` | W | View | Recommended takes the Data Installer's curated packs only |
| 59 | `ui/components/DatapackCatalogGrid.tsx:74` | W | View | An empty Show choice's words |
| 60 | `ui/catalogShow.ts:58` | W | Availability | The Data Installer choice only once it answered |
| 61 | `ui/hooks/useCatalogShow.ts:75` | W | Availability | Fall back when that choice goes away |
| 62 | `ui/components/DatapackCatalogGrid.tsx:34` | W | Install tracking | The installed check reads the service's list for its packs |

## What the house conventions point to (checked 2026-11-05, at the owner's ask)

The adapter pattern is not the house answer here. Four existing conventions are, and together they
are smaller than a class per source:

| Convention | Where it is stated | What it says for this |
|---|---|---|
| **Behaviour is data, not code** | Handbook §4: "Prefer a row in a registry to a new class" | What differs between the sources is mostly facts: a label, a tag, which actions a pack offers, whether a file load can update or be undone. Those are fields on a row, not methods |
| **One descriptor, named in one place** | ADR-025 and `features/ai/engine/agentEngine.ts`: "nothing outside this directory names an engine. A caller asks for the descriptor and reads the field it needs" | The same shape for sources: a `DatapackSourceDescriptor` per source, and nothing outside its module compares a store by name. This is the precedent for the 27 capability and label sites |
| **An interface where behaviour really differs** | `services/datapackEngine.ts`: two engines behind `DatapackEngine` "so the screens neither know nor care which one ran" | Already in place for installing. Nothing new is needed on that side unless the service engine is kept and made automatic |
| **An abstraction needs two implementations** | Handbook: "An abstract class has at least two implementations" | Two sources would satisfy it, but routing already runs through one client and one `resolveDataInstallerAccess(context, store)` call. A class per source would wrap code that does not differ in kind, only in address |

## What the target looks like

A descriptor per source, abilities on each row, and the engine interface that already exists:

- **`DatapackSourceDescriptor`** (one module, two rows): `id`, `label`, `tag`, the actions its packs
  can offer (`share`, `rename`, `remove`, `saveChanges`, `updateFromFile`, `undoableLoad`), whether
  a load needs the name confirmed, and how its owner and visibility read. This module is the only
  place that names a store, as `agentEngine.ts` is the only place that names an agent.
- **Abilities on every catalog row and detail**, computed on the host from the descriptor and the
  row's ownership: `canShare`, `canRename`, `canRemove`, `canSaveChanges`, plus `owner` and
  `visibleTo` text. The 18 capability sites and 9 label sites read these, so the webview stops
  naming stores.
- **Routing stays a function keyed by source.** The 13 routing sites keep calling
  `resolveDataInstallerAccess(context, store)`; they are not wrapped in classes.
- **The engine stops being a choice the SC makes.** See open question 1.
- **The setting** (part 2 of the item): a "Datapack Sources" group: Demo Builder Datapacks, always
  on (its address), then the Data Installer's address and its checkbox (exists since 2026-11-05:
  `demoBuilder.dataInstaller.enabled`). See open question 2 for why the store has no box. VS Code's array setting with enum items could hold the
  choice as one value, but its editor is an add-and-remove list, harder to read than two boxes.

## Open questions for the owner

1. **Does the service engine still need to exist?** Since 2026-10-27 the service ignores the
   Commerce credentials a caller sends, so it installs nothing for us (`dataInstallerConfig.ts`,
   `selectedDatapackEngine`), and Demo Builder's engine already installs Data Installer packs by
   reading them (`sampleDataInstallDeps.ts:81`). If the service engine is deleted rather than made
   automatic, the 14 install-path sites go with it, along with Copy to the Data Installer, the
   service's Create route and the Engine setting. Under "no soft deprecation" that would be a
   deletion, not a hidden option.
2. ~~May an SC turn Demo Builder's own store off?~~ **Answered (owner, 2026-11-05): at least one
   working source must power the Datapacks feature, and Demo Builder's store is the only place an
   SC can save a pack** until the Data Installer's owners let outside tools write to it. So the
   store stays on, with no checkbox; the Data Installer keeps its box. The "Datapack Sources" group
   shows the store's address and the Data Installer's address and checkbox, and the both-off screen
   is not needed.

## Effort

Working days of agent time, each with the owner's review and a live check. The ranges are wide
because open question 1 changes the size of the largest part.

| Part | Days | What it covers |
|---|---|---|
| Plan and the descriptor | 0.5 | The descriptor's fields, the abilities on a row, the answer to question 1 |
| Host: the descriptor and the abilities | 1 | Capability and label sites on the host read the descriptor; abilities computed per row. Routing is left as it is |
| The engine | 0.5 to 1.5 | Deleting the service engine (smaller, mostly removal) or making it automatic (larger: three install paths and their tests) |
| Webview: read abilities, not store names | 1 | 31 webview sites; the flyout, the card, the load dialog, Save Changes |
| The sources setting | 0.25 to 0.5 | Grouping and ordering in Settings, the Engine setting's removal or rewording, agent wording, the AI bundle's two skills (an `AI_CONTEXT_VERSION` bump) |
| Tests and a live round trip on both sources | 1 | Load, share, install and remove from each source, and with each one off |
| **Total** | **4.5 to 5.5** | About a working week, plus review between parts |

Not counted: the visual check on the screens it touches, and any walk findings, which on this
release added roughly a third again.
