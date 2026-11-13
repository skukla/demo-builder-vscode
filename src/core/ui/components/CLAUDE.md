# Shared UI Components — the house vocabulary

**Read this BEFORE writing a new component under any `ui/` directory.** Everything here is
already built, already tested, and already the extension's visual language. A feature that
rebuilds one of these does not get a neutral copy — it gets a copy that drifts, because the
next fix lands on one of the two.

The counterpart index for hooks is `../hooks/CLAUDE.md`.

## Pick by JOB, not by name

| The job | Use | Not |
|---|---|---|
| Full-block loading (empty view, waiting on a fetch) | `feedback/LoadingDisplay` (`size="L"`) | a bare `ProgressCircle` + label |
| A dialog's or flyout's wait: what it is doing, on what, how long (the progress window's three rows) | `Modal`'s `waiting`, or `feedback/StageWait` in a flyout (`brief`: the label alone, as the datapack flyout's waits), with words from `WAIT_STAGES` (`core/utils/waitStages.ts`) | a wordless spinner, or a `LoadingDisplay` with words written on the spot |
| Loading ON TOP of existing content | `feedback/LoadingOverlay` | a conditional spinner |
| Small inline busy indicator | `ui/Spinner` | `ProgressCircle` directly |
| Long wait needing "still moving" copy | `LoadingDisplay` + `useElapsedStage` | a static message |
| Progress of an operation the SC started with a button (modal + "Run in background" handover) | `feedback/OperationProgressModal` | a notification, or a screen's own progress modal |
| Error / empty / success full-block state | `feedback/StatusDisplay` (`variant`, `actions[]`) | red `<Text>`, a bespoke panel |
| "Nothing here yet" notice inline in a list | `feedback/EmptyState` (icon-in-a-well) | a hand-rolled centered div |
| First-run empty SCREEN with CTA buttons | `feedback/CtaEmptyState` (bold title + sentence + actions; Projects + Integrations use it) | rebuilding the Projects look per surface |
| Ambient status badge (dot + label + value) | `feedback/StatusCard` (`action` for remediation) | an inline colored span |
| Warning/context banner ABOVE content the user can still use | `feedback/InlineNotice` (`tone`, `hint`, `action`) | a full-pane `StatusDisplay`, which reads as a wall |
| Just the status dot | `ui/StatusDot` | a styled `<span>` |
| How something stands, as an icon: warning, error, done, info | `feedback/StatusIcon` (the wizard's set, everywhere; `tests/sop/status-icons.test.ts`) | importing a Spectrum status icon and picking a colour |
| One item's progress in a list of work (waiting, running, done, failed, warning) | `feedback/StepStatusIcon` (Prerequisites, the Updates modal's run) | a per-screen icon switch |
| A row in a list of work: status icon, name, then where it stands on the line under it (detail, note or failure); a host gives every row that line so the list keeps one height | `feedback/WorkRow` (the Updates modal's run, the demo setup; a host bundle imports `work-row.css` and `checkbox-row.css` in its entry) | bare text with the state run into the note |
| A run's parts as rows, down each column in turn (each a `WorkRow`): the import's window, and any run the progress modal shows as rows (`OperationProgressPayload.rows`, a datapack save) | `feedback/WorkRowColumns` (styled by `work-row.css`, `.work-row-columns`; `dense` for small rows nested under a step, the working row's second line, and room for it held in every column) | a per-run grid of rows |
| A run's steps, one row each (a `WorkRow`), with a step's nested rows under it, small, in columns (`OperationRow.types`; the import's Install step and its data types) | `feedback/StepRows` (the import's window; nested rows dense through `WorkRowColumns`, in `.import-step-types`, which `data-installer.css` styles) | a per-window step list |
| What sits under a run's rows: the clock while it runs (its line held from the first frame), then the sentence, the lines left to know and "Took …" (a run of a minute or more, only while the window stays open) | `feedback/RunFoot` (the one `tookValue` call; the import's run, the progress window, the projects batch run, the datapack result body). Whether the window stays open is `endsSmall` in `core/ui/utils/runEnding.ts` | a hand-rolled clock line or "Took" note per window |
| Centering any of the above at a fixed height | `layout/CenteredFeedbackContainer` | ad-hoc flex + height |
| "Add another" on a card grid — a dashed card as the grid's LAST cell, hidden while a filter is on, never counted | `ui/AddCard` (host passes its card class as `cardClassName`; its bundle imports `add-card.css`; pass `menu` — a Spectrum `Menu` — when adding is a choice, as Your Projects does) | a header "Add" button, or a per-grid dashed tile |
| Card overflow (kebab) menu, or a labelled "More" menu beside a primary button (`label`) | `ui/CardActionsMenu` + `ui/menuIcons` | a bespoke `MenuTrigger` |
| Pin or unpin a card, beside its menu | `ui/PinToggle` (styles in `shared-ui.css`; the hosting feature's sheet reveals an unpinned one on hover) | a Pin row in the card's menu, or a bespoke pin icon |
| A menu row's icon | `renderMenuIcon('<concept>')` | importing a Spectrum icon per menu |
| One integration in a list or grid | `integrations/IntegrationCard` | a per-surface integration row |
| One integration as a full-width row (the List view) | `integrations/IntegrationRow` | The card's twin for the integrations screen's rows mode: same model, same rename/kebab/status; `IntegrationsGrid` picks card or row from `viewMode` |
| The deploy destination, once per surface | `ui/DestinationContext` | a per-card "Deploys to" line |
| Rename in place | `forms/InlineRenameField` | a bespoke pencil + TextField |
| A pasted GitHub link → `{owner, repo}`, with not-a-link and already-added messages | `forms/GitHubLinkField` (copy and the duplicate rule are props) | a TextField + `parseGitHubUrl` per flow |
| A question in front of a consequential action: the question as the title, a few short lines, Cancel and the action | `ui/ConfirmActionDialog` | an inline Confirm and Cancel under the button |
| What the SC fills in before a run: a lead, the fields, Cancel beside the commit | `ui/FormDialog` | a `Modal` sized and spaced by hand |
| A run and how it ended, in one window that never changes size | `ui/ProgressDialog` (or the shared `feedback/OperationProgressModal` for an operation the extension streams) | a wait window and a separate result window |
| How something ended: the outcome in the title, lines only for what is left to read | `ui/ResultDialog` (closes itself when clean, `useCloseWhenClean`) | a status box in the body, or a result that waits for Close with nothing to read |
| Steps the SC does by hand, in order | `ui/GuideDialog` | a numbered `<ol>` in a hand-built modal |
| Any modal | `ui/Modal`, only inside the five layout components above (`tests/sop/modal-layouts.test.ts`; `status` puts the outcome's icon before the title; `startButtons` holds what acts on a list in the body as a whole at the footer's start, as the setup guide's Check All Steps; the rules for what goes inside are `docs/development/sop/dialog-design.md`) | `DialogContainer` assembled by hand; a status box in the body |
| A state deep inside a modal's body that belongs in its title: a list it could not read, a sign-in to do (the dialog's title and footer take it, the body keeps the words) | `ui/DialogOutcomeBody`, reporting to the dialog (the Add Integration flow's destination stages; `SelectionStepContent` takes it as `dialogHost`, and a whole wizard screen passes none) | a `StatusDisplay` in a dialog's body, or a body that draws its own big icon |
| A modal step's opening sentence, and the small grey label over a group inside it (sentence case, never capitals) | `ui/LeadText`, `ui/SectionLabel` (Export, Add another ERP, add integration, add a demo and the Updates modal use them; a host bundle imports `modal-text.css`) | a `<p>` with per-feature classes, or bold body text as a heading |
| A modal too tall or too narrow for its content | `ui/Modal` `fitContent` / `wide` props | CSS aimed at the Dialog — the constraint lives on Spectrum's wrapper, not the dialog's own box |
| Slide-in right panel for detail beside a list or grid | `ui/Drawer` | Spectrum `Tray` (mobile-only, unmocked in the test stack) or a bespoke scrim + panel |
| Page shell (header, back, footer) | `layout/PageLayout` + `PageHeader` + `PageFooter` | a bespoke page div |
| Full-screen surface: sticky search band over a 960px body | `layout/FullScreenSurface` | re-inlining `.projects-sticky-header` + `.page-container-padded` |
| Two-column / grid / sidebar layout | `layout/TwoColumnLayout`, `GridLayout`, `ContentWithSidebar` | raw flex (see the 450px trap) |
| Search box over a list | `navigation/SearchHeader` / `SearchableList` | a TextField + filter |
| Labelled lines that scan as one small table (label column, value column) | `ui/FactList` + `Fact` (the setup guide; a host bundle imports `fact-list.css`) | a per-feature `<dl>` grid with its own spacing |
| One manual Admin step's Where (menu path as breadcrumbs) / Set (copyable pills) / Then / Why | `ui/SetupStepFacts` over a `SetupChecklistItem` (the setup guide and the Data Installer's pack step dialog; styles in `fact-list.css`) | re-drawing the path, pills and reason per surface |
| One manual Admin step's title and where it stands (the house banner: Done, Not set up with what the check found, Couldn't check, Skipped) | `ui/SetupStepHeader` + `savedStepStatus(item)` (the setup guide's `StepHeader` adds its run and Apply's plan; the Data Installer's pack step dialog; styles in `fact-list.css`) | a per-surface status box or badge |
| A question a paused run asks: its sentence, numbered steps, fields; a task (a sign-in, one with a heading) takes the whole body and its heading the title, a question about one row stays under that row (`questionTakesWindow`) | `feedback/OperationQuestion` (the progress window, the Updates run and the projects batch run; styles in `modal.css`) | a sentence and a form under the running row for a task that is about no row |
| One row of a checkbox list: name, quieter detail, the reason a locked row cannot change; `isIndeterminate` for a row standing for several (a website's stores) | `selection/CheckboxRow` (the API picker, the Updates modal and the Data Installer's "Clear demo data" use it; a host bundle imports `checkbox-row.css` in its entry) | a Spectrum `Checkbox` with per-feature spans and classes |
| "Select All" over a list of checkboxes: tick all, the dash when some are, set apart by a rule under it | `selection/SelectAllRow` (the datapack forms and the progress window's questions use it; `everything` for one over a list of lists, Create Datapack's kinds; styled by `checkbox-row.css`) | a plain `Checkbox` or `CheckboxRow` labelled Select All, which gets lost among the boxes |
| Copy-to-clipboard value | `ui/CopyableText` | a Button + clipboard call |
| Numbered how-to steps | `ui/NumberedInstructions` (not a run's question: its two short steps are `OperationQuestion`'s plain list, since the cards' sheet does not reach those windows) | an `<ol>` |
| Wizard config summary / step status | `wizard/ConfigurationSummary`, `StatusSection` | a bespoke summary |
| Horizontal strip of step tabs | `navigation/StepRail` | a bespoke tablist |
| Area shell: rail strip over a swapping view | `layout/StepAreaShell` | inlining `.step-nav` + `.step-view` |

Auth surfaces have a house treatment too: **signed-out is never a Retry.** It is a
`StatusDisplay` whose action starts a user-initiated sign-in (`AdobeAuthStep` is the
reference). In a dialog, it is the title's outcome with sign-in as the action.

## Verify rather than trust this table

It is a map, not the territory — a component may have been added since. Before concluding
something does NOT exist:

```bash
ls src/core/ui/components/*/            # the full vocabulary, always current
grep -rn "<the job, e.g. EmptyState>" src/core/ui/components/
grep -rln "StatusDisplay\|LoadingDisplay" src/features/  # how peers already use it
```

If a peer feature already solves your exact job, **reuse or extract — do not copy**.

The threshold is [the handbook's](../../../../docs/development/handbook.md) and is not
restated here. What belongs here is the **override**: if the same behaviour has already
been FIXED separately on two surfaces, that is demonstrated drift and it gets extracted
at two. A bug fixed twice is evidence the copies must agree — which is the thing a count
of three is only a proxy for, so this is the rule's own logic arriving early rather than
an exception to it.

## When something genuinely does not fit

Extend the shared component (a new prop, a new variant) rather than forking it beside its
twin. If it truly belongs to one feature only, keep it in that feature's `ui/` — but say in
its module docstring which shared component you considered and why it did not fit. That
sentence is what stops the next person re-litigating it.

## Related

- `../hooks/CLAUDE.md` — the shared hook vocabulary (the same rule applies)
- `spectrum-webview-ui` skill — layout mechanics and the load-bearing Spectrum
  gotchas, including the `Flex` 450px trap this table's layout row points at
- `docs/development/styling-guide.md` — CSS architecture, `cn()`, token utilities
