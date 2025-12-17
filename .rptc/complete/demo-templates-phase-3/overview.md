# Implementation Plan: Demo Templates - Phase 3 (Template Selection Step)

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2025-12-16
**Last Updated:** 2025-12-16

---

## Executive Summary

**Feature:** Demo template selection step with card-based UI and automatic component defaults

**Purpose:** Enable users to select pre-configured demo templates (e.g., "CitiSignal Financial Services Demo") that pre-populate component selections, reducing cognitive load and ensuring validated configurations.

**Approach:**
1. Create `demo-templates.json` schema defining available templates with default component selections
2. Enhance WelcomeStep with template card grid UI using Adobe Spectrum
3. Simplify ComponentSelectionStep by removing External Systems and App Builder sections
4. Wire template defaults to component selection state via WizardState

**Estimated Complexity:** Medium (4 implementation steps, ~12-16 hours)

**Key Risks:**
- State synchronization between template selection and component defaults
- UI layout consistency with existing wizard patterns
- Dependency on Phase 2 (backend component IDs + OR logic) not yet implemented

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node), @testing-library/react (React components)
- **Coverage Goal:** 85% overall, 100% critical paths (template loading, state wiring)
- **Test Distribution:** Unit (70%), Integration (25%), E2E (5%)

### Test Scenarios Summary

**Happy Path:**
- Template card selection updates WizardState with correct defaults
- Component selection step receives and displays template defaults
- Simplified ComponentSelectionStep renders only Frontend/Backend sections

**Edge Cases:**
- No templates available (graceful fallback)
- Template with missing/invalid component IDs
- User modifies template defaults in ComponentSelectionStep

**Error Conditions:**
- Invalid demo-templates.json schema
- Template references non-existent component ID
- State update failures during template selection

---

## Acceptance Criteria

- [ ] `demo-templates.json` created with valid schema and at least 1 template
- [ ] WelcomeStep displays template cards in responsive grid layout
- [ ] Template selection pre-populates component defaults in WizardState
- [ ] ComponentSelectionStep shows only Frontend and Backend sections
- [ ] External Systems and App Builder sections removed from ComponentSelectionStep
- [ ] All existing tests continue to pass
- [ ] New tests cover template loading, selection, and state wiring
- [ ] Coverage maintained at 80%+

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation |
|------|----------|------------|--------|------------|
| Phase 2 not complete | Dependency | Medium | High | Verify Phase 2 merged before starting; plan can proceed with stub backend IDs |
| Template-component state sync issues | Technical | Medium | Medium | TDD approach with explicit state flow tests |
| Card grid layout inconsistencies | Technical | Low | Low | Reuse existing card patterns from projects-dashboard |
| Breaking existing wizard flow | Technical | Low | High | Integration tests for full wizard flow |

---

## Dependencies

### New Files
- `templates/demo-templates.json` - Template definitions
- `templates/demo-templates.schema.json` - JSON schema for validation

### Modified Files
- `src/features/project-creation/ui/steps/WelcomeStep.tsx` - Add template card grid
- `src/features/components/ui/steps/ComponentSelectionStep.tsx` - Remove External Systems/App Builder sections
- `src/features/components/ui/hooks/useComponentSelection.ts` - Support template defaults
- `src/types/webview.ts` - Add selectedTemplate to WizardState

### Existing Patterns to Reuse
- `templates/defaults.json` - Default selection pattern
- `src/features/projects-dashboard/ui/components/ProjectCard.tsx` - Card UI pattern
- `src/features/projects-dashboard/ui/components/ProjectsGrid.tsx` - Grid layout pattern

---

## Implementation Constraints

- File Size: <500 lines (standard)
- Complexity: <50 lines/function, <10 cyclomatic
- Dependencies: Reuse existing Spectrum components and card patterns
- Platforms: Node.js 18+, VS Code 1.85+
- Performance: Template loading <100ms

---

## Coordination Notes

**Step Dependencies:**
1. Step 1 (demo-templates.json) must complete before Step 2 (WelcomeStep can load templates)
2. Step 2 (WelcomeStep) and Step 3 (ComponentSelectionStep simplification) can run in parallel
3. Step 4 (state wiring) depends on Steps 1, 2, and 3

**Phase 2 Dependency:** This Phase 3 plan assumes Phase 2 (backend component IDs + OR logic) is complete. If not, Step 1 should use existing component IDs from components.json.

---

## Next Actions

1. Execute with `/rptc:tdd "@demo-templates-phase-3/"`
2. Start with Step 1: Create demo-templates.json schema
3. Quality gates: Efficiency Agent then Security Agent (if enabled)

---

## Implementation Steps

| Step | Title | Description | Status |
|------|-------|-------------|--------|
| 1 | Create Demo Templates Schema | Define `demo-templates.json` schema and initial template | Pending |
| 2 | Enhance WelcomeStep | Add template card grid UI for selection | Pending |
| 3 | Simplify ComponentSelectionStep | Remove External Systems and App Builder sections | Pending |
| 4 | Wire Template Defaults | Connect template selection to component state | Pending |

---

_Plan created by Master Feature Planner_
_Status: Ready for TDD Implementation_
