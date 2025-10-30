# Step 7: Fix Missing Properties on Object Types

## Objective

Fix object types that are incorrectly typed as `{}` (empty object) or have missing property definitions, resolving **40+ errors** across WizardContainer, hooks, and type definitions.

## Errors Addressed

### WizardContainer.tsx (20+ errors):
- Line 51: `undefined` not assignable to `boolean` (canProceed state)
- Line 292: Unknown property 'type' on FeedbackMessage
- Line 397: ComponentSelectionStepProps - state type incompatibility (WizardState vs Record<string, unknown>)
- Line 399: PrerequisitesStepProps - requiredNodeVersions property doesn't exist
- Line 413: ProjectCreationStepProps - missing 'onBack' property

### Hooks (6 errors):
- useVSCodeMessage.ts: Callback parameter types incompatible with `unknown`
- useVSCodeRequest.ts: Generic type constraints missing
- useMinimumLoadingTime.ts: NodeJS namespace not found

### ConfigureScreen.tsx (remaining):
- Lines 627, 633: Type mismatches in config object properties

## Root Cause Analysis

### 1. Empty Object Types (`{}`)

**Problem**: TypeScript infers `{}` when object structure isn't defined:

```typescript
const config: {} = { name: 'test' };
config.name;  // ❌ Property 'name' does not exist on type '{}'
```

**Root Cause**: Missing interface definitions or improper generic constraints.

### 2. Component Prop Type Mismatches

**Problem**: Props passed to step components don't match expected interfaces:

```typescript
interface PrerequisitesStepProps {
    state: WizardState;
    onNext: () => void;
}

// But component receives:
<PrerequisitesStep
    requiredNodeVersions={[...]}  // ❌ Not in interface
    state={state}
    onNext={onNext}
/>
```

**Root Cause**: Prop interfaces incomplete or outdated.

### 3. Undefined vs Boolean

**Problem**: Optional boolean typed as `boolean | undefined` but code uses `undefined` directly:

```typescript
const [canProceed, setCanProceed] = useState<boolean>(undefined);
//                                                     ^^^^^^^^^ Error: undefined not assignable to boolean
```

**Root Cause**: Incorrect initial state type.

### 4. NodeJS Namespace Missing

**Problem**: `NodeJS.Timeout` type not available:

```typescript
const timer: NodeJS.Timeout = setTimeout(...);
//           ^^^^^^ Cannot find namespace 'NodeJS'
```

**Root Cause**: Missing `@types/node` or incorrect tsconfig.

## Detailed Implementation

### File 1: wizard/components/WizardContainer.tsx - canProceed State

```typescript
// Line 51
// BEFORE:
const [canProceed, setCanProceed] = useState<boolean>(undefined);
//                                                     ^^^^^^^^^ Error

// AFTER - Option 1: Boolean with default false
const [canProceed, setCanProceed] = useState<boolean>(false);

// AFTER - Option 2: Boolean | undefined if truly optional
const [canProceed, setCanProceed] = useState<boolean | undefined>(undefined);
```

**Investigation needed**: Check if canProceed should start as `false` or `undefined` based on usage.

### File 2: wizard/components/WizardContainer.tsx - FeedbackMessage Type

```typescript
// Line 292
// BEFORE:
setFeedback({
    type: 'error',  // ❌ Property 'type' doesn't exist on FeedbackMessage
    // ...
});

// AFTER - Check FeedbackMessage interface:
// From shared/types/index.ts:
export interface FeedbackMessage {
    step: string;
    status: 'start' | 'progress' | 'complete' | 'error' | 'warning';
    primary: string;
    secondary?: string;
    // ...
}

// Fix: Use correct property names
setFeedback({
    step: currentStep,
    status: 'error',  // ✅ Correct property
    primary: errorMessage,
    // ...
});
```

### File 3: wizard/components/WizardContainer.tsx - Step Component Props

**Issue**: Step components receive props not in their interfaces.

**Investigation**:
```bash
# Find all step prop interfaces
grep -A 10 "interface.*StepProps" webview-ui/src/wizard/steps/*.tsx
```

**Fix Pattern**:

```typescript
// Define complete props interfaces

// ComponentSelectionStepProps
export interface ComponentSelectionStepProps {
    componentsData: any;
    state: WizardState;  // ✅ Use WizardState, not Record<string, unknown>
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => Promise<void>;
    onBack: () => void;
    setCanProceed: Dispatch<SetStateAction<boolean>>;
}

// PrerequisitesStepProps
export interface PrerequisitesStepProps {
    requiredNodeVersions: string[];  // ✅ Add missing property
    componentsData: any;
    currentStep: string;
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => Promise<void>;
    onBack: () => void;
    setCanProceed: Dispatch<SetStateAction<boolean>>;
}

// ProjectCreationStepProps
export interface ProjectCreationStepProps {
    state: WizardState;
    onBack: () => void;  // ✅ Add missing property
}
```

**Location**: These interfaces should be defined in the step files or in `wizard/types.ts`.

### File 4: shared/hooks/useVSCodeMessage.ts

**Issue**: Callback parameter type incompatibility with `unknown`.

