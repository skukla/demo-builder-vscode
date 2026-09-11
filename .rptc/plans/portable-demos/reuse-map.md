# Reuse map — every feature in the program, and what it is built from

Owner's gate, 2026-09-11: before development, every feature in [[EDS-13]] maps to the
existing code it reuses and how. Every path below was read this session; nothing is from
memory. "How" is one of: **use as is** (call it), **add to it** (a parameter or a branch, no new
shape), **make it shared** (lift a feature-local thing to `core/` so two features use it),
**build new** (nothing does this; the row says why the nearest thing would not do). The count
of **build new** rows is the honest size of the program. Measured over the tables below:
108 rows; 48 use as is, 46 add to it, 7 make it shared, 7 marked build new inline, and the closing table
names 18 new pieces once the inline "new" cells and the per-section "New:" lines are
counted together.

Rules that bind this map: `reuse-first` (fires on any new file under `ui/`); the job →
component table in `src/core/ui/components/CLAUDE.md`; ADR-015 (services fetched only at the
boundary); ADR-017 (webview deps arrive as props; the message channel is the ratified
singleton); "hit every surface" (eight bundles, creation = regenerate, human = agent).

---

## A. Define the project file format (PL-56a)

| Needs | Existing | How |
|---|---|---|
| The storefront row type | `Storefront`, `DemoPackage` (`src/types/demoPackages.ts:122`, `:220`) | add to it: the slice is a `Pick`/composition over these, never a copy |
| The project file type | `SettingsFile` (`src/types/settingsFile.ts`) | add to it to v2; `ImportedSettings = Partial<SettingsFile>` (`src/types/wizard.ts:105`) stays the wizard's view |
| A schema generated FROM the type, not hand-written | `scripts/generate-manifest-schema.js` (ts-json-schema-generator → `src/core/state/config/manifest.schema.json`), pinned fresh by `tests/templates/manifest-schema-freshness.test.ts` | add to it: a second target for the project file and the description file; same script, same freshness pin |
| Schema ↔ data validation in CI | `tests/templates/config-contracts.test.ts` (every `*.schema.json` under `src/` against its sibling JSON), `config-interface-contracts.test.ts` | use as is: the description-file sample lands beside its schema |
| Read-side migration v1 → v2 | `projectFileLoader.ts:205` (`migrateApiPicks`, `migrateLegacyToAppBuilderComponents`), `MANIFEST_FORMAT_VERSION` (`projectConfigWriter.ts:110`) | add to it: the same read-then-migrate shape applied to `parseSettingsFile` (`settingsSerializer.ts:39`) |
| What a credential is | `SECRET_ENV_KEYS` (`src/core/config/envVarKeys.ts:129`), enforced by `tests/sop/credential-env-vars-registered.test.ts` | use as is |
| Where the storefront description file's fields come from | the shipped `demo-packages.schema.json` | add to it: add `hidden`, `byomOverlayUrl`, `patches`; `$ref` the slice |
| Names | `getSuggestedFilename` (`settingsSerializer.ts:231`) | add to it: `<name>.project.demo-builder.json`; the description file `demo.demo-builder.json` is a constant beside it |
| A typed sample the compiler reads | `tests/helpers/webviewFixtures.ts` (the worked example for typed fixtures) | use as is pattern: a `tests/helpers/` module typed to the real interfaces |

New: none. Everything here is a second instance of a mechanism the manifest already has.

## B. Look up a project's storefront in one place (shareable-demo step 01)

