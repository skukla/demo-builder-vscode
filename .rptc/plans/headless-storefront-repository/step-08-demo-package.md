# Step 08 — Save as demo package, and Export's link, for a headless project

Item: [[EDS-13g]] (unblocks the headless half of [[EDS-13b]]; [[EDS-13e]] is already
superseded by EDS-13g). Decisions: 3, 5 (revised) (owner, 2026-09-15). Depends on steps 04 and 05.

## Goal

A headless SC opens More → Save as demo package (or Export → Send a link) and gets the same
dialog Edge Delivery gets: the name and description, the checks, the link. Saving writes the
description file into their repository and puts the card on their Welcome step. A colleague
adds that link and builds a headless project from it. A headless project without a repository
(created before this feature) gets the decision-5 sentence: "This project was created before
headless projects had a GitHub repository. Create a new project to use this."

## Facts

- Refusal: `EDS_ONLY` (`demoPackageHandlers.ts:47-48`) when `ownStorefrontOf` is undefined
  (`:67-70`); `ownStorefrontOf` needs `getEdsRepoParts` and `getEdsDaLiveTarget`
  (`demoPackageService.ts:46-56`), both undefined unless the stack is `eds-`.
- EDS-only parts, each read: the content index resolved from DA.live
  (`demoPackageHandlers.ts:106, 137`, `demoPackageService.ts:166-180`); `contentSource` always
  written (`:142`); the pages check with its `republish` action always added (`:210-219`);
  `storefrontKind: 'eds'` hard-coded on the card (`demoPackageHandlers.ts:127`).
- Stack-neutral already: the file write with sha ownership (`sharedDemoFile.ts:39-61`), store
  codes, flags, mesh, datapack, integrations (`demoPackageService.ts:119-144`), the repository,
  datapack and custom-app checks. `SharedDemoDescription` makes `contentSource` and
  `blockLibraries` optional (`types/projectFile.ts:66-76`), and the add side reads a headless
  repository's file (`sharedDemoProbe.ts:117-146`).
- A reset keeps the file (`edsResetFileOverrides.ts:55-58`); since step 05 that runs for
  headless too, and since step 07 the update-conflict reset keeps it as well.
- The dashboard hides the menu item and the notice's Save button for non-EDS
  (`ActionGrid.tsx:656-658`; `useHandoverDialogs.ts:28-41` returns `openDemoPackage`
  only when `isEds`). Export decides with `isEds` too (`ExportModal.tsx:110-128, 213-249`).
- Export → Send a file bundles the storefront with `ownStorefrontOf`, the content index and
  the repository's archive (`exportDemoBundleHandler.ts:88-112`), refusing non-EDS with
  `NO_STOREFRONT_TO_BUNDLE` (`:32`). The receiving door, the zip import, is Edge Delivery
  only: it classifies by Edge Delivery files (`zipStorefrontImport.ts:138-149`) and writes
  `storefrontKind: 'eds'` (`:226`).

## The exact changes

### Service

- `demoPackageService.ts:37-56`: `OwnStorefront` becomes
  `{ owner; repo; kind: 'eds' | 'headless'; daLiveOrg?; daLiveSite? }`. `ownStorefrontOf`
  reads `getStorefrontRepository`; for `kind === 'eds'` it also needs `getEdsDaLiveTarget`
  (the rule the comment at `:47-51` records stays for EDS).
- `describeProject(project, draft, contentSource?)` (`:119-144`): `contentSource` spread only
  when given.
- `packageChecks(project, storefront, index?, deps)` (`:185-`): the `index` check only when
  `index` is given.
- `resolveOwnContentSource` stays EDS; its callers call it only for `kind === 'eds'`.

### Handlers

- `demoPackageHandlers.ts`: `EDS_ONLY` deleted. `candidate` (`:60-72`) answers
  `NO_OWN_REPOSITORY` (step 03) when the project has no repository. Preview, save and remove use
  the content source only for EDS. `cardFor` (`:119-129`) takes `storefront.kind`. The header
  (`:10-13`) says any project with a repository of its own.
- `DemoPackagePreview` (`types/webviewRequests.ts:194-204`) gains
  `storefrontKind: StorefrontKind`, so the dialog and Export know the kind without a second flag.
