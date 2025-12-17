# Implementation Plan: Demo Templates - Phase 5 (Template Defaults Integration)

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Complete

**Created:** 2025-12-16
**Last Updated:** 2025-12-16

---

## Executive Summary

**Feature:** Wire up template defaults to auto-populate component selections

**Purpose:** When user selects a demo template on WelcomeStep and clicks Continue, automatically apply the template's default component selections to wizard state.

**Approach:**
1. Pass templates array to `useWizardNavigation` hook
2. Call `applyTemplateDefaults()` in `goNext()` when leaving 'welcome' step

**Estimated Complexity:** Simple (2 implementation steps)

**Key Risks:**
- None significant - core function already exists and is tested

---

## Test Strategy

**Framework:** Jest with @testing-library/react
**Coverage Goals:** 85%+

**Test Scenarios Summary:**
1. `goNext()` applies template defaults when leaving welcome step with template selected
2. `goNext()` does not modify state when no template selected
3. Components state reflects template defaults after navigation

---

## Acceptance Criteria

- [x] `useWizardNavigation` receives templates prop
- [x] `applyTemplateDefaults()` called when leaving 'welcome' step
- [x] Component selections pre-populated after template selection
- [x] All existing tests continue to pass
- [x] New tests cover the integration point

---

## File Reference Map

### Existing Files to Modify
- `src/features/project-creation/ui/wizard/hooks/useWizardNavigation.ts` - Add templates prop, call applyTemplateDefaults
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Pass templates to useWizardNavigation

### Existing Files (No Changes)
- `src/features/project-creation/ui/helpers/templateDefaults.ts` - Already has applyTemplateDefaults()

---

## Implementation Steps

| Step | Title | Description | Status |
|------|-------|-------------|--------|
| 1 | Add templates to navigation hook | Pass templates array to useWizardNavigation | Complete |
| 2 | Apply defaults on welcome exit | Call applyTemplateDefaults when goNext from welcome | Complete |

---

## Next Actions

1. Execute with `/rptc:tdd "@demo-templates-phase-5/"`
