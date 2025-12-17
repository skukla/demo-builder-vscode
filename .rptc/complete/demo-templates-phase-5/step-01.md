# Step 1: Add templates to navigation hook

## Purpose

Pass the templates array to `useWizardNavigation` hook so it has access to template definitions when applying defaults.

## Prerequisites

- Phase 4 complete (templates loaded in WizardContainer)
- `applyTemplateDefaults()` function exists in templateDefaults.ts

## Tests to Write First

- [x] `useWizardNavigation` accepts optional `templates` prop
- [x] Hook works correctly when templates is undefined (backward compatibility)

## Files to Modify

### `src/features/project-creation/ui/wizard/hooks/useWizardNavigation.ts`

**Changes:**
1. Add `templates?: DemoTemplate[]` to `UseWizardNavigationProps` interface
2. Accept templates in hook parameters

### `src/features/project-creation/ui/wizard/WizardContainer.tsx`

**Changes:**
1. Pass `templates` state to `useWizardNavigation` call

## Implementation Details

```typescript
// In useWizardNavigation.ts - add to interface
interface UseWizardNavigationProps {
    // ... existing props
    templates?: DemoTemplate[];
}

// In WizardContainer.tsx - pass templates
const { goNext, goBack, ... } = useWizardNavigation({
    // ... existing props
    templates,
});
```

## Expected Outcome

- Navigation hook has access to templates array
- No behavioral changes yet (defaults applied in Step 2)

## Acceptance Criteria

- [x] `templates` prop added to hook interface
- [x] WizardContainer passes templates to hook
- [x] All existing navigation tests pass
