# Step 04 — The "Add a demo" card and dialog

Item: [[EDS-13a]]. Decisions: D1, D2, D8, D9. Depends on step 03. **Gate: research §9a.**
A new component, hook, stage shell, settings shape or noun must name the row it replaces.

**Reuse:** section E of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

## What the SC sees

Research §9 and the description accepted 2026-09-11: a plus card "Add a demo" at the end of
the grid; a dialog with stage 1 (added demos as a list, or a link field) and stage 2 (name
+ "What we found" rows + the B2B switch only when `b2b === 'unknown'`); "Add demo" closes
it, the new card is selected, the plus card moves to the end.

## Reuse (from §9a)

`BrandGallery` + `PackageCard` (the plus card is the Integrations "Build custom" card
shape); `Modal` in `DialogContainer` as `AddIntegrationFlowModal`; `useIntegrationFlow` /
`flowStages.ts` stage machinery (a storefront flow adds its own stage ids in the same
shape; import the module only through its `index.ts`); `CustomStage` for the link field;
`OptionalNameField`; `LoadingDisplay`; `StatusDisplay`; `SelectionStepContent` +
`useSelectionStep` for the added-demos list; the wizard's summary-row vocabulary for "What
we found"; Spectrum `Switch`.

## Where the state goes (wizard-step-authoring rules)

- Selection goes through `useProjectBuilder.ts`: adding a demo commits a synthesized
  `DemoPackage` into wizard state and calls the same path `handlePackageSelect` uses
  (`WelcomeStep.tsx:85`), so stack/backend/library resets happen exactly as for a shipped
  package. No parallel state path.
- Backend call on Continue: the probe request fires at the dialog's stage-1 Continue with a
  loading overlay and local error handling (`docs/patterns/selection-pattern.md`).
- The wizard bundle imports the catalog at build time (`WizardContainer.tsx:105`); added
  demos reach it from the host as `customBlockLibraryDefaults` does
  (`createProject.ts:314` initial data, `:453` live push on setting change), and are pruned
  the same way when a setting disappears (`WizardContainer.tsx:183`).
- Remembered demos: a user-scoped setting in the `blockLibraries.custom` shape
  (`package.json:246`), read through `settingsTools.ts`'s `SETTING_KEYS` so the agent's
  settings tool sees it; the exact key is settled in this step and never written from memory.
- Edit mode: the project's own added demo is appended as `WizardContainer.tsx:145` appends a
  hidden package today, sourced from the step-01 resolver.

## The fork tick box (decided 2026-09-11)

> **Removed 2026-09-14 (step 11, D33):** there is no copy. An added demo reads from its link; `keepCopy`, `createFork`, `keepOwnCopy` and the delete-my-copy choice are gone, and Remove offers a delete only for a repository made from a zip. The text below is the record of what was built before.

Stage 2 carries a tick box, on by default: keep my own copy of this demo's code, naming
the SC's own GitHub account (D28: personal account only; no namespace picker here, so the
row in the reuse map that lifted the picker's option builder is not needed by this step).
It is the visible confirmation of a cloud write (P5). GitHub allows one fork of a repo per
account, so the fork is per added demo, never per project. When the SC already has a fork
of that repo, the box reads as already satisfied and points at it. When the link is the SC's
own repo, the box is not shown; their repo is the source.

## When the link is one of ours (D30)

The found panel reads "This is the demo behind Starter (B2B + B2C)" and the footer button
reads "Use Starter"; pressing it selects the shipped card and closes the dialog. Nothing is
remembered and no fork is offered.

## Copy

"Add a demo" · "Use a demo a colleague built, or one of your own. You'll need its link." ·
"Link to the demo" · "Enter a GitHub link, like https://github.com/name/demo, or the demo's site address" (a site address, `main--repo--owner.aem.live`, names its repository and is accepted; long dashes from a chat client are read as the two hyphens; decided 2026-09-12) · "You've
already added this demo." · "Reading the demo…" over the repository name, with what is being checked underneath · "This doesn't look like a demo we
can build on" (+ what is missing) · "What we found in this demo" · "Uses company (B2B)
features" + the two lines accepted in research §9. No "storefront", "custom", "shared",
"import", "GitHub" as a noun, "repo", "template" in anything the SC reads.

## Tests first (webview-test-authoring)

Stage order for the storefront flow; link validation and duplicate guard; the B2B switch
absent when `b2b !== 'unknown'`; Add commits through `useProjectBuilder`; a removed setting
prunes the card but not a project's own demo in edit mode. `webview-visual-baseline` before
and after on the wizard bundle.

