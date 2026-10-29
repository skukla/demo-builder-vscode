# Datapacks through project export, import and copy

**Date:** 2026-10-29
**Type:** Codebase trace (read-only), worktree `loop/release-candidate` at `1290ce451` (beta.152).
**Asked by:** the owner wants datapacks to travel with a project through export, import and copy in beta.153.
**Prior research read:** `.rptc/research/project-import-export/research.md` (2026-09-11, before the v2
file existed: its "datapack is not on SettingsFile" is no longer true), `.rptc/plans/portable-demos/`
(D24, D26, D31), `.rptc/plans/datapack-engine/` (overview, steps 02, 03, 05, 07, 08, 09, 10, 13).

Labels: **Code** = what the code does. **Plan** = what a plan or decision says. **Inferred** = my
reading, not run. **Open** = needs the owner or a live test.

## 1. Every door, and the file it uses

All doors write or read ONE typed file, `ProjectFile` (`src/types/projectFile.ts:190-219`), version 2
(`:50`). There is one writer and one reader.

| Door | Writes / reads | Where |
|---|---|---|
| Export, projects list kebab and dashboard (save dialog) | writes `<name>.project.demo-builder.json` | `projectsListTransfer.ts:65-96` → `settingsTransferService.ts:268-325` → `createExportSettings` (`settingsSerializer.ts:189-192`) |
| `export_project_settings` (agent) | same file, inside the project dir | `actionDescriptors.ts:1057-1076` → `settingsTransferService.ts:345-392` |
| Import from file (projects list) | reads the JSON, opens the wizard in import mode | `projectsListTransfer.ts:25-34` → `settingsTransferService.ts:68-119` → `readProjectFile` |
| `create_project_from_file` (agent) | reads the JSON (1 MB cap), creates headlessly | `createProjectFromFileTool.ts:46, 51-68, 216-269` |
| Copy from Existing (projects list) | builds the export in memory and reads it back | `settingsTransferService.ts:163-232`, `copySeedFromProject` (`settingsSerializer.ts:155-157`) |
| `copy_project` (agent) | same seed, headless creation | `copyProjectTool.ts:65-93` |
| Edit (dashboard) | same seed plus the project's own configs and storefront | `extractSettingsFromProject` (`settingsSerializer.ts:170-174`) |
| Export "Send a file", `export_demo_bundle` | zip: `setup.demo-builder.json` (the same `ProjectFile`) + `storefront/` (repo archive + `demo.demo-builder.json`). EDS only; setup alone writes the plain JSON | `demoBundle.ts:1-79`, `exportDemoBundleHandler.ts:33, 69-125`, `demoPackageTools.ts:151-170` |
| Import a bundle (projects list, `.zip`) | creates a GitHub repo from `storefront/`, adds the card, opens the wizard with the setup part | `importStorefrontZipHandler.ts:174-221`, `zipStorefrontImport.ts:83-112` |
| `add_shared_demo` with `zipPath` (agent) | the storefront half only; tells the agent to use the human Import for the setup | `addedDemoTools.ts:181-187, 218-219` |
| Save as demo package (`save_demo_package`, Share link) | writes `demo.demo-builder.json` (`SharedDemoDescription`) into the SC's own repo | `demoPackageHandlers.ts:185-200`, `describeProject` (`demoPackageService.ts:139-165`) |

**Typed and validated.** `ProjectFile` and `SharedDemoDescription` are TypeScript types. Their JSON
schemas are generated from the types (`scripts/generate-manifest-schema.js:30-46`), and
`tests/templates/manifest-schema-freshness.test.ts` fails when the committed schema drifts. The reader
validates with Ajv against the generated schema (`projectFileReader.ts:140-147`). Schemas are tolerant
of unknown fields on purpose (`generate-manifest-schema.js:10-14`). A v1 file migrates on read
(`:160-187`). The bundle's setup part goes through the same reader (`zipStorefrontImport.ts:88-93`).

## 2. What datapack state a project holds today

