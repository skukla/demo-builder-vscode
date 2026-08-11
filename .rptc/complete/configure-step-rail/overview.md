# Configure screen → wizard step rail

Branch `feature/configure-step-rail`, worktree
`demo-builder-vscode.worktrees/feature/configure-step-rail`.

## Step 0: RPTC re-initialization (ALWAYS FIRST)

Re-invoke to restore full RPTC context before implementing:

```
/rptc:feat Plan is approved, continue to implementation — configure step rail
```

Then work from this file and `step-01..05.md`. **Work in the worktree above, not the
main checkout.**

## Goal

Give the Configure screen the wizard's UI/UX: a horizontal step rail across the top,
each configure section a tab, one section's fields visible at a time.

## Decisions (user, 2026-08-10)

| Decision | Choice |
|---|---|
| Rail behaviour | **Switch sections** — one body at a time, like the wizard. Not jump-nav. |
| Reachability | **All sections reachable** — feed every tab `done`/`current`. No component change. |
| Component home | **Move + rename** to `src/core/ui/components/navigation/StepRail.tsx` |

## What discovery established

**The rail already exists and is already horizontal.** `VerticalStepList`
(`src/features/project-creation/ui/components/VerticalStepList.tsx`) renders
`<ol role="tablist" aria-orientation="horizontal">` at :134, and both `.vsteplist` and
`.step-nav` are `flex-direction: row !important`. `CommerceStep` and `StorefrontStep`
already use it as a top rail.

**Its name and docstring are wrong.** The docstring claims "a VERTICAL MENU … renders
top-to-bottom … replacing the rejected horizontal StepTabs strip". A horizontal strip
was evidently rejected once and later reinstated without updating either. This actively
misled one of three research agents in Phase 1 — it reported the component as vertical
and warned we were re-treading rejected ground. Fixing this is part of step 01, not
cosmetic.

**The component is genuinely reusable.** Three props (`steps`, `activeId`, `onSelect`),
no wizard imports, no internal state, and its CSS is already loaded in the Configure
webview.

**Configure's sections come from three unrelated sources**, and only one currently
feeds the nav — so today's "Sections" sidebar is not the list of sections on screen:

| Source | Where |
|---|---|
| `SERVICE_GROUP_DEFINITIONS` (TS constant, 8 groups) | `serviceGroupTransforms.ts:74-117`, filtered by `useSelectedComponents` → `useServiceGroups` |
| Hardcoded "Project" + EDS-only "Authoring" | `ConfigureScreen.tsx:642-660`, `:591-615` — **not in the nav** |
| Runtime App Builder catalog, one section per entry | `AppBuilderComponentFieldsSection.tsx:126-154` — **not in the nav** |

Unifying these into one ordered section list is the substance of the work, not the rail.

## What this removes

- `NavigationPanel` sidebar — Configure is its only live consumer
- The DOM-imperative machinery: `getElementById` + `scrollIntoView` + `focus()` in three
  places, plus `useFieldFocusTracking`'s global `querySelectorAll` listener sweep
- Five dead hooks in `ui/configure/hooks/` (exported from a barrel nothing imports),
  with ~800 lines of tests behind them
- Two of three copies of `toNavigationSection`
- The hand-inlined re-implementation of `ServiceGroupList` (`ConfigureScreen.tsx:672-701`)

`ConfigureScreen.tsx` is 736 lines against a 350-line component limit; this should end
well under it.

## Constraints

1. **`--wizard-content-pad` is scoped to `.wizard-main-content`** (`custom-spectrum.css:823-825`).
   `.step-nav`'s `padding` references it, and outside the wizard the whole declaration is
   dropped. Promote to `:root` or declare on the Configure container. **Verify in the Dev
   Host** — this one fails silently.
2. **Spectrum `Flex` caps width at ~450px.** The rail wrapper must be a plain `div`.
3. **Scroll ownership**: `.container-configure` is `height:100vh; overflow:hidden`;
   `.container-form` is the single `flex:1; overflow-y:auto` scroller. The rail slots
   between header and that scroller — do not create a second scroll parent.
4. **Save submits every section, not just the visible one.** `componentConfigs` state
   already spans all sections; keep it that way. A section rendering conditionally must
   not drop its values.
5. **Validation must stay global.** `canSave` today walks all groups. With one section
   rendered, validation cannot depend on mounted fields. Tab labels should reflect
   per-section validity so an error off-screen is discoverable.
6. **`createOrRevealPanel` re-sends `init` without remounting React**
   (`baseWebviewCommand.ts:197-215`). Re-opening Configure resets `componentConfigs` but
   not local UI state. The rail's `activeId` inherits that asymmetry — decide deliberately
   whether re-open resets to the first tab.
7. **`retainContextWhenHidden: true`** — tab-away and back preserves rail position.

## Steps

| Step | What | Depends on |
|---|---|---|
| `step-01` | Move + rename `VerticalStepList` → `core/ui/components/navigation/StepRail.tsx`; fix the docstring | — |
| `step-02` | Unify the three section sources into one ordered `ConfigureSection[]` model | — |
| `step-03` | Replace the sidebar with the rail; render one section at a time | 01, 02 |
| `step-04` | Delete the dead hooks, the duplicate `toNavigationSection`, and the inlined `ServiceGroupList` | 03 |
| `step-05` | Dev Host verification, including the CSS-variable trap | 03 |

Steps 01 and 02 are independent and can run in parallel.

## Test strategy

Six suites are layout-coupled and will need rework, not deletion — they assert real
behaviour through a layout that is changing:

| Suite | Coupling |
|---|---|
| `ConfigureScreen-rendering.test.tsx` | Asserts `navigation-panel` testid + section labels; mocks `ContentWithSidebar` into `left-column`/`right-column` |
| `ConfigureScreen-authoring-experience.test.tsx` | Asserts "Authoring" appears **in the right-column nav** |
| `ConfigureScreen-validation.test.tsx` | `getElementById('field-…')`; mocks `scrollIntoView` |
| `ConfigureScreen-operations.test.tsx` | Layout + NavigationPanel mocks |
| `ConfigureScreen-store-discovery.test.tsx` | Asserts one field row **per field across all groups** — breaks when one section renders at a time |
| `hooks/useFieldFocusTracking.test.tsx` | Pins that `ConfigureScreen` calls the hook and passes three setters — all removed |

`configureHandlers.test.ts:128-130` pins the handler count at **5**. This refactor should
not change the message contract; if that count moves, something has gone wrong.

`StepRail` keeps its 17 existing tests, updated for the new path. The wizard's
`CommerceStep` / `StorefrontStep` tests must stay green untouched — that is the proof the
move was behaviour-preserving.

**Per the repo's TDD rule: tests first, and only test files may be edited during RED.**

## Out of scope

- Deep-linking to a section. Nothing deep-links today, though the App Builder
  "needs inputs" route (`appBuilderComponentHandlers.ts:356`) is the one place that
  would want it. Note it; do not build it.
- Reusing the wizard's `ConnectStoreStepContent` body. It already supports section
  slicing, but derives its config from `useComponentConfig` (stack-driven, pre-creation)
  while Configure uses `useSelectedComponents` (project-driven). Converging those is a
  separate piece of work.
- The `openConfigure` sidebar route, which currently points at the legacy QuickPick
  command rather than this webview (`sidebarProvider.ts:540-545`).

## Process note

The RPTC command calls for three architect agents here. Discovery plus the three user
decisions closed the design space, so this plan was written directly. Recorded so the
deviation is visible rather than silent.
