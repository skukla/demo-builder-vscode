# Step 3: JSX Complexity Extraction (§5)

**Priority**: MEDIUM
**Violations**: 2
**Effort**: 45-60 minutes

---

## Objective

Extract conditional rendering logic from JSX when there are more than 2 branches.

---

## Violations to Fix

### 1. src/features/authentication/ui/steps/AdobeAuthStep.tsx:105-111 (3 branches - BORDERLINE)

**Current**:
```tsx
<Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '450px' }}>
    {adobeAuth.orgLacksAccess ? (
        <>No organizations are currently accessible. Please choose an organization with App Builder enabled.</>
    ) : adobeAuth.requiresOrgSelection ? (
        "Your previous organization is no longer accessible. Please select a new organization."
    ) : (
        <>You're signed in to Adobe, but haven't selected an organization yet.</>
    )}
</Text>
```

**Helper Function**:
```typescript
/**
 * Get organization selection message based on auth state (SOP §5 compliance)
 */
function getOrgSelectionMessage(adobeAuth: AdobeAuthState): string {
    if (adobeAuth.orgLacksAccess) {
        return 'No organizations are currently accessible. Please choose an organization with App Builder enabled.';
    }
    if (adobeAuth.requiresOrgSelection) {
        return 'Your previous organization is no longer accessible. Please select a new organization.';
    }
    return "You're signed in to Adobe, but haven't selected an organization yet.";
}
```

**Usage**:
```tsx
<Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '450px' }}>
    {getOrgSelectionMessage(adobeAuth)}
</Text>
```

---

### 2. src/features/project-creation/ui/components/ConfigurationSummary.tsx:162-212 (8 branches - CRITICAL)

**Current**: Complex 8-branch nested ternary determining API Mesh status display.

**Helper Function**:
```typescript
interface ApiMeshStatusProps {
    state: WizardState;
    currentStepIndex: number;
    stepOrder: string[];
    completedSteps: string[];
}

/**
 * Render API Mesh status section based on wizard state (SOP §5 compliance)
 *
 * Handles 8 different display states:
 * 1. No workspace selected
 * 2. Before mesh step, never visited
 * 3. Before mesh step, previously visited (waiting)
 * 4. Checking mesh status
 * 5. Mesh exists and deployed
 * 6. API enabled but no mesh
 * 7. API not enabled
 * 8. Default/unknown state
 */
function renderApiMeshStatus({
    state,
    currentStepIndex,
    stepOrder,
    completedSteps,
}: ApiMeshStatusProps): React.ReactNode {
    const meshStepIndex = stepOrder.indexOf('api-mesh');
    const hasVisitedMesh = completedSteps.includes('api-mesh');

    // No workspace selected
    if (!state.adobeWorkspace) {
        return <Text UNSAFE_className="text-sm text-gray-600">Not selected</Text>;
    }

    // Before mesh step, never visited
    if (currentStepIndex < meshStepIndex && !hasVisitedMesh) {
        return <Text UNSAFE_className="text-sm text-gray-600">Not selected</Text>;
    }

    // Before mesh step, previously visited (show waiting)
    if (currentStepIndex < meshStepIndex && hasVisitedMesh) {
        return (
            <Flex gap="size-100" alignItems="center">
                <Clock size="S" UNSAFE_className="text-gray-500" />
                <Text UNSAFE_className="text-sm text-gray-600">Waiting</Text>
            </Flex>
        );
    }

    // Currently checking
    if (state.apiMesh?.isChecking) {
        return (
            <Flex gap="size-100" alignItems="center">
                <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                <Text UNSAFE_className="text-sm text-gray-600">Checking...</Text>
            </Flex>
        );
    }

    // API enabled and mesh exists
    if (state.apiMesh?.apiEnabled && state.apiMesh?.meshExists) {
        return (
            <Flex gap="size-100" alignItems="center">
                {renderMeshStatusIcon(state.apiMesh.meshStatus)}
                <Text UNSAFE_className="text-sm text-gray-600">
                    {getMeshStatusText(state.apiMesh.meshStatus)}
                </Text>
            </Flex>
        );
    }

    // API enabled but no mesh
    if (state.apiMesh?.apiEnabled && !state.apiMesh?.meshExists) {
        return (
            <Flex gap="size-100" alignItems="center">
                <AlertCircle size="S" UNSAFE_className="text-orange-500" />
                <Text UNSAFE_className="text-sm text-orange-600">Not created</Text>
            </Flex>
        );
    }

    // API not enabled
    if (state.apiMesh?.apiEnabled === false) {
        return (
            <Flex gap="size-100" alignItems="center">
                <AlertCircle size="S" UNSAFE_className="text-gray-500" />
                <Text UNSAFE_className="text-sm text-gray-600">Not available</Text>
            </Flex>
        );
    }

    // Default state
    return (
        <Flex gap="size-100" alignItems="center">
            <Clock size="S" UNSAFE_className="text-gray-500" />
            <Text UNSAFE_className="text-sm text-gray-600">Pending</Text>
        </Flex>
    );
}

/**
 * Render mesh status icon based on status
 */
function renderMeshStatusIcon(meshStatus: string | undefined): React.ReactNode {
    if (meshStatus === 'deployed') {
        return <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />;
    }
    if (meshStatus === 'error') {
        return <AlertCircle size="S" UNSAFE_className="text-red-500" />;
    }
    return <Clock size="S" UNSAFE_className="text-gray-500" />;
}

/**
 * Get mesh status display text
 */
function getMeshStatusText(meshStatus: string | undefined): string {
    if (meshStatus === 'deployed') return 'Deployed';
    if (meshStatus === 'error') return 'Error';
    return 'Pending';
}
```