| State | Where | Shape | Typed / validated |
|---|---|---|---|
| `project.datapack` | manifest `.demo-builder.json` (`projectConfigWriter.ts:26-27`, `projectFileLoader.ts:97, 196`) | `{ name, version }`, no store, no engine (`base.ts:124`; manifest schema requires both) | yes |
| Install record, one per pack installed by Demo Builder's engine | `<project>/.demo-builder/datapacks/<name>@<version>.json` (`installRecord.ts:111-121`) | `{format:1, pack, engine:'demo-builder', startedAt, created:[{kind, id, previous?, key?, fingerprint?, wrote?}]}` (`:49-55`). Ids are the store's own | zod on read (`:89-104`); a bad file throws rather than guess (`:146-158`) |
| Where the pack lands | the backend's configs: `ACCS_WEBSITE_CODE` / `ACCS_STORE_VIEW_CODE` (PaaS has its own pair) (`sampleDataInstall.ts:53-85`) | codes; ids are read from the store at install time (`installTarget.ts:44-52`) | codes in configs |
| Setup-guide undo records (step 06) | on `appBuilderComponents[id].storePreparation` (`base.ts:311, 368`) | config values before and after | typed |
| Library packs | the team's library service, not the project. New ones are created `shared: false` (`datapackStoreWriter.ts:65-77`) | rows per kind | rows checked per kind at install (for example `productsKind.ts:40-55`) |
| Datapack zips | anywhere; the agent's save writes inside the project (`datapackZipHandlers.ts:171-180`) | `<name>-<version>.datapack.zip`: `datapack.json` + `data/<type>.json` (`datapackZip.ts:1-15, 82-101`) | manifest checked by hand; 256 MB cap (`:29, 104-118`) |
| Which engine removes a pack | derived: a record means Demo Builder's, else the service's (`buildDatapackEngine.ts:108-114`) | none stored (step 03 dropped `datapack.engine`: `step-03-wire-engine.md:20-23`) | n/a |

**Who sets and clears `project.datapack`** (Code):

| Writer | Meaning | Where |
|---|---|---|
| Wizard Datapacks step | the choice; creation then installs it (since `8ab56b934`, 2026-08-15) | `SampleDataStep.tsx:100, 144, 155, 161`; `executor.ts:158, 425-427`; `executorSampleDataPhase.ts:39-71` |
| Screen import accepted / reset | set on accept, cleared on reset | `importJobWatch.ts:226-249` |
| Save store changes | the new `-saved-` library version | `storeChangesHandlers.ts:121-126, 142` |
| Edit | removes the old pack, installs the new | `executorEditDatapack.ts:59-93` |
| `configure_project` | recorded only, NOT installed | `configureProjectTool.ts:133-138, 298-301` |
| Import / Copy seed | from the file; creation installs it | `useWizardState.ts:126-149`; `createProjectFromFileTool.ts:71-84`; `createProjectTool.ts:327-345` |

So the field means "the pack this demo's store holds" for most writers, but `configure_project` can make
it name a pack that was never installed. A project can also hold more than one install record, while
the field holds one pack.

**Where the pack is read from.** An install request can name its store (`ImportRequest.source`,
`dataInstallerWriteClient.ts:59-65`). Absent means the service (`engine.ts:70`). The creation install
builds its request with no `source` (`sampleDataInstall.ts:215-220`), and its inventory step asks the
service only (`sampleDataInstallDeps.ts:69-80`). The wizard lists service packs only: it never asks
for library rows (`SampleDataStep.tsx:64-77`; `dataInstallerHandlers.ts:370-398`).

## 3. What travels today, per door

| Door | `datapack` (name, version) | Where it lives | Install record | Rows | Store codes |
|---|---|---|---|---|---|
| Export JSON (human + agent) | yes (`settingsSerializer.ts:134`) | no | no | no | yes, inside `configs` |
| Import JSON (wizard) | seeded if it has a version (`useWizardState.ts:127-129, 149`); creation installs it | treated as the service | n/a | n/a | from the file; re-chosen in Business Structure |
| `create_project_from_file` | seeded and installed; reported in `applied` / `notApplied` (`createProjectFromFileTool.ts:81, 96, 117-119`) | treated as the service | n/a | n/a | the file's, unless `storeScope` is given (`:175-177`) |
| Copy (human + agent) | same as import | treated as the service | **not copied**: the new project gets a new folder, and no code copies `.demo-builder/` (grep found no copy of the folder) | n/a | the source's; the endpoint defaults to the source's (`:247`) |
| Edit | carried, and kept when the session never opened the step (`executor.ts:154-158`) | n/a | stays (same folder) | n/a | n/a |
| Demo bundle | yes, inside `setup.demo-builder.json` | no | no | **no** | yes |
| Save as demo package | yes, `{name, version}` (`demoPackageService.ts:159`) | no | no | no | no (codes are `configDefaults`) |

