# Step 5: Wire Step into WizardContainer

## Purpose
Connect the EdsPreflightStep component to WizardContainer's step rendering and navigation system.

## Prerequisites
- [ ] Step 1 complete (EdsPreflightStep component exists)
- [ ] Step 2 complete (wizard-steps.json has eds-preflight entry)

## Implementation Details

### Component Import
Add import alongside other EDS steps (lines 43-47):
```typescript
import { EdsPreflightStep } from '@/features/eds/ui/steps/EdsPreflightStep';
```

### Step Rendering
Add case to `renderStep()` switch statement (after line 321):
```typescript
case 'eds-preflight':
    return <EdsPreflightStep {...props} />;
```

### Props Pattern
Component receives standard props object containing:
- `state`, `updateState` - wizard state management
- `onNext`, `onBack` - navigation callbacks
- `setCanProceed` - enable/disable Continue button
- `componentsData` - shared component data

## Files to Modify

### `src/features/project-creation/ui/wizard/WizardContainer.tsx`
1. Add import for EdsPreflightStep
2. Add switch case for 'eds-preflight' step ID

## Expected Outcome
- EdsPreflightStep renders when wizard navigates to eds-preflight step
- Navigation (Back/Next) works correctly
- Step receives proper state and callbacks

## Acceptance Criteria
- [ ] EdsPreflightStep imported from correct path
- [ ] Switch case matches step ID from wizard-steps.json
- [ ] Standard props passed to component
- [ ] No TypeScript errors
- [ ] Step renders in correct position in wizard flow

## Dependencies from Other Steps
- **Depends on**: Step 1 (component), Step 2 (step config)
- **Provides**: Complete wizard integration, enabling full E2E flow
