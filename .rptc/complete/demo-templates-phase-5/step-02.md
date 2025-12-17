# Step 2: Apply defaults on welcome exit

## Purpose

Call `applyTemplateDefaults()` when user clicks Continue on WelcomeStep to populate component selections from the selected template.

## Prerequisites

- Step 1 complete (templates available in hook)

## Tests to Write First

- [x] `goNext()` from 'welcome' step calls applyTemplateDefaults when template selected
- [x] `goNext()` from 'welcome' step does NOT call applyTemplateDefaults when no template selected
- [x] State.components reflects template defaults after navigation
- [x] `goNext()` from other steps does NOT apply template defaults

## Files to Modify

### `src/features/project-creation/ui/wizard/hooks/useWizardNavigation.ts`

**Changes:**
1. Import `applyTemplateDefaults` from templateDefaults
2. In `goNext()`, check if leaving 'welcome' step
3. If leaving welcome with template selected, apply defaults to state

## Implementation Details

```typescript
// In goNext() - add before navigation
if (state.currentStep === 'welcome' && state.selectedTemplate && templates) {
    setState(prev => applyTemplateDefaults(prev, templates));
}
```

## Expected Outcome

- When user selects template and clicks Continue:
  1. Template defaults applied to `state.components`
  2. Navigation proceeds to next step
  3. ComponentSelectionStep shows pre-populated selections

## Acceptance Criteria

- [x] Template defaults applied when leaving welcome step
- [x] No defaults applied when no template selected
- [x] No defaults applied when leaving other steps
- [x] Integration test: full flow works end-to-end