Tests pin the export carrying the reference (`settingsSerializer.test.ts:303-328`) and the from-file
and copy tools (`createProjectFromFileTool.test.ts`, `copyProjectTool.test.ts`).

### What goes wrong on arrival (Code unless marked)

1. **A library pack becomes unreadable.** Save store changes records a `-saved-` version that exists
   only in the library (`storeChangesHandlers.ts:124, 139-142`). A copy or import seeds it, then
   creation asks the service for it (`sampleDataInstall.ts:202`, `sampleDataInstallDeps.ts:74`). The
   read fails, the phase swallows the error, and the progress line says "Datapack could not be
   installed — …" (`sampleDataInstall.ts:238-246`, `executorSampleDataPhase.ts:92-101`).
2. **The screen and the build disagree.** An imported pack the service list lacks is still recorded,
   but no card shows as selected and None is not selected either (`SampleDataStep.tsx:120, 226-236`).
   The note explaining a missing pack appears only for an added demo's pack (`:215-221`), not for an
   imported file's.
3. **The demo package check gives wrong answers.** `datapackLookup` asks the SERVICE by NAME only
   (`demoPackageHandlers.ts:117-129`). A saved version of a service pack name gets "Colleagues can
   install the same sample data" when they can't (`demoPackageService.ts:297-302`). A library-only pack
   gets "isn't available to colleagues yet". The colleague's wizard then swaps in the default version,
   with a note (`SampleDataStep.tsx:96-100, 218`).
4. **A copy shares the original's store.** The copy keeps the source's endpoint and store codes
   (`createProjectFromFileTool.ts:247`; codes in `configs`), so creation installs the same pack into the
   same store. Demo Builder's engine leaves an existing SKU alone and does not record it
   (`productsKind.ts:8-10`), so the copy owns nothing it shows. Removing the original's pack removes
   what the copy shows. **Inferred:** a record file is written only when something is recorded
   (`installRecord.ts:179-206`, `engine.ts:76`), so an install that made nothing leaves no file. Then
   `engineThatInstalled` answers `service` (`buildDatapackEngine.ts:113`), whose removal "deletes every
   SKU the pack names" (`productsKind.ts:9-10`), the original's included. Test: install a pack onto a
   store that already holds all of it, and check whether the record file exists.
5. **Plan and code disagree.** D31 says "no install runs during creation" for an imported or added
   demo (`portable-demos/overview.md:67`; `shareable-demo/step-05-create.md:52`). The build installs
   (`executor.ts:425-427`).

## 4. What should travel, and what must not

**Must not travel**

| Thing | Why | Today |
|---|---|---|
| Install records | They name ONE store's ids. Removal deletes by id (`installRecord.ts:5-8, 218-220`), so on another store it would delete the wrong objects, and on the same store it would take the original's | not exported; Copy makes a new folder. Keep it that way, and pin it with a test |
| Setup-guide undo records | store values, same reason | not exported: the serializer derives only custom sources from `appBuilderComponents` (`settingsSerializer.ts:36-51`) |
| Store ids (website, store, root category) | per store | only codes travel; ids are read at install (`installTarget.ts:44-52`) |
| Credentials | D24 (`portable-demos/overview.md:60`) | `SECRET_ENV_KEYS` (`envVarKeys.ts:132-138`), stripped on export (`settingsSerializer.ts:189-192`) and on read (`projectFileReader.ts:219-222`). The register is enforced by `tests/sop/credential-env-vars-registered.test.ts`. **It covers `configs` only**: pack rows are not checked |
| Library sign-in or tokens | each reader uses their own sign-in; library reads are checked against the library's org (`datapack-engine/overview.md:147`) | none in the file |
| The engine choice | a setting each SC holds (`dataInstallerConfig.ts:46-49`, default `demo-builder` in `package.json:346`) | not in the file |