**Usage**:
```tsx
<View marginTop="size-200" marginBottom="size-200">
    <Text UNSAFE_className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        API Mesh
    </Text>
    <View marginTop="size-100">
        {renderApiMeshStatus({
            state,
            currentStepIndex: getCurrentStepIndex(),
            stepOrder,
            completedSteps,
        })}
    </View>
</View>
```

---

## TDD Approach

### RED Phase

**Test file**: `tests/features/authentication/ui/steps/AdobeAuthStep-messages.test.ts`

```typescript
import { getOrgSelectionMessage } from '@/features/authentication/ui/steps/authHelpers';

describe('getOrgSelectionMessage', () => {
    it('returns lacks access message when orgLacksAccess is true', () => {
        const result = getOrgSelectionMessage({ orgLacksAccess: true } as any);
        expect(result).toContain('No organizations are currently accessible');
    });

    it('returns requires selection message when requiresOrgSelection is true', () => {
        const result = getOrgSelectionMessage({ requiresOrgSelection: true } as any);
        expect(result).toContain('previous organization is no longer accessible');
    });

    it('returns default message otherwise', () => {
        const result = getOrgSelectionMessage({} as any);
        expect(result).toContain("haven't selected an organization yet");
    });
});
```

**Test file**: `tests/features/project-creation/ui/components/ConfigurationSummary-apiMesh.test.tsx`

```typescript
import { render } from '@testing-library/react';
import { renderApiMeshStatus } from '@/features/project-creation/ui/components/configurationSummaryHelpers';

describe('renderApiMeshStatus', () => {
    it('shows "Not selected" when no workspace', () => {
        const result = renderApiMeshStatus({
            state: { adobeWorkspace: undefined },
            currentStepIndex: 0,
            stepOrder: ['step1', 'api-mesh'],
            completedSteps: [],
        });
        // Assert text content
    });

    it('shows "Checking..." when isChecking', () => {
        const result = renderApiMeshStatus({
            state: {
                adobeWorkspace: { id: '1' },
                apiMesh: { isChecking: true }
            },
            currentStepIndex: 1,
            stepOrder: ['step1', 'api-mesh'],
            completedSteps: [],
        });
        // Assert checking state
    });

    // ... tests for all 8 states
});
```

### GREEN Phase

1. Create helper functions
2. Update JSX to use helpers
3. Ensure all imports are correct

### REFACTOR Phase

1. Verify visual appearance unchanged
2. Run existing component tests
3. Consider extracting to separate file if helpers grow

---

## Files Modified

1. `src/features/authentication/ui/steps/AdobeAuthStep.tsx` - Add `getOrgSelectionMessage()`
2. `src/features/project-creation/ui/components/ConfigurationSummary.tsx` - Add render helpers
3. Test files for each helper

---

## Verification

```bash
# Run component tests
npm run test:fast -- tests/features/authentication/ui/steps/AdobeAuthStep
npm run test:fast -- tests/features/project-creation/ui/components/ConfigurationSummary

# Visual verification
# Open wizard and verify ConfigurationSummary displays correctly in all states
```
