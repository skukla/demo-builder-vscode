# Import creates the project; Save as Package makes the template

Backlog: EDS-72. Owner, 2026-11-18 (beta.153 walk, U3.1): in beta.153.

## What the SC gets, after this

| The SC wants | Door | Gets |
|---|---|---|
| this demo, reusable: a card to build new projects from | Project dashboard, **Save as Package** (new) | a card on their own Welcome step |
| to hand this demo to a colleague as a reusable package | Share Demo, **Send a Link** | a link that adds the card on the colleague's Welcome step |
| to hand this project over | Share Demo, **Send a File**, then **Import from File** | the project itself: no template repository, no card |

Send a Link loses its **Add to My Welcome Step** box (owner: Share Demo is not the place for it).

## What the code does today (research, 2026-11-18)

- Creation has one source shape: `templateOwner`/`templateRepo`, from the catalog brand or an
  added-demo card (`storefrontResolver.ts:62-75, 139-154` → `edsConfigFromStorefront.ts:32-44` →
  `storefront-setup-start`, `webviewRequests.ts:767-808`). Phase 1 makes the project's repository
  in three ways: pre-created, existing plus reset, or new from the source (`storefrontSetupPhase1.ts:42-100, 380-416`).
- The bundle carries the storefront's files and the setup file, and only a POINTER to the sender's
  DA.live site (`demoBundle.ts:53-78`); content is copied from that published site and does not
  need the source repository (`edsPipeline.ts:311-346`). EDS-72's line "the bundle carries the
  content" is wrong and is corrected there.
- Reset restores code from `templateOwner`/`templateRepo`, `project.demo` first, then the catalog
  (`edsResetParams.ts:315-375`), and refuses when an added demo's source repository is gone
  (`resetSourceDecision.ts:34-39`).
- Import mode seeds the wizard from `importedSettings` (`useWizardState.ts:134-149`); the grid
  can show the project's own row without remembering it (`useWizardCatalog.ts:105-108`).
  Nothing skips or locks the Welcome step today.
- The agent door `create_project_from_file` reads JSON only (`createProjectFromFileTool.ts:54-71`):
  a bundle zip fails there today, and it drops `file.demo`.
- After creation, `project.demo` is read by the on-open source check, Change Source, the
  boilerplate base and the storefront report; `templateOwner/Repo` metadata by the update check.

## Decisions (owner, 2026-11-18: all four as recommended)

1. **What a reset of an imported project restores.** Decided: the project as it was imported.
   The import's commit in the project's own repository is recorded (`importedFrom.commit`), and
   reset puts the code back to it. The files are already in that repository's history, so no
   template repository is needed and the colleague's custom code survives. Rejected: resetting to
   the brand the demo was built on (throws the sender's code away).
2. **The wizard on an import.** Decided: the Welcome step shows only the demo being imported,
   chosen and fixed (no packages grid), under the project name; the title stays Import Project.
3. **What the imported project records as its demo.** Decided: no `project.demo` (there is no
   card); `selectedPackage` keeps the brand the sender built on (the setup's own, which
   `setupForCard` overwrites today), so updates, the boilerplate base and the report read it as a
   brand project; `importedFrom` records the import (bundle name, sender's repository for
   provenance, the import commit).
4. **Save as Package's window.** Decided, on the Share row: Name and Description (prefilled as the link step's
   are), **Save as Package**; once saved, the window is the house result ("Package Saved",
   "Scratch 1028 is on your Welcome step"). A project already saved shows **Remove Package**,
   which takes the card off the Welcome step and the description file out (the link step's undo,
   moved here).

## Phases

### 1. Save as Package, and Send a Link without the box (small; dashboard only)

- Dashboard Share row, beside Share Demo: **Save as Package**, opening a Steps
  window. It calls `saveDemoPackage` with `addToWelcome: true`; Remove Package calls
  `removeDemoPackage`. Agents: `save_demo_package` already does this; its description says so.
- Send a Link: the box goes. Its save writes the description file and leaves the card as it is
  (`addToWelcome` omitted means "do not touch the list": a handler change, tested). Remove the
  Details moves to Save as Package.
- Tests: the window, the handler's untouched-list case, the link step without the box.

### 2. Import creates the project (the large part)

- **Hold the bundle at the host.** `importDemoBundle` no longer creates a repository or a card.
  It reads the zip, keeps the bundle's path for the wizard it opens (on the `createProject`
  command instance, beside `importedSettings`; the files never cross to the webview), and seeds
  `importedSettings` with an `importedFrom` marker and the setup's own `selectedPackage`.