| Needs | Existing | How |
|---|---|---|
| The catalog lookup | `resolveStorefrontConfig` (`edsResetParams.ts:195`), `getPackageById` / `getStorefrontForStack` (`demoPackageLoader.ts:87`, `:111`), injectable `packages` | make it shared: ONE `resolveStorefrontForProject(project, packages?)` beside `demoPackageLoader.ts`; `resolveStorefrontConfig` becomes a call to it |
| Template identity already on the project | EDS instance metadata written at `executorEdsPhase.ts:88`, read by `getTemplateSource` (`updateTypes.ts:90`), `templateUpdateChecker.ts:113`, `templateSyncService.ts:93` | add to it: the resolver reads it; the third reader is closed, not added to |
| The eleven callers | `edsResetParams.ts:202`; `storefrontSetupConfigRehydration.ts:80`; `configGenerator.ts:472`; `showDashboard.ts:223`; `componentSummaryUtils.ts:95`; `agentsMdSections.ts:636`; `storefrontNameMigrationForProject.ts:121`; `repairSiteConfigForProject.ts:92`; `WizardContainer.tsx:170`; `executorComponentLoading.ts:146`; `edsResetRepoHelper.ts:54` | add to it: each imports the resolver; their tests run unchanged |
| The pin | `tests/templates/spine-chokepoints.test.ts` + the `call-path-audit` skill | use as is: one more row |
| Silence on a miss | `storefrontSetupConfigRehydration.ts:76` | add to it: warn on a lookup miss, not only on missing ids |

New: the resolver function itself (one file). Everything it replaces exists.

## C. Rename the "Custom" brand to "Starter" (step 02)

| Needs | Existing | How |
|---|---|---|
| Move a package id without breaking old projects | `RENAMED_PACKAGE_IDS` + `normalizePackageId` (`projectFileLoader.ts:22`, `:40`), already mapping `b2b` → `custom` | add to it: one more entry |
| Pins that move with it | `tests/templates/demo-packages-data.test.ts:112`, `manifest-mirrors.test.ts` | add to it |

New: none.

## D. Read a colleague's repository (step 03)

| Needs | Existing | How |
|---|---|---|
| Is it a storefront? | `classifyRepoForStorefront` (`repoStorefrontReadiness.ts:87`) probing the three canonical files | use as is for EDS |
| Repo metadata: default branch, template flag, fork parent, redirect | `GitHubRepoOperations.getRepository` (`githubRepoOperations.ts:142`), `checkRepositoryAccess` (`:332`); `ForkSyncService.checkForkStatus` (`forkSyncService.ts`) | add to it: surface `is_template`, `template_repository`, `parent`, `full_name` from the response it already fetches |
| Read `fstab.yaml`, `config.json`, `package.json`, the description file | `GitHubFileOperations.getFileContent` (`githubFileOperations.ts:154`) | use as is |
| Parse the content site out of `fstab.yaml` | `generateFstabContent` (`fstabGenerator.ts:65`) documents the exact line | build new parser (inverse of the generator), one function beside it |
| Store codes and flags out of `config.json` | the keys `configGenerator.ts:171` writes (`Magento-Website-Code`, `Magento-Store-Code`, `Magento-Store-View-Code`) and `injectConfigFlags` reads | build new reader (inverse of the generator), one function beside it |
| Published index probe | the URL `edsPipeline.ts:364` builds; `getContentPathsFromIndex` (`daLiveContentDiscovery.ts:78`) | add to it: a HEAD-only variant that returns found/not-found + count instead of throwing |
| Headless kind | `componentInstallation.ts:104` validates git URL/ref | build new: a dependency-list check, marker VERIFIED against `skukla/citisignal-nextjs` first |
| B2B from dependencies | `b2bReadinessDetection.ts` (backend probe, not repo) | build new: a repo-side check, package names VERIFIED against `adobe-commerce/boilerplate-b2b-template` first |
| Validate the description file | the step-A schema + `validateManifestShape` (`manifestValidation.ts:65`) pattern | use as is pattern |
| Recognise one of our own templates (D30) | the seed lookup in `buildCustomIntegrationEntry` (`appBuilderComponentCatalogLoader.ts:266`: exact owner/repo match against authored entries) | use as is pattern: the same comparison against shipped storefronts' `templateOwner`/`templateRepo` |
| Guarding the input | `parseGitHubUrl` (`core/utils/githubUrlParser.ts`), `assertGitHubName` / `assertGitRef` (`appBuilderComponentCatalogLoader.ts`) | make it shared: the asserts move to `core/utils/githubUrlParser.ts` so two features share them |
| The handler shape | `MessageHandler` returning `{success,data?,error?}` (Pattern B) in the EDS map (`edsGitHubHandlers.ts` family), `HandlerContext` builder in tests | use as is |
| Result type | `src/types/webviewRequests.ts` (ONE declaration per channel) | build new type, in the typed file, never a literal |