## Decided 2026-09-11

Added demos render as ordinary cards on the grid (no separate row label), selectable in one
click; the plus card stays last; the dialog's stage 1 also lists them. Cards come from the
host-pushed list (remembered demos) plus, in edit mode, the project's own demo via the
resolver.

## Built (2026-09-12)

**The card.** `BrandGallery` renders a plus card last, "Add a demo" with the accepted
line under it, only when handed `onAddDemo`; it dims with the others once a package is
selected and steps aside while the grid is filtered. Same card shape, dashed, no selection.

**The dialog.** `ui/components/add-demo/`: a pure stage module (`addDemoFlow.ts`: copy,
the found rows, the row the dialog commits), a hook (`useAddDemoFlow.ts`: two commitment
points and nothing else talks to the host), two stages, and a shell on the core `Modal`
in a `DialogContainer` mounted only while open. Stage 1: the link field (the shared
`GitHubLinkField`, extracted from the integration flow's custom stage, which now uses it
too) plus the remembered demos as choice cards. Continue probes ("Reading the demo…" over the repository name, with what is being checked underneath,
`LoadingDisplay`), then stage 2: the name (prefilled from the description file, else the
repository's name spelled for people), "What we found in this demo" as summary rows
(storefront kind, published pages, store codes, company features when known), the SC's
switch only when the probe could not tell, and the keep-a-copy tick box, on, naming the
account; hidden for the SC's own repository; read-only "already kept" when they have a
fork. Refusals are `StatusDisplay` with what is missing; a shipped template shows "This is
the demo behind Starter (B2B + B2C)" and the footer reads "Use Starter (B2B + B2C)".

**The commit.** "Add demo" sends the row and the copy choice to `add-shared-demo`, which
forks into the SC's account when asked (`GitHubRepoOperations.createFork`, beside the
other repo-level mutations where the chokepoint pin keeps every GitHub write; never for
the SC's own repository), remembers the row in `demoBuilder.demos.added`, and returns the
row with the fork as its source. A failed fork adds nothing and says so inside the dialog.
The Welcome step then selects the new card through the same path a shipped brand takes,
with the row on `state.demo` (D2) and the package derived from the row, so the selection
does not wait for the pushed list.

**Remembered demos** reach the wizard as the custom block libraries do: read at open
(`addedDemos` on the init payload), pushed on change (`addedDemosUpdated`), appended
optimistically on add. `addedDemoCards` makes the cards: every remembered demo, and in
edit mode the project's own row when the setting no longer lists it, so a removed setting
prunes a card and never a project's demo. The row rides on `SettingsFile.demo` so edit
mode and the v1 export carry it; the reader's migration keeps it.

**What the probe handler gained:** the viewer facts (their login, whether the repository
is theirs, their existing fork), read-only, so the tick box is worded from them.

**Two reuse-map rows rejected, each with its reason in the module docstring:** the
integration flow's stage core (its order, gates and draft are integration-specific; this
journey has two fixed stages) and `SelectionStepContent` (a host-fetched list with loading
and refresh states, where the remembered demos are a static handful of cards).

**Not settled by this step, on purpose:** a bare `owner/repo` without `https://github.com/`
is not accepted (the parser wants a link; the owner was told and did not ask for it);
`create-project` does not yet carry the row, so a project built on an added demo is step
05's; Forget and Change source are step 06's.

**Visual baseline (wizard, dark, 1280 and 420):** before and after the stylesheet, the only
differences are the five elements of the new plus card and the gallery growing by one row
to hold it; no existing element's computed style moved. The harness was started from the
temporary worktree that held the unchanged build, so its capture records went there and
were removed with it; the numbers above are the record.

**Housekeeping:** 36 mutation-ledger anchors moved with the edits, one re-anchored onto the
ternary its line became; the wizard skill's "import only from its index.ts" line named a
file that does not exist and now names the two dialog modules instead.

**Revised 2026-09-14 (owner review).** The first stage showed the link field and the whole
zip section at once, plus the demos already added, and read as too busy. It now asks
**Where is the demo?** with two choice cards, **From a link** and **From a zip file** (the
shape of Export's "How will you hand it over?"), and shows only the chosen way's form. The
zip's action is the footer's main button, **Choose a zip file…**. The list of demos already
added is gone: each is a card on the Welcome step behind the dialog, and removing one
happens on that card. The intro line is gone in add mode; change mode keeps its lead. The
"Creating your repository from the zip…" spinner now shows for the whole push; it used to
render only on the found stage, which the dialog reaches after the push.
