# Could the other libraries live outside the extension, the way datapacks do?

Research for [[PL-91]], written 2026-11-04 on `develop` (the brief named a loop branch; the
checkout was `develop`). Read-only: no source changed. Every number below names the command
that produced it. "Not verified" marks what was read but not measured.

## Summary

**Datapacks are the only one of the four that is pure data, and that is why they could leave.**
Of the other three: **demo packages should move out as data, and are already two-thirds of the
way there** (an SC's own added demos live in a VS Code setting, and a demo's description lives
in its repository; only the team list, [[EDS-13d]], is missing, and it should be built as the
external demo-package library rather than a fifth list). **The integrations catalog splits in
two: the code of every integration is already outside the extension** (a GitHub repository,
updated from its releases), **and the catalog row can move out as data for integrations that
fit the generic row; the ERP stays inside.** The ERP integration is 67 files and 11,223 lines
of extension code plus 18 of the 168 in-extension MCP tools, wired in by imports, not by a catalog
flag (one tool table holds 96 descriptor rows and 72 `registerTool` calls; `src/mcp-server.ts` adds 9 file-based tools, none ERP). A
plug-in mechanism that let a contributed integration bring that much behaviour is a programme,
and today it would have exactly one customer, which we own. **The shared-demo library ([[EDS-13d]])
is the same thing as the external demo-package library**, and `stacks.json` is not a library
at all (it is the extension's model: four fixed combinations; 67 code sites branch on the backend type
and 3 on the `eds-` id prefix). `block-libraries.json` already has the merged-external-list shape (bundled rows plus
the `demoBuilder.blockLibraries.custom` setting), and nothing more is needed for it.

## 1. Per library