- `exportDemoBundleHandler.ts`: for `kind === 'headless'` answers
  `HEADLESS_SENDS_A_LINK = "A headless storefront travels as a link. Use Send a link."`;
  `NO_STOREFRONT_TO_BUNDLE` (`:32`) is replaced by `NO_OWN_REPOSITORY` for repo-less projects.
  Headless in the zip import is not in this plan (a colleague's import door would refuse the
  file); it needs its own item.

### Dashboard (bundle: dashboard)

- `ActionGrid.tsx:656-658`: the Save as demo package item shows for every project.
- `useHandoverDialogs.ts:28-41`: `openDemoPackage` always; the `isEds` parameter goes.
- `ExportModal.tsx`: `useStorefrontState` (`:110-128`) always asks for the preview; a failed
  answer shows its sentence (so a repo-less project reads `NO_OWN_REPOSITORY`). `FileForm`
  enables the storefront part when the preview says `eds`; for `headless` its note reads
  `HEADLESS_SENDS_A_LINK`. `EXPORT_COPY.storefrontHeadless` and `linkHeadless`
  (`:47-48`), which say "This project has no storefront of its own", are deleted. The
  `isEds` prop goes from `ExportModalProps` (`:76`).
- `DemoSourceNotice.tsx:28-32`: the doc stops saying headless cannot be saved.

### Agent

`demoPackageTools.ts:55-56` (and the `save_demo_package` / `remove_demo_package`
descriptions): "Edge Delivery projects only" becomes "any project with a repository of its
own". Same handlers, so no other change. `export_demo_bundle` (`demoPackageTools.ts:142-160`) calls
`handleExportDemoBundle` and inherits the headless answer; its description gains "Edge Delivery
storefronts only; a headless storefront is sent as a link".

## Reuse

Everything above is the existing Edge Delivery implementation with its EDS-only parts made
conditional. Nothing new except the `kind` field and one sentence.

## Tests (failing first)

- `demoPackageService.test.ts`: "a headless project describes itself without contentSource";
  "its checks have no pages check"; "ownStorefrontOf reads a headless repository"; EDS cases
  unchanged.
- `demoPackageHandlers.test.ts`: "saves a headless project's file and card with
  storefrontKind headless" (assert the `writeSharedDemoFile` and `rememberAddedDemo`
  arguments); "a repo-less headless project gets the decision-5 sentence" replaces the case at
  `:101-104` that expects `EDS_ONLY` for a headless project.
- `exportDemoBundleHandler.test.ts`: headless answers the link sentence; repo-less answers
  `NO_OWN_REPOSITORY`.
- `ExportModal.test.tsx`: headless shows the link form after the preview; the file form's
  storefront part is disabled with the link sentence; repo-less shows the decision-5 sentence.
- `ActionGrid-overflow.test.tsx`: Save shows for headless. New `DemoSourceNotice.test.tsx`
  (none exists): Save offered for a headless source-gone issue.
- `demoPackageTools.test.ts`: description text.
- Add side, proof it already works: `sharedDemoProbe.test.ts:206-214` "reads a Next.js
  storefront as headless" exists; unchanged.

## Docs that change

- `docs/systems/sharing-a-demo.md:229-234` "Headless demos": rewritten — a headless project
  has its own repository, Save as demo package works, and a headless demo is sent as a link,
  not a file.
- `docs/systems/mcp-tools.md` regenerated. CHANGELOG.

## Acceptance

| Predicate | Evidence |
|---|---|
| The EDS-only refusals are gone | `grep -rn 'EDS_ONLY\|storefrontHeadless\|linkHeadless\|NO_STOREFRONT_TO_BUNDLE' src tests` count captured equals 0; control on `NO_OWN_REPOSITORY` counts 3 or more |
| EDS save unchanged | existing EDS cases in the four suites pass unedited |
| Gate green | `gate`, pre-push |
| Live (owner confirms the write) | step-03 project: Save as demo package shows name, description, checks without a pages row, and the link; Save writes `demo.demo-builder.json` to the repository; the card appears on the Welcome step with the headless kind |
| Live: round trip (owner confirms) | a second VS Code profile adds the link and creates a headless project from it: its repository is created from the first one's |
| Live: reset keeps the file | Reset the step-03 project: the description file is still in the repository |
| Live: repo-less | a pre-step-03 headless project: Save and Export show the decision-5 sentence; nothing is written to GitHub |

## Reversal

Remove demo package (the dialog's existing Remove) deletes the file only when its sha is
ours and takes the card off the list; reverting the commit restores the refusal.
