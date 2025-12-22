# Implementation Plan: Wizard Dependency-Based Navigation & Edit Mode

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Completed:** 2025-12-20

**Created:** 2025-12-14
**Last Updated:** 2025-12-14

---

## Executive Summary

**Feature:** Dependency-based step invalidation and project edit mode for the wizard

**Purpose:** Improve UX by allowing free navigation between completed steps without forcing users to re-walk unaffected steps. Enable editing existing projects by re-opening the wizard in edit mode.

**Approach:**
1. Define step dependency graph in `wizardHelpers.ts`
2. Modify backward navigation to only invalidate dependent steps
3. Add edit mode state to `WizardState`
4. Create project-to-wizard-state loader
5. Add "Edit..." action to project card menu
6. Create edit executor variant for applying changes

**Estimated Complexity:** Medium-Complex

**Estimated Timeline:** 3-5 days

**Key Risks:**
1. State consistency between create and edit modes
2. Component update conflicts during edit
3. Adobe context invalidation cascading to mesh

---

## Research References

**Research Document:** `.rptc/research/project-editing-post-wizard/research.md`

**Key Findings:**
- Strong foundational infrastructure exists (state management, settings serialization)
- Gap is primarily in entry points and orchestration
- `settingsSerializer.ts` already has `extractSettingsFromProject()` for loading
- Existing import flow provides pattern for pre-populating wizard

**Relevant Files Identified:**
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Main orchestrator
- `src/features/project-creation/ui/wizard/wizardHelpers.ts` - Navigation helpers
- `src/features/projects-dashboard/services/settingsSerializer.ts` - Settings extraction
- `src/features/projects-dashboard/handlers/dashboardHandlers.ts` - Handler patterns

---

## PM Decisions

| Question | Decision |
|----------|----------|
| **Scope** | All 5 phases - complete implementation |
| **Entry Point** | Card menu only (minimal) |
| **Step Visibility** | Green checkmarks - all steps appear completed in edit mode |
| **Safety** | Require demo stopped before editing |
| **Invalidation UX** | Immediate with visual feedback, no confirmation modals |
| **Progression** | Blocked until all invalidated steps resolved |
| **Pre-fill** | Invalidated steps show previous selection for quick re-confirmation |

### UX Flow on Invalidation

When user changes a step that has dependents:
1. Dependent steps immediately show orange ⚠ indicator
2. Independent steps remain green ✓ (preserved)
3. User can navigate freely to any completed/invalidated step
4. Review step blocked until all invalidated steps are resolved
5. Invalidated steps pre-fill with previous selection when revisited

**No confirmation modals** - the navigation flow itself enforces resolution.

---

## Step Dependency Graph

```
adobe-auth --> adobe-project --> adobe-workspace --> api-mesh
                                                  \
component-selection --> settings --> review        \--> mesh-deployment
```

**Invalidation Rules:**

| Step Changed | Steps Invalidated |
|--------------|-------------------|
| adobe-auth | adobe-project, adobe-workspace, api-mesh |
| adobe-project | adobe-workspace, api-mesh |
| adobe-workspace | api-mesh |
| component-selection | settings |
| settings | (none) |
| api-mesh | (none) |
| prerequisites | (none - standalone check) |
| review | (none - display only) |

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node), @testing-library/react (UI)
- **Coverage Goal:** 85% overall, 100% for dependency logic
- **Test Distribution:** Unit (75%), Integration (20%), E2E (5%)

### Test Categories

#### 1. Dependency Helper Functions (Unit)

- `getStepsToInvalidate()` returns correct dependent steps
- `isStepDependentOn()` checks single dependency correctly
- `getDependencyChain()` returns full dependency chain
- Edge cases: circular dependencies (should not exist), missing steps

#### 2. Smart Navigation (Integration)

- Backward navigation invalidates only dependent steps
- Completed non-dependent steps remain completed
- State clearing follows dependency rules

#### 3. Edit Mode (Integration)

- Wizard initializes with project data in edit mode
- All steps show as "completed" initially
- Changes trigger correct invalidation

#### 4. Edit Entry Point (Integration)

- "Edit..." menu item appears in project card
- Running demo shows warning before edit
- Wizard opens with pre-populated state

#### 5. Edit Executor (Integration)

- Detects component additions/removals
- Preserves unchanged components
- Updates Adobe context when changed

### Coverage Goals

**Overall Target:** 85%

**Component Breakdown:**

- `wizardHelpers.ts` - dependency functions: 100%
- `WizardContainer.tsx` - navigation logic: 90%
- `loadProjectIntoWizardState()`: 95%
- `dashboardHandlers.ts` - edit handler: 90%
- `editExecutor.ts`: 85%

**Excluded from Coverage:**

- Type definitions
- UI animation/transition code
- Console logging

---

## Implementation Constraints

- **File Size:** <500 lines (standard)
- **Complexity:** <50 lines/function, <10 cyclomatic
- **Dependencies:**
  - REUSE: Existing `computeStateUpdatesForBackwardNav()` pattern
  - REUSE: `extractSettingsFromProject()` from settingsSerializer
  - PROHIBITED: No new npm packages
