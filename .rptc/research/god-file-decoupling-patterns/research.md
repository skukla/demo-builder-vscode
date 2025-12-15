# God File Decoupling Patterns Research

## Research Summary

**Topic**: Best practices for addressing tight coupling in remaining god files
**Date**: 2025-12-14
**Status**: Complete

## Current State

| File | Lines | Category | Coupling Issue |
|------|-------|----------|----------------|
| adobeEntityService.ts | 964 | Service class | Multiple entity domains (orgs, projects, workspaces) |
| WizardContainer.tsx | 737 | React component | State, navigation, step rendering combined |
| dashboardHandlers.ts | 475 | Handler file | Already reduced 40%, remaining handlers are cohesive |

## Key Findings

### 1. Service Class Decomposition (adobeEntityService.ts)

**Problem**: Single class manages three distinct entity domains (organizations, projects, workspaces) that change for different reasons - violating Single Responsibility Principle.

**Recommended Patterns**:

#### A. Decomposition by Business Capability
Split into separate services by entity domain:
- `OrganizationService` - Organization listing, selection, caching
- `ProjectService` - Project listing, selection, creation
- `WorkspaceService` - Workspace listing, selection

**Benefits**: Each service has single reason to change, independent testing, parallel development.

#### B. Repository Pattern + Service Layer
Separate data access from business logic:
```
adobeEntityService.ts (current)
↓
organizationRepository.ts  ← Data fetching (SDK/CLI)
organizationService.ts     ← Business logic orchestration
projectRepository.ts       ← Data fetching
projectService.ts          ← Business logic
workspaceRepository.ts     ← Data fetching
workspaceService.ts        ← Business logic
```

#### C. Facade Pattern (Transitional)
Keep `AdobeEntityService` as a facade during migration:
```typescript
class AdobeEntityService {
    constructor(
        private orgService: OrganizationService,
        private projectService: ProjectService,
        private workspaceService: WorkspaceService
    ) {}

    // Facade methods delegate to specialized services
    getOrganizations() { return this.orgService.getOrganizations(); }
}
```

**Recommended Approach**: Start with Facade pattern for backward compatibility, then gradually migrate consumers to direct service calls.

### 2. React Component Decomposition (WizardContainer.tsx)

**Problem**: Component manages multiple concerns - wizard state, step navigation, step rendering, form data, backend calls.

**Recommended Patterns**:

#### A. Custom Hook Extraction
Extract stateful logic into focused hooks:
- `useWizardNavigation` - Step progression, direction, enabled steps
- `useWizardState` - Form data, component selections, Adobe context
- `useWizardPersistence` - Backend calls, state commits, error handling

**Before**:
```tsx
function WizardContainer() {
    const [currentStep, setCurrentStep] = useState('');
    const [wizardState, setWizardState] = useState({});
    // 100+ lines of state management
    // 100+ lines of navigation logic
    // 200+ lines of step rendering
}
```

**After**:
```tsx
function WizardContainer() {
    const navigation = useWizardNavigation(enabledSteps);
    const state = useWizardState(importedSettings);
    const persistence = useWizardPersistence(state);

    // Simple orchestration, 50 lines
}
```

#### B. Compound Component Pattern
Use composition for step rendering:
```tsx
<Wizard>
    <Wizard.Header>
        <TimelineNav steps={navigation.steps} />
    </Wizard.Header>
    <Wizard.Content>
        <WizardStepRenderer step={navigation.currentStep} state={state} />
    </Wizard.Content>
    <Wizard.Footer>
        <WizardNavButtons navigation={navigation} />
    </Wizard.Footer>
</Wizard>
```

#### C. Step Renderer Component
Extract the large switch statement:
```typescript
// wizardStepRenderer.tsx
const STEP_COMPONENTS = {
    'welcome': WelcomeStep,
    'adobe-auth': AdobeAuthStep,
    'adobe-project': AdobeProjectStep,
    // ...
};

export function WizardStepRenderer({ stepId, ...props }) {
    const StepComponent = STEP_COMPONENTS[stepId];
    return StepComponent ? <StepComponent {...props} /> : null;
}
```

**Recommended Approach**:
1. Extract `useWizardNavigation` hook (navigation logic)
2. Extract `useWizardState` hook (state management)
3. Extract `WizardStepRenderer` component (step rendering switch)
4. Main component becomes thin orchestrator

### 3. Handler File Patterns (dashboardHandlers.ts)

**Note**: This file is already at 475 lines (down from 788 - 40% reduction). The remaining handlers are cohesive and follow consistent patterns.

**Current Assessment**: The file is now within acceptable limits. Each handler has a single responsibility and the mesh status helpers were correctly extracted.

**If Further Reduction Needed**:

#### A. Command Pattern
Convert handlers to command objects:
```typescript
class HandleRequestStatusCommand implements Command<StatusResponse> {
    constructor(private context: HandlerContext) {}

    async execute(): Promise<StatusResponse> {
        // Handler logic
    }
}
```

#### B. Strategy Pattern for Varying Behaviors
If handlers have conditional behavior based on project type or state:
```typescript
interface StatusCheckStrategy {
    checkStatus(project: Project): Promise<StatusResult>;
}

class MeshStatusStrategy implements StatusCheckStrategy { /* ... */ }
class NoMeshStatusStrategy implements StatusCheckStrategy { /* ... */ }
```

**Recommendation**: No immediate action needed - file is at acceptable size.

## Prioritized Action Plan

### Phase 1: WizardContainer.tsx (High Impact)
Extract custom hooks to reduce from 737 → ~250 lines.

**Files to Create**:
1. `useWizardNavigation.ts` (~150 lines) - Navigation state and logic
2. `useWizardState.ts` (~200 lines) - Wizard data state management
3. `WizardStepRenderer.tsx` (~80 lines) - Step component rendering

**Estimated Result**: WizardContainer.tsx → 250 lines (66% reduction)

### Phase 2: adobeEntityService.ts (Medium Impact)
Apply Facade + Repository pattern.

**Files to Create**:
1. `organizationService.ts` (~250 lines) - Organization operations
2. `projectService.ts` (~300 lines) - Project operations
3. `workspaceService.ts` (~200 lines) - Workspace operations
4. Keep `adobeEntityService.ts` as facade (~150 lines)

**Estimated Result**: adobeEntityService.ts → 150 lines facade (84% reduction)

### Phase 3: dashboardHandlers.ts (Low Priority)
No immediate action - already reduced to acceptable size.

## Anti-Patterns to Avoid

1. **Shared Database Coupling**: When splitting services, avoid having them share internal data structures
2. **Accidental Coupling**: Don't introduce hidden dependencies through shared state
3. **God Object Recreation**: Be vigilant that facade/coordinator doesn't accumulate new responsibilities
4. **Over-Extraction**: Don't extract hooks that are used only once

## Testing Strategy

For each extraction:
1. Write tests for extracted unit first (TDD)
2. Verify original component/service still works
3. Gradually migrate consumers to use new units directly
4. Remove facade when migration complete

## Sources

1. Martin Fowler - Service Layer Pattern
2. Refactoring Guru - Extract Class Refactoring
3. React Documentation - Custom Hooks
4. Kent C. Dodds - State Reducer Pattern
5. Domain-Driven Design - Bounded Contexts