**Should travel**

| Thing | Status |
|---|---|
| Pack name and version | travels |
| **Which store holds it** (`installer` or `library`) | **missing**: the gap behind problems 1 and 3 |
| The pack it was made from, for a fallback | step 07 plans it (`step-07-demo-packs.md:24-26, 35-39`) |
| Store codes | travel inside configs; the receiver can change them (`storeScope`, Business Structure) |
| Step 09's settings pack | a library pack named for its catalog pack (`step-09-store-settings.md:12-16`); travels the same way as the main pack, once built |

**What an importer needs to rebuild the demo's data.** Either (a) the pack's identity, its store, and
the right to read it, or (b) the rows themselves. Which one depends on who the importer is:

| Importer | Can they read the reference? |
|---|---|
| The same SC, Copy on the same machine | yes, once the store is recorded |
| A colleague, service pack | yes (the service catalog is shared) |
| A colleague, library pack | **no today.** New packs are private (`datapackStoreWriter.ts:65-77`). The library is said to answer others "as if the pack did not exist": the code comment says so for delete (`:103-104`), and step 07 says so for reads (`step-07-demo-packs.md:31-34`). Step 07 plans "unlisted" |
| Someone outside the org, or without access to the shared services | no. That is who the bundle is for (`demoPackageTools.ts:156`) |

**Open:** step 08 customers may carry passwords or personal data in rows. Rows a person sends in a
bundle need the same "never a credential" rule, applied to rows, before customers ship.

## 5. Options

| | What | Reuses | Pros | Cons |
|---|---|---|---|---|
| **(a)** Reference only, with store | `DatapackReference` gains `store`; creation passes it as `ImportRequest.source`; step 07 adds the origin pack and copy-on-arrival | `DatapackReference` (`demoPackages.ts:227-230`), `ImportRequest.source`, `readPackItems` (`buildDatapackEngine.ts:46-55`), `readPackFromStore` + `writePackToStore` (`datapackTransfer.ts:35-115`) | small; files stay small; follows the owner's step 07 choice (`step-07-demo-packs.md:23-29`); fixes Copy at once | colleagues need "unlisted" (a library deploy, owner's go); outsiders get nothing |
| **(b)** Rows inside the project JSON | the file carries rows | none cleanly | self-contained | breaks the 1 MB cap (`createProjectFromFileTool.ts:46`; one item alone read 357 KB, `library-audit.md:37`); Edit and Copy serialize the whole file on every open (`settingsSerializer.ts:155-173`); rows are untyped in a typed file; **owner already rejected it** (`step-07-demo-packs.md:27-29`) |
| **(c)** Bundle carries the pack; JSON carries the reference | the bundle gains `datapack/<name>-<version>.datapack.zip`, made by `buildDatapackZip` unchanged; import writes it into the importer's library, then installs from there | `buildDatapackZip` / `readDatapackZip` (`datapackZip.ts:82-207`, cap included), `writePackToStore`, the load path in `datapackZipHandlers.ts`, the bundle part list (`demoBundle.ts:26-39`, `ExportDemoBundleRequest` `webviewRequests.ts:313-319`) | works for anyone; older builds ignore the part (the bundle reader keeps only `storefront/` when one exists, `zipStorefrontImport.ts:100-112`) | EDS only today (`exportDemoBundleHandler.ts:33, 86-87`); the bundle's setup part has no agent door (`addedDemoTools.ts:218-219`); the library write on import must be confirmed and undoable |

**Recommendation: (a) for every door, plus (c) as an optional "sample data" part of the bundle.**

For beta.153, in this order:
1. **(a) minimum.** Add `store` to the reference. Record it wherever `project.datapack` is written
   (`importJobWatch.ts:236`, `storeChangesHandlers.ts:124`, `SampleDataStep.tsx`,
   `executorEditDatapack.ts:90`, `configureProjectTool.ts:136`). Pass it in the creation request
   (`sampleDataInstall.ts:215-220`), and have inventory read the same store
   (`sampleDataInstallDeps.ts:69-80`). Same-machine Copy is fixed by this alone.