New: 3 small readers/parsers + the result type. The transport, guards and readiness are reused.

## E. The "Add a demo" card and dialog (step 04)

| Needs | Existing | How |
|---|---|---|
| The grid and the plus card | `BrandGallery` + `PackageCard` (`project-creation/ui/components/BrandGallery.tsx`); the Integrations "Build custom" card | add to it `PackageCard` with an `add` variant (the coming-soon variant is the precedent for a card mode) |
| The dialog shell | `Modal` (`core/ui/components/ui/Modal.tsx`) in Spectrum `DialogContainer`, as `AddIntegrationFlowModal.tsx:316` | use as is |
| Stage machinery | `useIntegrationFlow` (`useIntegrationFlow.ts:161`), `flowStages.ts` (`FlowDraft`, `deriveStageOrder`, `CANONICAL_ORDER`) | make it shared: the stage-order/draft/commit core is integration-specific today (`IntegrationKind`); lift the generic part to `core/ui/hooks/` and let both flows declare their stage ids. If lifting fights the code, a storefront flow copies the SHAPE (two files) and states which rows it rejected |
| Link field + live validation + duplicate guard | `CustomStage.tsx` (`INVALID_MESSAGE`, `DUPLICATE_MESSAGE`, `evaluateUrl`) | make it shared: the field is integration-flavoured only in its copy and the id it dedupes on; parameterise both |
| Editable name | `OptionalNameField.tsx` | use as is |
| "Looking at this demo…" | `feedback/LoadingDisplay` (+ `useElapsedStage` if it runs long) | use as is |
| "This doesn't look like a demo we can build on" | `feedback/StatusDisplay` with `actions[]` | use as is |
| Added-demos list in stage 1 | `selection/SelectionStepContent` + `useSelectionStep` (the repo picker's list) | use as is |
| "What we found" rows | the summary-row vocabulary (`buildSummary.ts` `SummaryRow`) | use as is |
| B2B switch | Spectrum `Switch` as the wizard's other toggles | use as is |
| Fork tick box | the SC's login from `githubAuth.user.login` (already in `edsConfig`); the namespace `Picker` in `DaLiveServiceCard.tsx:140` is NOT reused (D28: personal only) | use as is: one line of copy naming the account |
| Request from the dialog | `useVSCodeRequest` (`core/ui/hooks/useVSCodeRequest.ts`) or `webviewClient.request` as `AddIntegrationFlowModal` does | use as is |
| Commit into wizard state | `useProjectBuilder.ts` handlers; `WelcomeStep.handlePackageSelect` (`WelcomeStep.tsx:85`) | add to it: the commit hands a synthesized `DemoPackage` to the same select path |
| Remembered demos: the setting | `demoBuilder.blockLibraries.custom` shape (`package.json:246`), `parseCustomBlockLibrarySettings` (`customBlockLibraryUtils.ts:41`), `SETTING_KEYS` (`settingsTools.ts:52`) | add to it: a sibling key, a sibling parser, one more `SETTING_KEYS` row |
| Remembered demos reach the wizard | `createProject.ts:314` initial data; `:453` `onDidChangeConfiguration` live push; `WizardContainer.tsx:85`, `:183` absorb + prune | add to it: a sibling payload on the same listener |
| Edit mode shows the project's own demo | `WizardContainer.tsx:145` appends a hidden package | add to it: source it from the step-B resolver |
| The words | glossary in `CLAUDE.md`; copy accepted in the feature plan | use as is |

New: the storefront flow's stage ids and copy; the `add` card variant. Two generalisations (stage core, namespace hook) are the risk in this step and are called out as such.

## F. Create a project from an added demo (step 05)

| Needs | Existing | How |
|---|---|---|
| The eleven storefront fields on the wire, once | `buildEdsConfigFromStorefront` (`edsConfigFromStorefront.ts:37`); `buildProjectEdsConfig` (`wizardHelpers.ts:526`); `PACKAGE_DERIVED_KEYS` (`storefrontSetupConfigRehydration.ts:33`) | add to it: close the two half-lists into one field set pinned by the existing field-set test |
| Create the repo from a template | `createFromTemplate` (`githubRepoOperations.ts:84`) via `storefrontSetupPhase1.ts:333` | use as is when the source has the template flag |
| Create the repo without a template flag | create-empty + `resetToTemplate` (`githubRepoOperations.ts:505`) — the existing-repo reset branch `storefrontSetupPhase1.ts:274` | add to it: the new-repo branch gains the fallback |
| Fork the colleague's repo | `ForkSyncService.checkForkStatus` reads forks; nothing CREATES one | build new: `createFork` on `GitHubRepoOperations` (GitHub's forks endpoint), beside `createFromTemplate` |
| Flag our fork as a template | nothing sets `is_template` | build new: `setTemplateFlag` on `GitHubRepoOperations`; also used by Share |
| Persist the row with the project | `projectConfigWriter.ts:28` / `projectFileLoader.ts:186` (`selectedPackage`), manifest schema generation | add to it: one more field, generated into the schema |
| Config flags re-expressed every regenerate | `injectPackageConfigFlags` (`configGenerator.ts:462`) | add to it: reads the resolver (step B) |
| The B2B answer | the same `configFlags` field on the stored row | use as is |
| Pages copy / skip | `skipContent` (`storefrontSetupPhases.ts:369`), `copy-content` step (`edsPipeline.ts:664`) | use as is |
| Blocks' example pages regardless of pages | `libraryContentSources` → `copyLibraryDocPages` (`edsPipeline.ts:513`) | add to it: pass the demo's own content site as a library content source |
| Palette from the demo's code | `pipelineConfigureBlockLibrary` reading `component-definition.json` from the template (`edsPipeline.ts:531`) | use as is |
| Dry check of the five patches | `applyCodePatch`'s three-state outcome (`codePatchRegistry.ts:237`: applied / `alreadyApplied` / precondition missing), `fetchExternalPatches` (`externalPatchFetcher.ts:110`) | add to it: a check-only mode that never writes; the consequence grouping is a typed constant beside the ids |
| Showing caveats | `pdpCaveats` → `warnings` (`storefrontSetupTypes.ts:88`, `webviewPayloads.ts:577`, `StorefrontSetupStep.tsx:604`) | use as is |
| Integrations the demo names (D29) | `useProjectBuilder.onAppBuilderComponentToggle`; `appBuilderComponentSources` + `buildCustomIntegrationEntry` for custom links; `selectedAppBuilderComponents` as the single mesh authority | use as is: the row's list is replayed through the same handlers |
| The datapack the demo names (D26) | `SampleDataStep.tsx` + `project.datapack` | add to it: a preselected value and one line of copy |
| Storefront summary "Demo" row | `storefrontSummaryGroup` (`buildSummary.ts:69`) | add to it: one row |
| "Reset to Isle5 by Jen" tick wording | `repoSelectionInline.helpers.tsx:826` | add to it: interpolate the demo name |
| Headless clone | `executorComponentLoading.ts:73` → `componentInstallation.ts:86` | use as is |
| Template identity on the instance | `populateEdsMetadata` (`executorEdsPhase.ts:72`) | use as is (no `lkgSource` for a colleague's repo) |

New: two GitHub calls (fork, template flag) and the check-only mode of the patch engine.

## G. Reset, update, edit and forget an added demo (step 06)

| Needs | Existing | How |
|---|---|---|
| Reset resolves the row | `extractResetParams` (`edsResetParams.ts:221`) | add to it via step B |
| Reset refuses up front when the source is unreachable | the preflight site `edsResetUI.ts:380` (params extracted BEFORE the first modal) | add to it: one reachability check there, using the step-D probe's metadata call |
| Reset completion gains the caveat list | `edsResetUI.ts:304–334` (warning/error surfacing), the patch toast (`patchReportHelper.ts:138` `formatUnappliedMessage`) | add to it: the consequence list rides the same `showWarningMessage` |
| Update check | `checkForkSyncUpdates` (`checkUpdates.ts:362`), `TemplateUpdateChecker` (non-thin-layer path `:200`), `templateSyncService.ts` | use as is (D19) |
| Dashboard notice "Jen's demo can't be reached" | `OrgContextNotice.tsx` (the dashboard's actionable banner over `feedback/InlineNotice`, shown only on a mismatch, with a recovery action) | make it shared: a `SourceUnreachableNotice` in the same shape, or `OrgContextNotice`'s wrapper made generic if the two are one job |
| Rename self-heal | `storefrontNameMigration.ts` / `storefrontNameMigrationForProject.ts` (self-healing stored names on load) | add to it: the same pass compares GitHub's `full_name` and rewrites the row + instance metadata + the remembered setting |
| "Change source" | the step-E dialog opened on stage 1; `InlineRenameField` is NOT it (that renames, this repoints) | add to it: a dashboard action (`ActionGrid.tsx`, `ProjectActionsMenu.tsx` via `CardActionsMenu`) that opens the same dialog with a `mode` |
| "Keep my current content" on reset when the site is gone | `skipContent` + the reset's consent flow (`edsResetUI.ts:405`, `:626` `showWarningMessage` choices) | add to it: one more offered choice |
| Forget from the card | `CardActionsMenu` + `renderMenuIcon` on the demo card; the settings entry; `deleteRepository` (`githubRepoOperations.ts:392`) with the delete-project confirmation shape (`projectDeletionService.ts`, `cleanupBehavior`) | add to it: a menu row + a confirm that names the projects using the fork (count from the resolver over all projects) |
| Project deletion leaves the fork alone | `CleanupService` (`cleanupService.ts`) touches only the project's `githubRepo` | use as is |
| Names everywhere | `getProjectDisplayName` (`core/utils/projectDisplayName.ts:70`) for projects; the stored row's `name` for demos | use as is |

New: none beyond the notice component (and that may be a generalisation).

## H. The same actions for AI agents (step 07)

| Needs | Existing | How |
|---|---|---|
| Probe as a read tool | `READ_DESCRIPTORS` (`readDescriptors.ts`), `readOnly: true`, `asText` (`mcpToolResult.ts`) | use as is over the step-D handler |
| Add as an action | `ACTION_DESCRIPTORS` (`actionDescriptors.ts`), `.strict()` zod from the payload type, `TOOL_NARRATION`, `AGENT_ALERT_COPY` (the fork is a cloud write) | use as is |
| `list_demo_packages` returns added demos | `discoveryTools.ts:88` over `getSelectablePackages` | add to it: merge remembered + shipped, with a `source` field |
| `create_project` accepts an added demo or a link | `createProjectTool.ts:416` | add to it: resolve a link through the probe + add path |
| Registration and pins | `realSdkRegistration.test.ts`, `dashboardHandlers-map.test.ts`, `toolNarration.test.ts`, `inExtensionMcpServer-toolAnnotations.test.ts`, `docs/systems/mcp-server.md` | use as is |
| Live proof | `mcp-live-probe` skill | use as is |

New: none.

## I. Write the how-to for sharing a demo (EDS-13c, step 08)

| Needs | Existing | How |
|---|---|---|
| A place | `docs/systems/` (e.g. `custom-block-libraries.md` is the sibling: a user-facing "how to bring your own" page) | use as is pattern |
| Pins | `tests/sop/cited-identifiers.test.ts` (every path/key a doc names must exist); the config-contract family for the field list | use as is |

New: the page.

## J. Share this demo (EDS-13b, step 09)

| Needs | Existing | How |
|---|---|---|
| The action | dashboard More menu (`ActionGrid.tsx:528` area, `useDashboardActions.ts`), projects-grid kebab (`ProjectActionsMenu.tsx`) | add to it: one row each |
| Write the description file without clobbering a hand edit | `createGeneratedFileWriter` (`aiBundle/generatedFileWriter.ts:73`: `writeMerged`, `remove` on proof of ownership, `hashes()` → `project.aiFileHashes`) | make it shared: the writer is aiBundle-local and writes into the PROJECT directory; the description file goes into the storefront REPO via GitHub. Either lift the hash-and-skip rule into a GitHub-backed twin (`createOrUpdateFile` + a recorded sha on the project), or write locally into the storefront component path and let the existing sync push it. Decide in the step; the ADR-013 rule is what is reused, not necessarily the file |
| The fields | the same serializer the export uses (`extractSettingsFromProject`) projected to the slice | add to it |
| Description text/icon prefilled, editable | `Modal` + `OptionalNameField` + Spectrum `TextArea`; icon picker = a file picker over `listRepoFiles` (`githubFileOperations.ts:261`) | use as is |
| Checks before sharing | the step-D probe run against the SC's own repo/site; `DefaultBranchNotice` copy | use as is |
| A named datapack missing from the service (D32) | the item-API route DI-3 proves: `get-export-items` + `create-datapack` + `add-data-item` + `promote` through `dataInstallerWriteClient.ts`, composed behind `exportHandlers.ts`'s existing door | add to it: the write client gains the item and pack calls; Share offers the door |
| A private custom-app repository (D32) | nothing sets repository visibility | build new: `setRepositoryVisibility` on `GitHubRepoOperations`, confirmed, reversible |
| Offer Publish when content is unpublished | the republish path (`storefrontRepublishService.ts`) | use as is |
| Template flag tick box | the step-F `setTemplateFlag` | use as is |
| "Stop sharing" | the writer's `remove` on proof of ownership; unset the flag if we set it (recorded on the project) | use as is |
| Agent action | `ACTION_DESCRIPTORS` + `AGENT_ALERT_COPY` (writes to the SC's repo) | use as is |

New: the GitHub-backed twin of the generated-file writer IF the local-write route does not fit. That is the one design question in this step.

## K. Export the whole project (PL-56c)

| Needs | Existing | How |
|---|---|---|
| The serializer | `extractSettingsFromProject` (`settingsSerializer.ts:132`), `createExportSettings` (`:215`) | add to it to v2 fields; delete `includeSecrets` and `includesSecrets` |
| The doors | `exportProjectSettings` (`settingsTransferService.ts:209`, save dialog), `exportProjectSettingsToFile` (`:303`, headless, path-contained by `assertPathInsideSync`) | use as is |
| The tool | `export_project_settings` (`actionDescriptors.ts:418`) | add to it: drop the flag; description says the file carries no credential |
| Never a credential | `stripSecretValues` (`envVarKeys.ts:148`) | use as is, applied unconditionally |
| Tests | `settingsSerializer.test.ts`, `settingsSerializer-integrations.test.ts`, `exportProjectSettingsToFile.test.ts` | add to it: field-set pin against the contract's list |

New: none.

## L. Import exactly what the file says (PL-56d)

| Needs | Existing | How |
|---|---|---|
| Seed the wizard | `computeInitialState` import branch (`useWizardState.ts:311`) | add to it: call `buildEditModeIntegrationState` (`:216`) as edit does |
| Re-prove sign-ins | `buildEditModeEdsConfig` (`useWizardState.ts:77`: not proven, checking; `useGitHubAuth`, `useDaLiveAuth` validate on visit) | use as is; `buildImportModeEdsConfig` (`:130`) is deleted |
| Adobe context mismatch | `AdobeAuthStep.tsx:80` "Switch IMS Org" forced sign-in; `AdobeProjectPicker.tsx:262`; `detectProjectOrgMismatch` / `ensureOrgContext` (the `adobe-org-context` skill) | use as is |
| The creation wire reads the file | `buildProjectConfig` (`wizardHelpers.ts:605`) | add to it: read `components`, `selectedAppBuilderComponents`, sources, picks, `datapack` instead of hardcoding `[]` |
| Credentials the receiver must supply | the Commerce connection step (`ConnectStoreStepContent.tsx`); per-project keychain reads via `commerceCredentialStore.ts`; `migrateDeclaredSecrets` on create (`executor.ts:238`) | use as is; the follow-on "reuse a login saved for this backend" is a keychain lookup by host |
| Same-machine Copy moves credentials | `commerceCredentialStore` read + `migrateDeclaredSecrets` write (write → read back → strip) | add to it: a copy path between two project keys, never through the file |
| The banner "Brought in 14 settings…" | `feedback/InlineNotice` (tone, hint, action) on the Welcome step; `sourceDescription` (`createProject.ts:496`) as its text | use as is |
| v1 files | the step-A migration | use as is |
| Tests | `WizardContainer-import.test.tsx`, `useWizardState-seeding.test.tsx` | add to it: assert the CREATION WIRE, not wizard state |

New: none.

## M. Copy and Edit read the same file (PL-56e)

| Needs | Existing | How |
|---|---|---|
| Both fed by one serializer | `copySettingsFromProject` (`settingsTransferService.ts:116`), edit seeding (`projectManagementHandlers.ts:26`, `dashboardHandlers.ts:537`) | use as is once K lands; a round-trip test on a captured real project |

New: none.

## N. Import and copy for AI agents (PL-56f)

| Needs | Existing | How |
|---|---|---|
| Headless import from a path | `importSettingsFromFile` opens a dialog (`settingsTransferService.ts:34`); the export twin `exportProjectSettingsToFile` shows the headless shape (`assertPathInsideSync`) | add to it: a path-taking twin that feeds `demoBuilder.createProject` with `importedSettings` |
| Copy | `copySettingsFromProject` | add to it: headless variant |
| Declarations, registration, docs | as in H | use as is |

New: none.

## O. Delete the unused code (PL-56b)

`ImportResult` (`settingsFile.ts:141`), `SettingsFile.additionalConsoleApis` + its read fallback (`useWizardState.ts:228`), the `installedBlockLibraries` emission (`settingsSerializer.ts:191`) and its two tests. Deletions, not reuse. `dead-code-scan` confirms zero references first.

## P. Docs (PL-56g)

`docs/systems/` page; `cited-identifiers.test.ts` pins. As-is pattern.

---

## The new things, all of them

| # | New | Step | Why nothing existing would do |
|---|---|---|---|
| 1 | `resolveStorefrontForProject` | B | there are two resolvers today; this replaces both |
| 2 | `fstab.yaml` parser | D | only the generator exists |
| 3 | `config.json` store-code/flag reader | D | only the writer exists |
| 4 | headless marker check | D | nothing classifies a Next.js repo |
| 5 | repo-side B2B check | D | the existing detection probes the backend, not the repo |
| 6 | probe result type | D | one declaration per channel |
| 7 | storefront flow stage ids + copy | E | the integration flow's ids are integration-specific |
| 8 | `PackageCard` add variant | E | no card is a door today |
| 9 | `createFork` | F | nothing creates a fork |
| 10 | `setTemplateFlag` | F, J | nothing sets `is_template` |
| 11 | patch engine check-only mode | F, G | the engine only applies |
| 12 | consequence grouping constant | F, G | build new copy, typed and pinned |
| 13 | source-unreachable notice | G | may be a generalisation of `OrgContextNotice` |
| 14 | fork-deletion confirm naming projects | G | the delete-project confirm names one project |
| 15 | GitHub-backed generated-file writer | J | ONLY if writing locally + sync does not fit |
| 16 | the process page | I | none exists |
| 18 | `setRepositoryVisibility` | J, K | nothing changes a repo's visibility |
| 17 | the portability page | P | one table row exists |

One generalisation carries the real risk and is named so it is watched: lifting the
integration flow's stage core to `core/ui/hooks/`. (The namespace-picker lift was dropped
with D28: the fork goes to the personal account, so the dialog needs no picker.) It is
attempted in its step; if it fights the code, the step copies the SHAPE (two small files)
and records which reuse row it rejected and why, which is what `reuse-first` asks for.
