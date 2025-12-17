# Step 4: Callback Body Extraction (§6)

**Priority**: MEDIUM
**Violations**: 3 (2 are duplicates)
**Effort**: 30-45 minutes

---

## Objective

Extract complex transformation logic from inline callbacks to named functions.

---

## Violations to Fix

### 1 & 2. DUPLICATE: Service Group Transformation (2 files)

Both `ConfigureScreen.tsx` and `useComponentConfig.ts` have nearly identical code:

**src/features/dashboard/ui/configure/ConfigureScreen.tsx:290-307**
**src/features/components/ui/hooks/useComponentConfig.ts:208-218**

**Current** (in both files):
```typescript
.map(def => {
    const fields = groups[def.id] || [];
    const sortedFields = def.fieldOrder
        ? fields.sort((a, b) => {
            const aIndex = def.fieldOrder!.indexOf(a.key);
            const bIndex = def.fieldOrder!.indexOf(b.key);
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        })
        : fields;
    return { id: def.id, label: def.label, fields: sortedFields };
})
```

**Shared Helper** (create in `src/features/components/services/serviceGroupTransforms.ts`):
```typescript
import { ServiceGroupDef, UniqueField, ServiceGroup } from '@/types/components';

/**
 * Sort fields by field order, placing unordered fields at end (SOP §6 compliance)
 */
function sortByFieldOrder(fields: UniqueField[], fieldOrder: string[]): UniqueField[] {
    return [...fields].sort((a, b) => {
        const aIndex = fieldOrder.indexOf(a.key);
        const bIndex = fieldOrder.indexOf(b.key);
        const aPos = aIndex === -1 ? 999 : aIndex;
        const bPos = bIndex === -1 ? 999 : bIndex;
        return aPos - bPos;
    });
}

/**
 * Transform service group definition to service group with sorted fields (SOP §6 compliance)
 *
 * Extracts complex callback with nested sorting logic to named function.
 */
export function toServiceGroupWithSortedFields(
    def: ServiceGroupDef,
    groups: Record<string, UniqueField[]>
): ServiceGroup {
    const fields = groups[def.id] || [];

    const sortedFields = def.fieldOrder
        ? sortByFieldOrder(fields, def.fieldOrder)
        : fields;

    return {
        id: def.id,
        label: def.label,
        fields: sortedFields,
    };
}
```

**Usage** (in both files):
```typescript
import { toServiceGroupWithSortedFields } from '@/features/components/services/serviceGroupTransforms';

// Replace .map(def => {...}) with:
.map(def => toServiceGroupWithSortedFields(def, groups))
```

---

### 3. PrerequisitesManager.ts:346-356 - Install Step Builder

**Current**:
```typescript
templateSteps.map(templateStep => ({
    name: templateStep.name?.replace(/{version}/g, version) || `Install Node.js ${version}`,
    message: templateStep.message?.replace(/{version}/g, version) || `Installing Node.js ${version}`,
    commandTemplate: templateStep.commandTemplate?.replace(/{version}/g, version),
    commands: templateStep.commands,
    progressStrategy: templateStep.progressStrategy || ('synthetic' as const),
    progressParser: templateStep.progressParser,
    estimatedDuration: templateStep.estimatedDuration || 30000,
    milestones: templateStep.milestones,
    continueOnError: templateStep.continueOnError,
}))
```

**Helper Function** (add above the method in same file):
```typescript
/**
 * Transform template step to versioned install step (SOP §6 compliance)
 *
 * Replaces {version} placeholder in string properties and applies defaults.
 */
function toVersionedInstallStep(
    templateStep: InstallStepTemplate,
    version: string
): InstallStep {
    const replaceVersion = (str: string | undefined): string | undefined =>
        str?.replace(/{version}/g, version);

    return {
        name: replaceVersion(templateStep.name) || `Install Node.js ${version}`,
        message: replaceVersion(templateStep.message) || `Installing Node.js ${version}`,
        commandTemplate: replaceVersion(templateStep.commandTemplate),
        commands: templateStep.commands,
        progressStrategy: templateStep.progressStrategy || 'synthetic',
        progressParser: templateStep.progressParser,
        estimatedDuration: templateStep.estimatedDuration || 30000,
        milestones: templateStep.milestones,
        continueOnError: templateStep.continueOnError,
    };
}
```

