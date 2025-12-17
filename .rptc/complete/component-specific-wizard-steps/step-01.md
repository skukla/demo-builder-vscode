# Step 1: Extend wizard-steps.json with requiredComponents Field

## Objective

Add an optional `requiredComponents` field to the wizard step configuration schema. This field specifies which components must be selected for a step to appear in the wizard timeline.

## Prerequisites

- None (this is the first step)

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `templates/wizard-steps.json` | Configuration | Add `requiredComponents` field to step definitions |
| `src/features/project-creation/ui/wizard/wizardHelpers.ts` | Type | Extend `WizardStepConfig` interface |

## Implementation Details

### 1.1 Extend WizardStepConfig Interface

**Location:** `src/features/project-creation/ui/wizard/wizardHelpers.ts`

**Current interface** (approximately lines 20-30):
```typescript
interface WizardStepConfig {
    id: string;
    name: string;
    enabled: boolean;
}
```

**Updated interface:**
```typescript
interface WizardStepConfig {
    id: string;
    name: string;
    enabled: boolean;
    requiredComponents?: string[];  // NEW: Optional component IDs
}
```

### 1.2 Update wizard-steps.json Schema

**Location:** `templates/wizard-steps.json`

**Example with new field:**
```json
{
  "steps": [
    { "id": "adobe-auth", "name": "Adobe Setup", "enabled": true },
    { "id": "component-selection", "name": "Component Selection", "enabled": true },
    { "id": "prerequisites", "name": "Prerequisites", "enabled": true },
    { "id": "api-mesh", "name": "API Mesh Setup", "enabled": true, "requiredComponents": ["commerce-mesh"] },
    { "id": "review", "name": "Review", "enabled": true },
    { "id": "project-creation", "name": "Creating Project", "enabled": true }
  ]
}
```

**Behavior:**
- Steps WITHOUT `requiredComponents`: Always shown (backward compatible)
- Steps WITH `requiredComponents`: Shown only when ALL listed components are selected

## Test Specifications

### Test 1.1: Interface Backward Compatibility
**File:** `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts`

```typescript
describe('WizardStepConfig interface', () => {
    it('should accept step config without requiredComponents', () => {
        const step: WizardStepConfig = {
            id: 'welcome',
            name: 'Welcome',
            enabled: true
        };
        expect(step.requiredComponents).toBeUndefined();
    });

    it('should accept step config with requiredComponents', () => {
        const step: WizardStepConfig = {
            id: 'mesh-config',
            name: 'Mesh Configuration',
            enabled: true,
            requiredComponents: ['commerce-mesh']
        };
        expect(step.requiredComponents).toEqual(['commerce-mesh']);
    });

    it('should accept step config with multiple requiredComponents', () => {
        const step: WizardStepConfig = {
            id: 'advanced-config',
            name: 'Advanced Configuration',
            enabled: true,
            requiredComponents: ['commerce-mesh', 'citisignal-nextjs']
        };
        expect(step.requiredComponents).toHaveLength(2);
    });
});
```

### Test 1.2: JSON Loading with New Field
**File:** `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts`

```typescript
describe('loadWizardSteps with requiredComponents', () => {
    it('should parse steps with requiredComponents field', () => {
        const mockConfig = {
            steps: [
                { id: 'welcome', name: 'Welcome', enabled: true },
                { id: 'mesh', name: 'Mesh', enabled: true, requiredComponents: ['commerce-mesh'] }
            ]
        };

        const steps = parseWizardStepsConfig(mockConfig);

        expect(steps[0].requiredComponents).toBeUndefined();
        expect(steps[1].requiredComponents).toEqual(['commerce-mesh']);
    });

    it('should handle empty requiredComponents array', () => {
        const mockConfig = {
            steps: [
                { id: 'test', name: 'Test', enabled: true, requiredComponents: [] }
            ]
        };

        const steps = parseWizardStepsConfig(mockConfig);

        expect(steps[0].requiredComponents).toEqual([]);
    });
});
```

## Acceptance Criteria

- [ ] `WizardStepConfig` interface extended with optional `requiredComponents?: string[]`
- [ ] `wizard-steps.json` can include `requiredComponents` field without breaking
- [ ] Existing steps without `requiredComponents` continue to work
- [ ] Type safety maintained - TypeScript compiles without errors
- [ ] All existing wizard tests pass

## Notes

- This step is purely additive - no behavioral changes yet
- The `requiredComponents` field is only consumed in Step 2
- Empty array `[]` should behave same as undefined (always shown)