- **A third source kind in creation.** `StorefrontSetupStartPayload`/`edsConfig` gains
  `bundleSource` (the field list, the type, the rehydration step: all three). The phases guard
  (`storefrontSetupPhases.ts:394-407`) accepts it in place of a template. Phase 1 gains a branch:
  `createRepositoryFromZip` into the project's own repository, with options for no template flag
  and the namespace. Guard the other template readers: the wizard's Create Repository button
  (`useRepoCreation.ts:105-115`, `RepoSelectionInline.tsx:252`), the block-library fallback
  (`edsPipeline.ts:520-521`), `resolveTemplateCommitSha` (`executorEdsPhase.ts:117-122`), the
  instance metadata (`:149-161`).
- **Record and reset.** Creation records `importedFrom.commit` (the push's commit). Reset reads
  it first (`edsResetParams.ts`): restore the project's own repository to that commit
  (`resetRepoToTemplate` from its own repository); otherwise as today.
- **The wizard.** Import mode with `importedFrom`: the Welcome step shows the imported demo alone,
  fixed; no `rememberAddedDemo`.
- **Agent door.** `create_project_from_file` accepts a bundle zip through the same path, and
  passes the setup on whole.
- **Readers of `project.demo`.** With none recorded, each falls back to the catalog brand
  (selectedPackage) as for a brand project; check the on-open source check stays quiet.
- Tests: creation from a bundle (phase 1 branch, recorded commit), reset of an imported project,
  the wizard's fixed Welcome step, the agent door with a zip, and the existing import-a-card
  tests moved to Add a Demo Package's zip door, which keeps the template path.

### Agents can do every one of these (each phase, not a phase of its own)

Every action a button gains or changes, an agent gets through the same handler (owner,
2026-11-18). Each tool change follows `mcp-tool-authoring`: the input schema from the handler's
payload type, `readOnly`, a narration phrase, consent copy for a write, the count pins, and
`docs/systems/mcp-server.md`.

| Action | Button | Agent tool | Change |
|---|---|---|---|
| Save as Package | dashboard, new | `save_demo_package` (`demoPackageTools.ts:72`) | its description leads with Save as Package (a card on your own Welcome step); `addToWelcome` stays, default true, so today's callers are unchanged |
| Remove Package | Save as Package window | `remove_demo_package` (`:120`) | description names Remove Package; behaviour unchanged |
| Send a Link | Share Demo | `save_demo_package` with `addToWelcome:false`, then `get_demo_package_preview` for the link | the handler's new "leave the list as it is" case: an omitted box from the link step must not take a card off; the tool keeps its explicit true/false |
| Send a File | Share Demo | `export_demo_bundle` (`:151`) | none (already path-based) |
| Share Datapack | Share Demo's notice | `share_datapack` | none |
| Import from File (a bundle) | projects list | `create_project_from_file` (`createProjectFromFileTool.ts:306`) | accepts a bundle zip, creates the project from its files through the same `bundleSource` path; today it reads JSON only and a zip fails |
| Add a Demo Package from a zip | Welcome step | `add_shared_demo` with `zipPath` (`addedDemoTools.ts:176`) | none: stays the template import |
| Reset an imported project | dashboard | `reset_project` (`resetProjectTool.ts:168`) | none to the tool; it reaches the new reset branch through the same handler, and its answer says what it restored |

Proof, in phase 3: `mcp-live-probe` against the running build for each changed tool (its real
answer, not the fixtures), and the reset and import run once by tool as well as by button.

### 3. Docs, walk and live cycle

- `docs/systems/sharing-a-demo.md`, `moving-projects.md`, the MCP tool docs; walk rows.
- The agent tools above probed live (`mcp-live-probe`), and `docs/systems/mcp-server.md` synced.
- Live, with the owner's go (real GitHub, DA.live and Commerce writes): Save as Package on
  Scratch 1028, a project from that card; Send a File, Import from File, Create, publish, then
  Reset and see the imported code come back. Delete what the walk made.

## Out of scope

- Carrying the content in the bundle (it is a pointer to the sender's published site, as the link
  is); a sender who deletes their site leaves an import with no content. A later item if needed.

## Risks

- Phase 2 touches project creation and reset, the two paths every project uses. Each change is
  behind the new `bundleSource`/`importedFrom` fields, so brand and card projects take today's
  path unchanged; the existing creation and reset suites must pass unmodified.
- Time: phase 1 is an hour or two; phase 2 is most of a day with its tests; the live cycle needs
  the owner.