2. **Say so when a pack can't be read.** Use one line on the Datapacks step for an imported file too,
   not just an added demo (`SampleDataStep.tsx:215-221`), and show the recorded pack as selected.
3. **Demo package check:** ask both stores by name AND version (`demoPackageHandlers.ts:117-129`).
4. **(c)** if the owner says yes. Note that the owner's "reference, not the whole pack" choice was about
   the project file, so the bundle is a separate question.
5. Step 07's "unlisted" library change, so colleagues can read a library reference (library deploy,
   owner's go).

**Existing projects (rule 3).** A recorded pack with no `store` reads as the service, as today
(`engine.ts:70`). Packs saved before this change are library versions with no store recorded. Resolve
them on export by asking the library, then the service. `describer` already reads that way
(`storeChangesHandlers.ts:72-86`). No migration needed.

**Decisions for the owner**
- Should the bundle carry rows (c)?
- **A copy onto the same store:** recommend skipping the creation install and saying "Already in this
  store", rather than leaving a second project that owns nothing.
- Should an install that creates nothing still write a record, so removal goes through the right
  engine? Recommended, after the test in §3 point 4.
- Should `store` ship before "unlisted" lands? Recommended: yes. It fixes Copy and service packs now.

## Hit every surface

1. **Webview bundles:** wizard (`SampleDataStep`), projectsList (Import), dashboard (`ShareFileForm.tsx`
   for a bundle part), dataInstaller (step 07's "shared in a file" warning).
2. **Creation vs regenerate, applied here:** wizard creation, headless creation, Edit and Copy all meet
   in `executeSampleDataPhase` (`executor.ts:425-427`, `executorEditDatapack.ts:93`), so pass `source`
   there once.
3. **AI-bundle gate:** does not apply. No AI bundle change.
4. **Human vs agent:** export, from-file and copy tools exist. A bundle's setup part, and any data part,
   has no agent door (`addedDemoTools.ts:218-219`). Adding (c) without one widens the gap.
5. **A field in three places:** the type, generated schemas and the agent tool's input.
   - **The type:** the datapack shape is written inline at least six times: `base.ts:124`,
     `projectFileLoader.ts:97`, `webview.ts:139`, `webviewRequests.ts:389`, `sampleDataInstall.ts:62`,
     `configureProjectTool.ts:298-301`. Then there are `DatapackReference` (`demoPackages.ts:227`) and
     `DatapackId` (`data-installer/types.ts:17-20`). One type first, then add `store`.
   - **The schemas:** regenerate `manifest`, `project-file` and `shared-demo` (`npm run
     generate:manifest-schema`).
   - **The agent tool's input:** the `configure_project` zod schema.
   - **No JSON registry** is involved.
6. **Mocks:** fixtures of `project.datapack` and `ImportRequest` in `settingsSerializer.test.ts`,
   `createProjectFromFileTool.test.ts`, `copyProjectTool.test.ts`, `demoPackageService.test.ts`, and the
   sample-data install tests.
7. **Docs:** the tool descriptions. `create_project_from_file`'s description omits the datapack, while
   its docstring lists it (`createProjectFromFileTool.ts:12-14, 288-292`). Also
   `docs/systems/mcp-tools.md`.

## Found on the way

- **Deleting a project strands its data (rule 1).** Delete removes the project folder, install records
  included (`projectFilesDeletion.ts:55-61, 80`), and the delete confirmation offers nothing for sample
  data. The confirmation code mentions datapacks nowhere; as a check, the same grep found
  `CleanupOptions` 5 times in `deletionConfirmation.ts`. After that, Demo Builder's engine can never
  remove that pack's objects. Step 07 plans "Also delete its pack" for the library pack, not for the
  store data.
- **False comments.** "Recorded, not applied … never happens inside the wizard" (`base.ts:119-123`),
  "IMPORTED from the dashboard afterwards" (`webview.ts:133-137`), and "It does not import … the
  dashboard installs it afterwards" (`SampleDataStep.tsx:4-11`). Creation has installed the pack since
  `8ab56b934` (2026-08-15). The comments are right that the step itself does not import. They are
  wrong about creation.