- **Platforms:** Node.js 18+, VS Code 1.85+
- **Performance:** Step transition <300ms

---

## Risk Assessment

### Risk 1: State Inconsistency Between Modes

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** Critical
- **Description:** Create mode and edit mode may diverge in state handling, causing bugs when switching between them.
- **Mitigation:**
  1. Use single unified state shape (`WizardState`)
  2. Add `editMode` flag rather than separate state structure
  3. Test both modes with identical scenarios
  4. Add invariant checks for state consistency
- **Contingency:** Rollback to create-only mode if edit mode causes issues

### Risk 2: Component Update Conflicts

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** When editing component selections, removing a component while it's being used could cause issues.
- **Mitigation:**
  1. Require demo stopped before editing
  2. Show confirmation dialog for component removal
  3. Use existing snapshot/rollback pattern from componentUpdater
- **Contingency:** Limit edit mode to non-component changes only

### Risk 3: Adobe Context Invalidation Cascade

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** High
- **Priority:** High
- **Description:** Changing Adobe workspace could invalidate mesh deployment, but user might not realize they need to redeploy.
- **Mitigation:**
  1. Clear mesh status when workspace changes
  2. Show explicit warning about mesh redeployment
  3. Mark api-mesh step as needing review (not auto-skipped)
- **Contingency:** Force mesh step review when workspace changes

### Risk 4: Running Demo During Edit

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** Medium
- **Description:** User attempts to edit while demo is running, causing conflicts.
- **Mitigation:**
  1. Check demo status before allowing edit
  2. Show modal: "Stop demo before editing"
  3. Block edit action if demo is running
- **Contingency:** Force-stop demo before opening edit wizard

---

## File Reference Map

### Existing Files (To Modify)

**Core Wizard:**
- `src/features/project-creation/ui/wizard/wizardHelpers.ts` - Add dependency graph and helpers
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Add edit mode, smart navigation
- `src/features/project-creation/ui/wizard/TimelineNav.tsx` - Add 'invalidated' status, click-to-jump
- `src/types/webview.ts` - Add `editMode`, `completedSteps`, `invalidatedSteps` to WizardState
- `src/core/ui/styles/wizard.css` - Add invalidated step styling

**Dashboard:**
- `src/features/projects-dashboard/ui/components/ProjectCard.tsx` - Add "Edit..." menu action
- `src/features/projects-dashboard/handlers/dashboardHandlers.ts` - Add edit handler

**Test Files:**
- `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts` - Dependency tests
- `tests/features/project-creation/ui/wizard/WizardContainer-navigation.test.tsx` - Smart nav tests
- `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx` - Invalidated/click-to-jump tests

### New Files (To Create)

**Implementation Files:**
- `src/features/project-creation/helpers/projectToWizardState.ts` - Load project into wizard state
- `src/core/ui/components/feedback/ConfirmationDialog.tsx` - Reusable confirmation dialog

**Test Files:**
- `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx` - Edit mode tests
- `tests/features/project-creation/helpers/projectToWizardState.test.ts` - Loader tests
- `tests/core/ui/components/feedback/ConfirmationDialog.test.tsx` - Dialog tests

**Total Files:** 8 modified, 5 created

---

## Assumptions

- [x] **Assumption 1:** Mesh deployment step is currently disabled in wizard-steps.json
  - **Source:** FROM wizard-steps.json line 36-37
  - **Impact if Wrong:** Dependency graph needs adjustment for mesh-deployment step

- [x] **Assumption 2:** Settings import functionality works correctly
  - **Source:** FROM: existing import/export tests passing
  - **Impact if Wrong:** Need to fix import before edit mode will work

- [x] **Assumption 3:** Components can be safely added/removed when demo is stopped
  - **Source:** ASSUMED based on component lifecycle design
  - **Impact if Wrong:** Edit mode limited to non-component changes

---

## Plan Maintenance

**This is a living document.**

### How to Handle Changes During Implementation

1. **Small Adjustments:** Update plan inline, note in "Deviations" section
2. **Major Changes:** Use `/rptc:helper-update-plan` command
3. **Blockers:** Document in "Implementation Notes" section

### When to Request Replanning

Request full replan if:
- Step dependency graph needs fundamental redesign
- Edit mode approach doesn't work with existing state
- Security issues discovered with project loading

---

## Implementation Notes (Updated During TDD Phase)

_To be filled during implementation_

---

## Next Actions

**After Plan Approval:**

1. Step 1: Dependency infrastructure (`step-01.md`)
2. Step 1b: Timeline UI - invalidated state + click-to-jump (`step-01b.md`)
3. Step 2: Smart navigation in create mode (`step-02.md`)
4. Step 3: Edit mode foundation (`step-03.md`)
5. Step 4: Edit entry point (`step-04.md`)
6. Step 5: WizardContainer edit integration (`step-05.md`)
7. Step 6: Change executor (`step-06.md`)
8. Quality gates (Efficiency + Security)

**First Step:** Run `/rptc:tdd "@wizard-dependency-navigation/"` to begin TDD implementation
