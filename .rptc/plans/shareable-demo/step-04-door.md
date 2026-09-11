# Step 04 — The door: the plus card, the dialog, remembered demos

Item: [[EDS-13a]]. Decisions: D1, D2, D8, D9. Depends on step 03. **Gate: research §9a.**
A new component, hook, stage shell, settings shape or noun must name the row it replaces.

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

## Copy

"Add a demo" · "Use a demo a colleague built, or one of your own. You'll need its link." ·
"Link to the demo" · "Enter a GitHub link, like https://github.com/name/demo" · "You've
already added this demo." · "Looking at this demo…" · "This doesn't look like a demo we
can build on" (+ what is missing) · "What we found in this demo" · "Uses company (B2B)
features" + the two lines accepted in research §9. No "storefront", "custom", "shared",
"import", "GitHub" as a noun, "repo", "template" in anything the SC reads.

## Tests first (webview-test-authoring)

Stage order for the storefront flow; link validation and duplicate guard; the B2B switch
absent when `b2b !== 'unknown'`; Add commits through `useProjectBuilder`; a removed setting
prunes the card but not a project's own demo in edit mode. `webview-visual-baseline` before
and after on the wizard bundle.

## Open

Whether added demos also render as their own cards under a row label on the grid, or live
only in the dialog's stage 1 (research §9 drew both; confirm with the owner).
