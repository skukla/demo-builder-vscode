# Component-Specific Wizard Timeline Steps - Research Report

**Created**: 2025-12-16
**Scope**: Codebase analysis
**Depth**: Standard
**Purpose**: Implementation planning

---

## Summary

The codebase has a **solid foundation** for implementing component-specific wizard steps. The configuration-first architecture is already in place with `wizard-steps.json`, `components.json`, and established patterns for dynamic behavior. The key gap is connecting component selection to step visibility.

---

## Codebase Analysis

### Current Step Architecture

**Step Configuration** (`templates/wizard-steps.json`):
```json
{
  "steps": [
    { "id": "welcome", "name": "Demo Setup", "enabled": true },
    { "id": "component-selection", "name": "Component Selection", "enabled": true },
    { "id": "api-mesh", "name": "API Mesh Setup", "enabled": false },
    // ... more steps
  ]
}
```

**Current Limitation**: Steps have `enabled` flag but no component-awareness. The `enabled` property is static, not reactive to component selection.

**Relevant Files**:
| File | Lines | Purpose |
|------|-------|---------|
| `templates/wizard-steps.json` | 1-59 | Step definitions |
| `src/types/webview.ts` | 10-26 | `WizardStep` union type |
| `src/features/project-creation/ui/wizard/wizardHelpers.ts` | 351-360 | `getEnabledWizardSteps()` |

---

### Existing Dynamic Patterns (Reusable)

#### Pattern 1: Conditional Step Processing (API Mesh)
- **Location**: `src/features/project-creation/ui/wizard/WizardContainer.tsx:120-128`
- Already checks if `commerce-mesh` is selected before processing mesh deployment
- Uses `hasMeshComponentSelected()` helper

```typescript
const hasMeshComponent = useMemo(
    () => hasMeshComponentSelected(state.components),
    [state.components],
);
```

#### Pattern 2: Dynamic Field Generation (Component Config)
- **Location**: `src/features/components/ui/steps/ComponentConfigStep.tsx:22-141`
- Dynamically generates configuration fields based on selected components
- Uses `serviceGroups` derived from component selection

#### Pattern 3: Component-Aware Prerequisites
- **Location**: `src/features/prerequisites/services/PrerequisitesManager.ts:47-115`
- `componentRequirements` in `prerequisites.json` drives which tools are checked per component

---

### Extension Points Identified

| Extension Point | Location | Current State |
|-----------------|----------|---------------|
| Step filtering | `wizardHelpers.ts:351-360` | Filters by `enabled` only |
| Step list calculation | `useWizardState.ts` - WIZARD_STEPS memo | Static after initial load |
| Step rendering | `WizardContainer.tsx:179-237` | Giant switch statement |
| Message handling | `HandlerRegistry.ts` | Centralized but not step-aware |

---

## Implementation Options

### Option 1: Extend wizard-steps.json with Component Metadata

**Approach**: Add `requiredComponents` field to step configuration

```json
{
  "steps": [
    { "id": "welcome", "name": "Demo Setup", "enabled": true },
    { "id": "component-selection", "name": "Component Selection", "enabled": true },
    {
      "id": "citisignal-setup",
      "name": "CitiSignal Configuration",
      "enabled": true,
      "requiredComponents": ["citisignal-nextjs"]
    },
    {
      "id": "mesh-configuration",
      "name": "Mesh Configuration",
      "enabled": true,
      "requiredComponents": ["commerce-mesh"]
    }
  ]
}
```

**Pros**:
- Follows existing configuration-first pattern
- No TypeScript type changes for existing steps
- Easy to understand and maintain

**Cons**:
- Still requires React component for each step
- Need to add `WizardStep` type union entries

---

### Option 2: Component-Defined Steps in components.json

**Approach**: Each component defines its own steps

```json
{
  "components": {
    "citisignal-nextjs": {
      "name": "Headless CitiSignal",
      "wizardSteps": [
        { "id": "citisignal-setup", "name": "Storefront Configuration", "position": "after:prerequisites" }
      ],
      "configuration": { ... }
    },
    "commerce-mesh": {
      "name": "Adobe Commerce API Mesh",
      "wizardSteps": [
        { "id": "mesh-endpoints", "name": "Mesh Endpoints", "position": "after:adobe-workspace" }
      ],
      "configuration": { ... }
    }
  }
}
```

**Pros**:
- Steps live with component definitions (high cohesion)
- Components fully self-contained
- Natural place for step metadata

**Cons**:
- More complex step ordering logic needed
- Step position resolution required
- Type system needs more work

---

### Option 3: Step Registry Pattern (Recommended for Long-term)

**Approach**: Replace switch statement with dynamic registry

**New file**: `src/features/project-creation/ui/wizard/stepRegistry.ts`

