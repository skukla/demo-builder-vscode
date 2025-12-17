# Step 2: Inline Object Operations

## Objective

Replace inline `Object.keys/values/entries` operations with existing type guard helpers or extract to named functions per SOP §4.

## Violations

| File | Line | Current Expression | Fix |
|------|------|-------------------|-----|
| `ConfigureScreen.tsx` | 90 | `Object.keys(existingEnvValues).length > 0` | Use `hasKeys(existingEnvValues)` |
| `ConfigureScreen.tsx` | 582 | `Object.keys(validationErrors).length === 0` | Use `!hasKeys(validationErrors)` |
| `componentManager.ts` | 459 | `Object.values(project.componentInstances).filter(...)` | Extract to `getInstalledComponents()` |
| `configure.ts` | 441-482 | Multiple inline Object operations | Extract to helper functions |

## Available Helpers (already exist)

From `src/types/typeGuards.ts`:
```typescript
export function hasKeys(obj: Record<string, unknown>): boolean {
    return Object.keys(obj).length > 0;
}

export function keyCount(obj: Record<string, unknown>): number {
    return Object.keys(obj).length;
}
```

## TDD Approach

### RED: Write Tests First

```typescript
// tests/features/dashboard/ui/configure/ConfigureScreen-helpers.test.ts
describe('ConfigureScreen uses type guards', () => {
    it('should use hasKeys for existingEnvValues check', () => {
        // Test that empty object returns false
        // Test that populated object returns true
    });
});

// tests/features/components/services/componentManager-helpers.test.ts
describe('getInstalledComponents helper', () => {
    it('should return only installed component instances', () => {
        const project = {
            componentInstances: {
                frontend: { status: 'installed' },
                backend: { status: 'error' },
                mesh: { status: 'installed' }
            }
        };
        const result = getInstalledComponents(project);
        expect(result).toHaveLength(2);
    });
});
```

### GREEN: Implementation

1. **ConfigureScreen.tsx** - Use existing `hasKeys()`:

```typescript
import { hasKeys } from '@/types/typeGuards';

// Line 90: Replace
if (existingEnvValues && hasKeys(existingEnvValues)) {

// Line 582: Replace
const canSave = !hasKeys(validationErrors);
```

2. **componentManager.ts** - Extract helper:

```typescript
// Add helper function at top of file
function getInstalledComponents(project: Project): ComponentInstance[] {
    return Object.values(project.componentInstances).filter(
        (instance) => instance.status === 'installed'
    );
}

// Line 459: Use helper
return getInstalledComponents(project);
```

3. **configure.ts** - Extract helpers for lines 441-482:

```typescript
// Add helper functions
function getAllConfigKeys(componentConfigs: Record<string, Config>): Set<string> {
    const allKeys = new Set<string>();
    for (const config of Object.values(componentConfigs)) {
        for (const key of Object.keys(config)) {
            allKeys.add(key);
        }
    }
    return allKeys;
}

function processConfigEntries(
    config: Record<string, unknown>,
    processor: (key: string, value: unknown) => void
): void {
    for (const [key, value] of Object.entries(config)) {
        processor(key, value);
    }
}
```

### REFACTOR: Verify

- Run full test suite
- Verify no inline `Object.keys/values/entries` with `.length` or array methods

## Files Changed

- `src/features/dashboard/ui/configure/ConfigureScreen.tsx` - Import and use `hasKeys()`
- `src/features/components/services/componentManager.ts` - Extract `getInstalledComponents()`
- `src/features/dashboard/commands/configure.ts` - Extract helper functions

## Acceptance Criteria

- [ ] `ConfigureScreen.tsx` uses `hasKeys()` from type guards
- [ ] `componentManager.ts` has extracted helper function
- [ ] `configure.ts` has extracted helper functions
- [ ] No inline `Object.keys().length` patterns remain
- [ ] All existing tests pass