| Library | Where it lives today | Data vs behaviour | Can an SC contribute today? | Recommendation |
|---|---|---|---|---|
| **Datapacks** | Outside. Demo Builder's own datapack store: a package inside `accs-discovery-service`, on App Builder Database, behind the service's guard (`.rptc/plans/datapack-store/overview.md:99-100`); address `demoBuilder.datapackStore.apiBaseUrl` (`package.json:383`). The Data Installer is a second, external store we cannot write to (`docs/systems/data-installer.md:16-18`) | Data only (rows per data type, a settings layer) | Yes: save, share (Community), team mark, versions, zip files; 23 MCP tools | Done. The reference the others are measured against |
| **Integrations catalog** | Split. The ROW is inside (`components.json`, `app-builder-components.json`); the CODE is outside (a GitHub repo per component, cloned into `components/<id>/`, updated from its releases, §4) | Row: 4 generic entries (starter kit, shell, demo-erp, erp-integration). Behaviour for the ERP pair: 67 ERP-specific files, 11,223 lines, 18 MCP tools (§2). Zero code sites compare against `'demo-erp'` or `'erp-integration'` | No. A new integration is an extension release, even when it needs no new code | **Row moves out as data, for integrations the generic row can describe** (deploy, undeploy, `envSchema` settings, `requiredApis`, `setupSteps` using fixes the extension already has). **Behaviour stays inside; the ERP stays inside.** No plug-in mechanism now (§6) |
| **Demo packages** | Mostly inside: 5 bundled packages in `demo-packages.json` (`isle5, starter, citisignal, buildright, bodea`). Already outside: an SC's added demos in the `demoBuilder.demos.added` setting (`package.json:447`; `addedDemoSettings.ts:19`), and a demo's own description file `demo.demo-builder.json` in its repository, validated by `src/core/state/config/shared-demo.schema.json` (`docs/systems/sharing-a-demo.md:47-70`) | Data. 13 fields; two code sites read a package id (`'starter'` and a rename map, §3) | Partly: an SC can add a demo for themselves and publish a description file for others; nobody can add to everyone's Welcome grid | **Moves out as data.** Build [[EDS-13d]] as the team list, merged into the Welcome grid exactly as added demos already are |
| **Shared-demo library** ([[EDS-13d]]) | Not built | Data (entries in the shared-demo contract's shape, [[EDS-13c]] shipped) | n/a | **It IS the external demo-package library.** One list, two sources (bundled + team). Not a fifth inside-the-extension list |
| `stacks.json` | Inside, 4 stacks | Model, not content: 3 sites branch on the `eds-` id prefix (`typeGuards.ts:290`, `createProjectTool.ts:694`, `WelcomeStep.tsx:249`) and 67 on the backend type | No, and should not | Stays inside. Not a library |
| `block-libraries.json` | Inside (5 bundled) plus `demoBuilder.blockLibraries.custom` (`package.json:321`) | Data | Yes, per SC, through the setting | As is. It is the precedent for "bundled rows merged with an external list" |

Commands: `node -e` over the three JSON files for counts and fields;
`grep -rn -E "'(citisignal|bodea|justrite|carvelo|carvello|frescopa|wknd|luma|venia)'" src --include='*.ts' --include='*.tsx' | grep -v '/config/'`
(10 hits: 9 are `e.g.` comments, 1 is a legacy id alias `'citisignal-b2b': 'citisignal'` at
`src/core/state/projectFileLoader.ts:42`);
`grep -rn -E "'(eds-paas|eds-accs|headless-paas|headless-accs)'" …` (10 hits, all comments);
`grep -rn -E "'(adobe-commerce-paas|adobe-commerce-accs|accs|paas)'" …` (67).

**How the registries are loaded and checked** (relevant to any fetched row). All five are
static `import … from '…json'` and inlined by esbuild; `components.json` is ALSO read from disk
through `ConfigurationLoader` (`ComponentRegistryManager.ts:26-27`), a seam a fetched file
could reuse. The JSON is typed only by casts (`as unknown as DemoPackagesConfig`), so a wrong
row typechecks; the schemas are validated by tests, never at runtime
(`tests/templates/config-contracts.test.ts:56-89`, `config-interface-contracts.test.ts:31-51`).
Runtime Ajv exists only for the manifest and project file (`manifestValidation.ts:23`,
`projectFileReader.ts:22-23`). A row fetched at runtime would be the first registry row
validated at runtime, and that validator is part of the cost in §6a. Fields the brief guessed
at do not exist in any registry: `settingsSchema`, `deploy`, `undeploy`, `consoleApis`,
`eventSubscriptions`, `aiSkills` (deploy is the repository's own scripts, ADR-011; the AI
bundle gate `aiToolingGate.ts` has no integration-specific rule, `grep -i erp` = 0).

## 2. The ERP behaviour-site census

The brief's starting count (files that CONTAIN "erp", case-insensitive) is confirmed:
`grep -rli erp src/features src/core src/types src/commands --include='*.ts' --include='*.tsx' | awk -F/ '{print $2"/"$3}' | sort | uniq -c`
gives dashboard 66, eds 63, app-builder 63, data-installer 60, project-creation 56, ai 39,
updates 33, core/ui 18, core/utils 14, authentication 12, and a long tail. That count is a
ceiling: it includes files that only mention the ERP in a comment, a test fixture name or a
generic list, and files where "erp" sits inside another word (`eds` 63 is 62 such false
positives, "boil**erp**late").

A first floor is the set of files NAMED for the ERP:
`find src -iname '*erp*' -name '*.ts*' | wc -l` = 78, 12,440 lines. That filter is itself
noisy ("boil**erp**late", "oth**erP**rojects", "AppBuild**erP**redicate"). The delegated census
read every hit with a case-sensitive token regex (`(^|[^A-Za-z])erp|Erp|(^|[^A-Z])ERP`) and
classified each file: **240 real of 484 files; 244 false positives** (boilerplate, fingerprint,
register*, interpolate, counterpart, timerProvider, excerpt, perpetual and similar). Of the 240:

| Folder | ERP-SPECIFIC (exists only for the ERP) | Generic file with ERP code in it | ERP only in comments or copy |
|---|---|---|---|
| features/dashboard | 26 | 17 (+1 import only) | 11 |
| features/app-builder | 22 | 12 (+5 import only) | 22 |
| features/project-creation | 13 | 7 | 14 |
| features/data-installer | 2 | 6 (+23 that import a helper or pass `erpNames: []`) | 7 |
| src/types | 4 | 6 | 1 |
| features/ai | 0 | 4 (+5 copy only) | 2 |
| src/core | 0 | 6 | 16 |
| features/eds | 0 | 1 | 0 |
| updates, authentication, components, lifecycle, projects-dashboard | 0 | 0 | 2, 3, 1, 1, 1 |

**ERP-specific: 67 files, 11,223 lines** (`wc -l` of the ERP-named files that survived the
token check, 10,875, plus `AssignProductList.tsx`, 348, used only by the ERP modal). The
biggest groups: 22 services in `app-builder/services/` (fill, detach, ownership, list sync,
theme, the `create-erp-attributes` fix), 15 handlers and 11 UI files in `dashboard/`, 13 in
`project-creation/` (fill for a new project, ownership sync, `erpRunnerDeps.ts` which injects
the ERP implementations into the generic runner), the two wipe files in `data-installer/`, and
four type files. 54 non-ERP files import from ERP-named modules (`erpFillReaders` 20,
`erpDetach` 5, `wipeErp` 4, `erpAssign` 3).

**How the ERP is wired into the generic surfaces.** Not by branching on its id:
`grep -rnE "['\"\`](demo-erp|commerce-erp-integration|erp)['\"\`-]" src` finds no code site
(the one hit for `'demo-erp'` outside ERP-named files is a comment,
`src/core/state/appBuilderComponentState.ts:138`). It is wired two ways:

1. **Catalog flags the generic code reads** (data, reusable by any integration):
   `kind: system`, `boundTo`, `systemType` (the card badge,
   `integrationCardModel.ts:610`), `providesEnvVars`/`envSchema` (settings), `listedAs`,
   `screen` (the open-screen action), `wipe` (the reset route), `fillsSystem`, `addOnce`,
   `requiredApis`, `compatibleBackends`, `layout`, `lifecycle`, and `setupSteps`
   (`app-builder-components.json:59-110, 350-364`). This is the ADR-011 "deploy contract"
   (`docs/architecture/adr/011-app-builder-deployables.md`, "Deploy by honoring each
   deployable's own scripts") and the `.rptc/research/erp-integration/research.md` note that
   an entry declares `providesEnvVars` and `envSchema`.
2. **Imports** (behaviour, not reusable): the dashboard handler maps are imported by name
   into `dashboardHandlers.ts:103-114` (`erpDemoControlHandlers`, `erpIntegrationHandlers`,
   `erpOwnershipHandlerMap`, `erpResetHandlers`); the MCP descriptor rows are literal entries
   in `actionDescriptors.ts` (`set_erp_settings` :307, `set_erp_appearance` :335,
   `start_erp_downtime` :366, `load_erp_demo_data` :598, `add_erp` :630,
   `assign_erp_products` :677, `reset_erp_records` :858, `write_erp_rest` :880,
   `open_erp_screen` :944, and the rest); and `setupSteps` of `kind: "handler"` name a
   fix that must exist in `src/features/app-builder/services/storePreparation/fixRegistry.ts:17-18`
   and the closed union `SetupFixHandler` (`src/types/appBuilderComponents.ts:123`).

3. **Generic code that behaves as if every system were an ERP.** Several generic paths run the
   ERP's behaviour for ANY integration with a bound system, gated only by what is deployed:
   `appBuilderComponentTeardown.ts:98-102` detaches on every remove unless no `detach` action
   is deployed; `appBuilderDeploySteps.ts:276-285` sends "its ERPs" list to any integration that
   has systems or any system with `listedAs`; `integrationCardModel.ts:237` offers
   `simulate-downtime` on every deployed system card; `systemCardActions.ts:47-48` makes a
   system card's Open post `openErpScreen`; `removalConsequence.ts:39` tells any linked pair
   "It first clears its products' ERP tags". **So a contributed row with `boundTo` or
   `listedAs` would receive ERP behaviour today.** That is the strongest argument that the
   catalog row is not yet a clean seam: before any row moves out, these paths need a flag they
   read (or the ERP-only verbs need a catalog gate), which is a small, in-reach fix.

**MCP tools:** 168 in-extension tools: 96 descriptor rows (`actionDescriptors` 48,
`readDescriptors` 24, `dataInstallerDescriptors` 20, `statusDescriptors` 4) plus 72
`registerTool` calls; `src/mcp-server.ts` adds 9 file-based tools (command:
`grep -rhoE "^\s+tool: '[a-z_]+'" src/features/ai/server` and `grep -rh -A1 "registerTool($"`).
**18** are ERP-named (`add_erp`, `add_erp_owner_to_attribute_sets`,
`assign_erp_products`, `end_erp_downtime`, `get_erp_order_trace`, `get_erp_record`,
`get_erp_settings`, `get_erp_status`, `load_erp_demo_data`, `open_erp_screen`,
`remove_erp_owner_from_attribute_sets`, `reset_erp_records`, `run_erp_rest`,
`set_erp_appearance`, `set_erp_settings`, `start_erp_downtime`, `undo_erp_assignment`,
`write_erp_rest`), all descriptor rows (about 355 lines of `actionDescriptors.ts`, 108 of
`readDescriptors.ts`, plus their narration and alert copy); **23** descriptor rows are datapack
tools. The generic integration tools
(`add_integration`, `deploy_integration`, `redeploy_integration`, `remove_integration`,
`get_integration_settings`, `set_integration_settings`, `check_integration_updates`,
`update_integration`, `reinstall_integration`) cover any catalog row
(`docs/systems/erp-integration.md:602-648`).

What a contributed integration would therefore need, if it were ERP-shaped: its handler
maps registered, its descriptor rows added, its fixes in `fixRegistry`, its types, its
dialogs in the dashboard bundle, and its reset and fill steps. None of that is reachable
from a row.

## 3. Demo packages, stacks, block libraries

`demo-packages.json`: 5 packages; package fields `id, name, description, featured, status,
addons, configDefaults, storefronts, hidden, configFlags, requiresMesh, datapack,
integrations` (from `demo-packages.schema.json`). Readers are the loader
(`src/features/components/services/demoPackageLoader.ts`, which already returns a Promise
"to support future async loading scenarios (e.g., remote config)", :55-56) and the wizard.
Two code sites read a package id: `demoPackageService.ts:119`
(`resolved?.package.id === 'starter'`) and the rename map `RENAMED_PACKAGE_IDS` at
`src/core/state/projectFileLoader.ts:39-43`; three flags are behaviour by value (`hidden`,
`status: 'coming-soon'`, the `addons` enum `required/excluded/optional`). Everything else in a
package is a value the extension applies (store codes, flags, a repo to clone, a datapack to seed, integrations to
add). That is the definition of "moves out as data".

Two external forms already exist and already merge into the Welcome grid:
- `demoBuilder.demos.added` (user setting): one row per demo an SC added from a link or zip,
  "the `demo.demo-builder.json` shape plus a source" (`package.json:447-453`), turned into a
  `DemoPackage` by `storefrontResolver.ts:105-118` and merged into the wizard's list at
  `useWizardCatalog.ts:105-111` (`[...packages, ...addedDemoPackages]`). [[EDS-13a]] shipped.
  This is the merged-external-list precedent. (Custom block libraries are NOT merged into
  their catalog: they travel as a separate list and are concatenated at execution,
  `storefrontSetupPhase2.ts:250-284`.)
- `demo.demo-builder.json` at a repository root, the shared-demo contract
  ([[EDS-13c]] shipped; `docs/systems/sharing-a-demo.md:45-75`), written by Save Demo Package
  through the ownership rule (`demoPackageHandlers.ts:5-6, 193`). [[EDS-13b]] shipped.

What is missing is only the TEAM list: a list everyone's extension reads
(`.rptc/backlog/2026-09-11-team-demo-catalog.md`). Its open questions (who may edit, what an
unreachable list does, trust in a fetched file) are the same ones the datapack store already
answered for packs (§4).

`stacks.json`: 4 stacks, fields `id, name, description, icon, frontend, backend,
dependencies, optionalDependencies, optionalAddons, features`. Three sites branch on the
`eds-` id prefix (`typeGuards.ts:290`, `createProjectTool.ts:694`, `WelcomeStep.tsx:249`),
several on `frontend === 'eds-storefront'`, and 67 on the backend type. A stack is the extension's statement of
what it knows how to build, so an SC-contributed stack would need SC-contributed code. Not a
library.

`block-libraries.json`: 5 bundled; `demoBuilder.blockLibraries.custom` adds an SC's own and
the wizard shows both as checkboxes (root `CLAUDE.md`, "Modifying Wizard Steps"). The merged
external list already exists here; EDS-13d's note "pushed into the wizard the way custom
block libraries already are" names the precedent.

## 4. What is already outside: integration code and its updates

A catalog row names a repository; the extension clones it into `components/<id>/` and the
code is never inside the extension (`componentInstallation.ts`, cited in
`.rptc/research/app-builder-integration-model/research.md` §1.1). Updates come from the
repository's GitHub releases:
- Component folders: `componentRepositoryResolver.ts:67-69` reads the `frontends`, `mesh`
  and `tools` sections of `components.json`, `source.type: git` entries only, and
  `componentUpdater.ts` replaces the folder from the release zip with a snapshot and rollback
  (`.rptc/research/integration-release-updates/research.md` §1).
- App Builder components (the ERP pair included): their own git-based path, fetch to the
  release tag, redeploy, Commerce upgrade, pair order (`integrationUpdates.ts`;
  `src/features/updates/README.md:1-4`: "A mesh, ERP or integration in a repository the
  builder owns updates to its newest release, by the integration update check").
- The `component-release` skill publishes a component version; "a push reaches no SC, a
  release does" (root `CLAUDE.md`).

So for integrations, "a library outside the extension" is **already true for the code and the
release cadence**; what is inside is the ROW (4 entries) and the BEHAVIOUR the extension adds
around the ERP (§2). The two have different costs to move.

## 5. What the datapack store gives us

Measured from `docs/systems/data-installer.md` and `.rptc/plans/datapack-store/overview.md`
(both read; the live store was not probed here):

| Capability | Where | Reusable for a demo-package or catalog-row list? |
|---|---|---|
| A store we own, in a workspace we deploy | a package in `accs-discovery-service`, App Builder Database, same Stage workspace as the PDP actions (plan :99-100, step 01-02) | Yes. One more collection or `datapack_type` is a service change in our own repo. Not verified: the store's routes take datapack-shaped documents (`datapack_name`, `data_types`, `data`); a demo entry would need either a new route pair or a document shape agreed for it |
| Caller identity | IMS token + email-domain allowlist, the service's existing guard (ADR-014); owner = the IMS email (plan step 04) | Yes, unchanged |
| Visibility | owner-only by default; `shared` = Community; `team` = the official list, settable only by "its deployed list of team pack owners" (`datapackStoreWriter.ts:151-158`; `types.ts:43-45`) | Yes. This answers EDS-13d's "who may edit" |
| Versions | immutable per version, newest listed, "newer version" dot in the catalog (`data-installer.md:198-202`) | Yes for demo packages. A catalog row for an integration is better versioned by the integration's own release (§4) |
| Eleven mirrored routes | `create-datapack`, `find-datapacks`, `update-datapack-metadata`, `delete-datapack`, … (plan step 02b) | The read side is what a team list needs; the extension's `dataInstallerClient` reads it "with only the base URL changed" |
| Fallback when unreachable | an amber banner, the other store still listed (`data-installer.md:30-33`); install records kept per project in `<project>/.demo-builder/datapacks/` | The "use the last copy" EDS-13d wants is NOT built: the store answers or the list is missing. Any external list needs a cached copy |
| File form | `<name>-<version>.datapack.zip`, built in the extension (`datapackZip.ts`; `data-installer.md:384-397`) | Not needed for a JSON entry |
| Agent surface | 23 datapack tools, `share_datapack`, `mark_team_datapack`, `delete_library_datapack` (own packs only) | The pattern (share, team-mark, delete-own) transfers one for one |

One rule carries over whole: **"the org's packs must have ONE home"** (plan, "The
one-registry rule stands", owner 2026-08-23). Two stores that both hold a demo entry diverge.
That argues for putting the team demo list in the same store rather than in a GitHub file
beside it, OR for the GitHub file alone; not both.

## 6. Plug-in mechanism options, sized

Only the integrations catalog could need one, and only for ERP-shaped integrations. Three
shapes were checked against what the ERP needs today (§2) and against the architecture law.

**(a) Manifest-only.** The row describes everything; behaviour is generic code inside.
- Already exists in part: `envSchema` → settings form and `get/set_integration_settings`;
  `screen` → open-screen; `wipe` → reset route; `fillsSystem`, `boundTo`, `setupSteps` whose
  `kind: "handler"` resolves to a fix the extension ships (`fixRegistry.ts`). The
  `.rptc/research/component-specific-wizard-steps/research.md` groundwork (steps filtered by
  `requiredComponents`) is the same idea for wizard copy.
- Covers: a starter-kit-shaped integration (deploy, undeploy, settings, APIs, a card with a
  badge, an open-screen button, a reset route, setup checks drawn from the existing fix
  registry). Does not cover: the 18 ERP tools' meanings (ownership rules, downtime,
  appearance, order trace), the ownership dialogs, the fill pipeline.
- Law: nothing moves across ADR-015/017 boundaries; the row is read where rows are read today.
  `tests/sop/architecture-rules.test.ts` unaffected.
- Size: **a release**, if the row is fetched from a team repository the way patches are
  (`externalPatchFetcher.resolvePatchRef`: latest normal release, else `main`) and merged like
  custom block libraries, with a cached copy for offline. Three things must be built: the
  fetch-and-cache, a runtime validation of a fetched row against
  `app-builder-components.schema.json` before anything is cloned or deployed (none exists
  today, §1), and catalog gates on the generic paths that treat every bound system as an ERP
  (§2 item 3).

**(b) A webview bundle contributed by the integration repository.**
- The webview CSP is `script-src 'nonce-${nonce}' ${cspSource}`
  (`src/core/utils/getWebviewHTMLWithBundles.ts:62-65`): only scripts the extension itself
  serves run. A contributed bundle would have to be downloaded into extension storage and
  served as a webview URI; it would need React and Spectrum from our bundle or its own copy;
  ADR-017 says dependencies arrive as props from the bundle entry, and a foreign bundle has no
  entry of ours. Nine entries, so nine places to host it.
- It solves only the screen half. Handlers, MCP tools, reset steps and fixes are host-side
  (ADR-015) and a webview bundle cannot bring them.
- Size: **a programme**, and incomplete on its own. Not recommended.

**(c) A VS Code extension per integration.**
- The API exists: `extensionDependencies` in `package.json` and
  `vscode.extensions.getExtension(id).exports`. **No precedent in this repo:**
  `grep -n -E 'extensionDependencies|extensionPack' package.json` = 0;
  `vscode.extensions.getExtension` is used 3 times and each reads our OWN manifest
  (`settingsTransferService.ts:275, 353`; `diagnosticsChecks.ts:255`).
- A contributed extension could legitimately bring host code. But: the in-extension MCP
  server's tool table is a static array of descriptor rows (§2), so it would need a
  registration API; the dashboard, Configure and wizard webviews are ours, so the contributed
  extension's screens would be ITS panels, not tiles in our dashboard (a second dashboard,
  which `reuse-first` exists to prevent); every one of the five properties would have to be
  enforced in a second repository that our `tests/sop/` cannot see; `AI_CONTEXT_VERSION` and
  the ADR-013 seam would need a cross-extension protocol.
- Size: **a programme**: a public API, the 12,440 ERP lines moved and re-tested, release
  coordination between two extensions, and the enforcers duplicated. The only customer today
  is the ERP, which we own.

**Verdict:** build (a) only when a second real integration arrives that the generic row can
describe; do not build (b) or (c). Until then, a new integration is still an extension
release, and that is the honest cost of an integration being code plus behaviour.

## 7. Risks against the five never-compromise properties

| Property | Demo packages out as data (team list) | Integration ROW out as data | Plug-in (b)/(c) |
|---|---|---|---|
| **Reversal** | Low. An entry removed from the list changes nothing for projects built on it: the project stores its own row (EDS-13a guarantee, `team-demo-catalog.md`). Removing an entry = `forget`, as added demos have | Low for the row; the integration's own remove path is unchanged. Medium if a fetched row names a `wipe`/`setupSteps` handler that does not exist in this extension version: the add must refuse before deploying | High. A contributed extension's deploy and reset are outside our remove path and our `verifyRuntimeTeardown` |
| **Never overwrite user edits (ADR-013)** | None. Nothing is written into a project that is not already written today | None | Medium. A contributed writer that calls `writeFile` directly has opted out of the seam (root `CLAUDE.md`, property 2), and we cannot lint another repository |
| **Existing projects keep working** | Low. Same merge as added demos; a project keeps its own package row | Medium. A row fetched later may describe a NEWER integration than a project has cloned; the integration update path already handles code, but a changed `envSchema` must not strand a project's settings. Cache the row ON the project at add time, as the project already caches its demo-package row | High. Two extensions on two release cadences |
| **Public repo** | Medium. A team list that lives in a GitHub repository must not carry store credentials or internal hosts; the `demo.demo-builder.json` schema allows "only these fields" (`sharing-a-demo.md:70`), which is the right guard. The datapack store holds no credentials ("Credentials: none are sent", `data-installer.md:41`) | Medium. A row carries repo URLs and env NAMES, never values; validate against the schema before use | Same, plus a second public repository to police |
| **Confirmed cloud writes** | None (a list read) | None added; add/deploy keep their confirmations | High. A contributed extension can call Adobe without our guard chain or consent copy |

An aside under property 4, found while reading, verified by grep and not fixed (read-only
brief): two tracked files carry a colleague's first name
(`.rptc/plans/datapack-store/overview.md:122` in a quoted owner sentence;
`docs/systems/sharing-a-demo.md:97` as an example `org`). `.rptc/CLAUDE.md` says "Never name a
colleague". Fix now or defer?

## 8. Open questions for the owner, each with a recommendation

1. **Where does the team demo list live: the datapack store, or a file in a GitHub repository
   (EDS-13d's first guess)?** Recommendation: the datapack store. It already has the owner,
   `shared` and `team` visibility, the IMS guard, immutable versions and the agent-tool pattern;
   a GitHub file would re-answer "who may edit" and "do we trust the fetched file" from scratch,
   and the one-registry rule says not both. Cost it carries: a document shape or route pair for
   demo entries in `accs-discovery-service` (not verified against the store's routes), and an
   on-disk cached copy for offline, which neither option has today.
2. **Should the integration catalog ROW move out now, or wait for a second integration?**
   Recommendation: wait. Today the catalog is four rows, two of which are the ERP pair that
   cannot move. The fetch-and-cache is a release of work whose only beneficiary would be a
   starter-kit-shaped integration nobody has asked for. File it as a feature under the
   integrations epic so it is designed when the customer appears, with the manifest-only shape
   (§6a) and the schema validation as its acceptance.
3. **Is the ERP accepted as "inside the extension for good"?** Recommendation: yes, stated in
   the ERP doc. Its 12,440 lines and 18 tools are extension behaviour; the generic flags it
   introduced (`systemType`, `boundTo`, `fillsSystem`, `wipe`, `screen`, `setupSteps`) are the
   part that generalises, and each new integration should add to those flags before it adds a
   file named for itself. The in-reach fix to do first, whatever is decided: gate the five
   generic paths in §2 item 3 on a catalog flag, so a non-ERP system does not get downtime,
   detach and "ERP tags" copy.
4. **Does an SC-contributed demo package carry its own integrations and datapack
   (`integrations`, `datapack` fields)?** Recommendation: yes, but only by id and version of
   things already in the catalog or store, never by URL; a fetched entry naming an unknown
   integration id is shown with that integration greyed, not refused.
5. **The two colleague names in tracked files (§7 aside):** fix now (two one-word edits) or
   defer?

## 9. Decisions (owner, 2026-11-04)

Planning only. Nothing here is built, and none of it is for beta.153.

1. **Team demo list: the datapack store.** Recorded on [[EDS-13d]].
2. **Move the integration catalog row out now.** This is the manifest-only shape (§6a): fetch,
   validate against the schema, merge with the bundled rows, cache for offline. It does NOT need
   a plug-in mechanism; the row is data. Filed as [[AB-84]].
3. **The five generic paths get a catalog gate first.** Filed as [[AB-85]], small, before any
   row moves out. Of the five, two are behaviour (downtime offered on every system card; detach
   runs on every remove, gated today only by a deployed `detach` action) and three are wording
   ("its ERPs", "ERP tags", the `openErpScreen` name on a handler whose mechanism is generic).
4. **The ERP is NOT accepted as inside for good.** The audit's verdict (§6, "do not build (b) or
   (c)") is overruled by product intent: an SC should be able to add their own integration, a
   PIM for example, and have it bring its extension behaviour the way the ERP does. The ERP
   application already lives in its own GitHub repository; what is wanted is for the
   extension-side functionality to travel with it. That is the plug-in question, filed as
   [[PL-92]]. The audit's sizing (a programme, no precedent) stands as the cost; the decision is
   to explore the design, not to skip it.
5. **Colleague names in tracked files: deferred.** 14 files, not two (`grep -rn "Jeff" .rptc docs
   tests`). Filed as [[PL-93]].

## Sources

Prior research reused: `.rptc/research/2025-12-28-templates-vs-components.md` (why demo
packages are pure configuration), `.rptc/research/app-builder-integration-model/research.md`
(§1.1 many separate apps, one workspace), `.rptc/research/erp-integration/research.md`
(what a row declares), `.rptc/research/multi-erp-integration-shape/research.md` (one app,
router and adapters), `.rptc/research/integration-release-updates/research.md` (the two
release mechanisms, §1-3), `.rptc/research/component-update-strategy/research.md`,
`.rptc/research/component-specific-wizard-steps/research.md` (steps from a row),
`.rptc/research/workspace-per-integration/research.md`,
`.rptc/research/project-export-datapacks/research.md`,
`.rptc/research/datapack-engine/library-audit.md`, `.rptc/plans/datapack-store/overview.md`,
`docs/systems/data-installer.md`, `docs/systems/erp-integration.md`,
`docs/systems/sharing-a-demo.md`, ADR-011, ADR-013, `src/features/components/README.md`,
`src/features/app-builder/README.md`, `src/features/data-installer/README.md`,
`src/features/updates/README.md`, backlog items PL-91, EDS-13, EDS-13a-g.