```typescript
export const STEP_COMPONENTS: Record<string, ComponentType<BaseStepProps>> = {
    'welcome': WelcomeStep,
    'component-selection': ComponentSelectionStep,
    'prerequisites': PrerequisitesStep,
    // ... registered at load time
};

export function registerStep(id: string, component: ComponentType<BaseStepProps>) {
    STEP_COMPONENTS[id] = component;
}
```

**Benefits**:
- Eliminates 60+ line switch statement
- Enables runtime step registration
- Cleaner component organization
- Easier testing

---

## Recommended Groundwork Approach

Given the goal of laying groundwork for future component-specific steps:

### Phase 1: Configuration Schema Extension
1. Add `requiredComponents?: string[]` to wizard-steps.json schema
2. Add `position?: string` for ordering hints (e.g., `"after:prerequisites"`)
3. Create JSON schema validation

### Phase 2: Step Filtering Infrastructure
1. Create `filterStepsByComponents()` in wizardHelpers.ts
2. Update `WIZARD_STEPS` memo in useWizardState to react to component selection
3. Ensure timeline automatically updates

### Phase 3: Step Registry (Optional but Valuable)
1. Create stepRegistry.ts with component map
2. Refactor renderStep() to use registry
3. Enables future dynamic step addition

---

## Key Files to Modify

| File | Purpose | Change Type |
|------|---------|-------------|
| `templates/wizard-steps.json` | Add `requiredComponents` field | Configuration |
| `templates/wizard-steps.schema.json` | Add schema validation | New file |
| `src/features/project-creation/ui/wizard/wizardHelpers.ts` | Add `filterStepsByComponents()` | New function |
| `src/features/project-creation/ui/wizard/hooks/useWizardState.ts` | Make WIZARD_STEPS reactive | Modify memo |
| `src/types/webview.ts` | Extend WizardStep type (for new steps) | Type change |

---

## Existing Patterns to Leverage

1. **`hasMeshComponentSelected()`** (`wizardHelpers.ts:328-330`) - Pattern for checking component selection
2. **`componentRequirements`** (`prerequisites.json`) - Pattern for component-to-feature mapping
3. **`serviceGroups`** (`ComponentConfigStep`) - Pattern for dynamic content based on components
4. **`logging.json` templates** - Pattern for JSON-driven runtime behavior

---

## Data Flow for Component-Specific Steps

```
User selects components in Component Selection Step
    |
    v
state.components updated via updateState()
    |
    v
useWizardState hook detects change
    |
    v
WIZARD_STEPS memo recalculates
    |
    v
filterStepsByComponents() filters based on requiredComponents
    |
    v
TimelineNav re-renders with updated step list
    |
    v
Navigation logic adjusts to new step sequence
```

---

## Key Files Reference

| Purpose | File | Lines | Key Content |
|---------|------|-------|-------------|
| Step config | `templates/wizard-steps.json` | 1-59 | JSON list of steps with enabled flag |
| Step types | `src/types/webview.ts` | 10-26 | Union type for all possible steps |
| Main orchestrator | `src/features/project-creation/ui/wizard/WizardContainer.tsx` | 179-237 | Switch-based step rendering |
| Step helpers | `src/features/project-creation/ui/wizard/wizardHelpers.ts` | 351-360 | `getEnabledWizardSteps()` |
| State management | `src/features/project-creation/ui/wizard/hooks/useWizardState.ts` | 167-237 | Hook managing all wizard state |
| Navigation | `src/features/project-creation/ui/wizard/hooks/useWizardNavigation.ts` | 87-266 | Step transitions & backend calls |
| Timeline UI | `src/features/project-creation/ui/wizard/TimelineNav.tsx` | 89-182 | Visual step timeline |
| Component registry | `templates/components.json` | 1-354 | All available components |
| Component selection | `src/features/components/ui/steps/ComponentSelectionStep.tsx` | 73-265 | Dynamic component UI |
| Prerequisites | `src/features/prerequisites/services/PrerequisitesManager.ts` | 47-115 | Component-aware prerequisites |
| Settings/Config | `src/features/components/ui/steps/ComponentConfigStep.tsx` | 22-141 | Dynamic config fields |
| Communication | `src/core/communication/webviewCommunicationManager.ts` | 1-200 | Message routing protocol |

---

## Key Takeaways

1. **Foundation exists**: Configuration-first patterns are established and working
2. **Primary gap**: Step filtering doesn't react to component selection
3. **Minimal change**: Can be done with ~50-100 lines of new code
4. **Type safety**: Will need `WizardStep` union updates for new step types
5. **Existing patterns**: API Mesh, ComponentConfig already demonstrate dynamic behavior

---

## Next Steps

1. **Plan the implementation**: Use `/rptc:plan "@component-specific-wizard-steps"` to create detailed implementation plan
2. **Choose approach**: Decide between Option 1 (wizard-steps.json extension) vs Option 2 (components.json steps)
3. **Consider Step Registry**: Evaluate if switch statement refactoring should be part of groundwork