**Usage**:
```typescript
templateSteps.map(step => toVersionedInstallStep(step, version))
```

---

## TDD Approach

### RED Phase

**Test file**: `tests/features/components/services/serviceGroupTransforms.test.ts`

```typescript
import { toServiceGroupWithSortedFields } from '@/features/components/services/serviceGroupTransforms';

describe('toServiceGroupWithSortedFields', () => {
    it('returns group with unsorted fields when no fieldOrder', () => {
        const def = { id: 'test', label: 'Test' };
        const groups = { test: [{ key: 'b' }, { key: 'a' }] };

        const result = toServiceGroupWithSortedFields(def, groups);

        expect(result.fields[0].key).toBe('b'); // Original order preserved
        expect(result.fields[1].key).toBe('a');
    });

    it('sorts fields by fieldOrder', () => {
        const def = { id: 'test', label: 'Test', fieldOrder: ['a', 'b'] };
        const groups = { test: [{ key: 'b' }, { key: 'a' }] };

        const result = toServiceGroupWithSortedFields(def, groups);

        expect(result.fields[0].key).toBe('a');
        expect(result.fields[1].key).toBe('b');
    });

    it('places unordered fields at end', () => {
        const def = { id: 'test', label: 'Test', fieldOrder: ['a'] };
        const groups = { test: [{ key: 'b' }, { key: 'a' }, { key: 'c' }] };

        const result = toServiceGroupWithSortedFields(def, groups);

        expect(result.fields[0].key).toBe('a');
        // b and c after a (order between them not guaranteed)
    });

    it('returns empty fields array when group not found', () => {
        const def = { id: 'test', label: 'Test' };
        const groups = {};

        const result = toServiceGroupWithSortedFields(def, groups);

        expect(result.fields).toEqual([]);
    });
});
```

**Test file**: `tests/features/prerequisites/services/PrerequisitesManager-transforms.test.ts`

```typescript
// Test the toVersionedInstallStep function
describe('toVersionedInstallStep', () => {
    it('replaces {version} placeholder in name and message', () => {
        const template = {
            name: 'Install Node.js {version}',
            message: 'Installing Node.js {version}...',
        };

        const result = toVersionedInstallStep(template, '20');

        expect(result.name).toBe('Install Node.js 20');
        expect(result.message).toBe('Installing Node.js 20...');
    });

    it('uses default name when template name is undefined', () => {
        const template = {};

        const result = toVersionedInstallStep(template, '20');

        expect(result.name).toBe('Install Node.js 20');
    });

    it('applies default progressStrategy', () => {
        const template = {};

        const result = toVersionedInstallStep(template, '20');

        expect(result.progressStrategy).toBe('synthetic');
    });

    it('applies default estimatedDuration', () => {
        const template = {};

        const result = toVersionedInstallStep(template, '20');

        expect(result.estimatedDuration).toBe(30000);
    });

    it('preserves template values when provided', () => {
        const template = {
            progressStrategy: 'line-count',
            estimatedDuration: 60000,
            continueOnError: true,
        };

        const result = toVersionedInstallStep(template, '20');

        expect(result.progressStrategy).toBe('line-count');
        expect(result.estimatedDuration).toBe(60000);
        expect(result.continueOnError).toBe(true);
    });
});
```

### GREEN Phase

1. Create `src/features/components/services/serviceGroupTransforms.ts`
2. Add `toVersionedInstallStep` to PrerequisitesManager.ts
3. Update both usage sites

### REFACTOR Phase

1. Run all tests
2. Verify no behavioral changes
3. Consider if more callbacks could use similar patterns

---

## Files Modified

1. **NEW**: `src/features/components/services/serviceGroupTransforms.ts` - Shared helper
2. `src/features/dashboard/ui/configure/ConfigureScreen.tsx` - Use shared helper
3. `src/features/components/ui/hooks/useComponentConfig.ts` - Use shared helper
4. `src/features/prerequisites/services/PrerequisitesManager.ts` - Add local helper
5. Test files

---

## Verification

```bash
# Run tests
npm run test:fast -- tests/features/components/services/serviceGroupTransforms
npm run test:fast -- tests/features/prerequisites/services/PrerequisitesManager

# Verify existing functionality
npm run test:fast -- tests/features/dashboard/ui/configure/ConfigureScreen
npm run test:fast -- tests/features/components/ui/hooks/useComponentConfig
```