```typescript
// BEFORE:
export function useVSCodeMessage(
    type: string,
    callback: (data: any) => void  // ❌ Should accept unknown
) {
    // ...
}

// AFTER - Option 1: Generic type parameter
export function useVSCodeMessage<T = unknown>(
    type: string,
    callback: (data: T) => void
) {
    // ...
    const unsubscribe = webviewClient.onMessage(type, (data) => {
        callback(data as T);  // Cast from unknown to T
    });
}

// Usage:
useVSCodeMessage<ProjectStatus>('project-status-update', (data) => {
    // data is ProjectStatus
    setProjectStatus(data);
});

// AFTER - Option 2: Accept unknown, let caller cast
export function useVSCodeMessage(
    type: string,
    callback: (data: unknown) => void  // ✅ Accept unknown
) {
    // ...
}

// Usage:
useVSCodeMessage('project-status-update', (data) => {
    const status = data as ProjectStatus;
    setProjectStatus(status);
});
```

**Recommended**: Option 1 (generic) for better type safety.

### File 5: shared/hooks/useVSCodeRequest.ts

**Issue**: Similar to useVSCodeMessage - needs generic support.

```typescript
// BEFORE:
export function useVSCodeRequest() {
    const request = async (type: string, payload?: any): Promise<any> => {
        return webviewClient.request(type, payload);
    };
    return request;
}

// AFTER:
export function useVSCodeRequest() {
    const request = async <T = unknown>(type: string, payload?: any): Promise<T> => {
        const result = await webviewClient.request(type, payload);
        return result as T;
    };
    return request;
}

// Usage:
const request = useVSCodeRequest();
const result = await request<VerifyProjectResult>('verify-adobe-project');
// result is typed as VerifyProjectResult
```

### File 6: shared/hooks/useMinimumLoadingTime.ts

**Issue**: NodeJS.Timeout type not found.

```typescript
// Line 39
// BEFORE:
const timer: NodeJS.Timeout = setTimeout(() => {
//           ^^^^^^ Cannot find namespace 'NodeJS'
    // ...
}, delay);

// AFTER - Option 1: Use ReturnType<typeof setTimeout>
const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    // ...
}, delay);

// AFTER - Option 2: Use number (setTimeout returns number in browser)
const timer: number = window.setTimeout(() => {
    // ...
}, delay);

// AFTER - Option 3: Add @types/node to tsconfig
// In tsconfig.json:
{
    "compilerOptions": {
        "types": ["node", "vscode"]  // Include node types
    }
}
```

**Recommended**: Option 1 (ReturnType) - works in both Node and browser environments.

### File 7: configure/ConfigureScreen.tsx - Config Object Properties

```typescript
// Lines 627, 633
// BEFORE:
const config = getConfig();
config.someProperty = value;  // ❌ Property doesn't exist on {}

// AFTER: Define proper config interface
interface ComponentConfig {
    [key: string]: string | boolean | number | undefined;
}

const config: ComponentConfig = getConfig();
config.someProperty = value;  // ✅ Works with index signature
```

**Investigation needed**: Check what getConfig() returns and define proper type.

## Test Strategy

### Pre-Implementation Test
```bash
# Count missing property errors
npm run compile:webview 2>&1 | grep -E "(does not exist on type|not assignable to type)" | wc -l
# Expected: 40+ errors
```

### Post-Implementation Test
```bash
# Test: TypeScript compilation
npm run compile:webview

# Expected: 40+ fewer errors
# Verify: No missing property errors in WizardContainer, hooks
```

### Manual Testing

**WizardContainer changes affect wizard flow**:

1. Run wizard from start to finish
2. Verify each step receives correct props
3. Test backward navigation (onBack)
4. Test canProceed state (Continue button enabled/disabled correctly)
5. Test error feedback messages
6. Verify prerequisites step with required Node versions

**Hook changes affect all message handling**:

1. Test project status updates (Dashboard)
2. Test auth messages (AdobeAuthStep)
3. Test request/response pattern (WizardContainer)

## Acceptance Criteria

- [ ] All step component prop interfaces complete and correct
- [ ] Hooks support proper generic typing
- [ ] No `{}` types where structured objects expected
- [ ] NodeJS namespace issues resolved
- [ ] TypeScript error count reduced by 40+
- [ ] No NEW errors introduced
- [ ] Wizard flows work correctly (manual test)
- [ ] Message handling works correctly (manual test)

## Estimated Time

**45 minutes** (complex type definitions, multiple files, testing required)

## Risk Level

**Medium** - Changes affect core wizard and message handling logic. Requires thorough testing to ensure no functional regressions.

## Dependencies

- **Depends on**: Step 5 (unknown type assertions) provides foundation for proper typing
- **Blocks**: None (but essential for completing type safety)

## Notes

- **Index Signatures**: Use `[key: string]: T` for flexible config objects, but prefer explicit interfaces when structure is known
- **Generic Hooks**: Adding generics to hooks improves type safety throughout the app
- **NodeJS Namespace**: Browser-only TypeScript projects shouldn't rely on NodeJS types - use ReturnType<typeof setTimeout> instead
- **After Fix**: Document hook usage patterns with generics in CLAUDE.md
- **Validation**: For runtime safety, consider adding validation for step props (ensure all required props provided)
