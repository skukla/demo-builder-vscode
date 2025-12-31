# Step 1: Extract getPluginNodeVersions to shared.ts

## Purpose

Extract the `requiredFor` filtering logic from `installHandler.ts` into a reusable pure function in `shared.ts`. This function determines which Node versions need a specific plugin installed based on the `requiredFor` array in the plugin definition.

**Why This Step First:**
- The filtering logic is self-contained and testable in isolation
- Once extracted, it can be reused by both `installHandler` (existing) and `checkHandler` (new usage)
- Pure function with no side effects makes TDD straightforward

## Prerequisites

- [x] Understanding of `NodeVersionMapping` structure: `Record<string, string>` mapping Node major version to component ID
- [x] Familiarity with `requiredFor` array in prerequisites.json plugin schema
- [x] Understanding of how dependencies array relates to component IDs

## Tests to Write First (RED Phase)

### Unit Tests for getPluginNodeVersions()

All tests should be pure function tests - no mocks needed since this is a simple filtering function.

**Test File:** `tests/features/prerequisites/handlers/shared-getPluginNodeVersions.test.ts`

#### Core Functionality Tests

- [x] **Test 1: Returns Node versions for components in requiredFor array**
  - **Given:** nodeVersionMapping `{'18': 'eds', '20': 'commerce-paas'}`, requiredFor `['eds']`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `['18']`

- [x] **Test 2: Returns multiple Node versions when multiple components match**
  - **Given:** nodeVersionMapping `{'18': 'eds', '20': 'commerce-paas', '24': 'headless'}`, requiredFor `['eds', 'commerce-paas']`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `['18', '20']`

- [x] **Test 3: Returns empty array when no components match requiredFor**
  - **Given:** nodeVersionMapping `{'18': 'eds', '20': 'commerce-paas'}`, requiredFor `['non-existent']`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `[]`

#### Dependency Handling Tests

- [x] **Test 4: Returns empty when dependency not directly in mapping**
  - **Given:** nodeVersionMapping `{'20': 'commerce-paas'}`, requiredFor `['commerce-mesh']`, dependencies `['commerce-mesh']`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `[]` (commerce-mesh not directly in mapping, even though it's in dependencies)

- [x] **Test 5: Handles dependencies that exist in nodeVersionMapping**
  - **Given:** nodeVersionMapping `{'18': 'eds', '20': 'commerce-mesh'}`, requiredFor `['commerce-mesh']`, dependencies `['commerce-mesh']`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `['20']`

- [x] **Test 6: Combines direct and dependency matches without duplicates**
  - **Given:** nodeVersionMapping `{'20': 'commerce-paas'}`, requiredFor `['commerce-paas', 'commerce-mesh']`, dependencies `['commerce-mesh']`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `['20']` (no duplicate even though both match same version)

#### Edge Case Tests

- [x] **Test 7: Handles empty nodeVersionMapping gracefully**
  - **Given:** nodeVersionMapping `{}`, requiredFor `['eds']`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `[]`

- [x] **Test 8: Handles empty requiredFor array**
  - **Given:** nodeVersionMapping `{'18': 'eds'}`, requiredFor `[]`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `[]`

- [x] **Test 9: Handles undefined dependencies parameter**
  - **Given:** nodeVersionMapping `{'18': 'eds'}`, requiredFor `['eds']`, dependencies `undefined`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `['18']`

- [x] **Test 10: Handles empty dependencies array**
  - **Given:** nodeVersionMapping `{'18': 'eds'}`, requiredFor `['eds']`, dependencies `[]`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `['18']`

- [x] **Test 11: Does not return duplicate versions**
  - **Given:** nodeVersionMapping `{'20': 'commerce-paas'}`, requiredFor `['commerce-paas']`, dependencies `['commerce-paas']`
  - **When:** `getPluginNodeVersions()` is called
  - **Then:** Returns `['20']` (single entry, not `['20', '20']`)

## Files to Create/Modify

### Modify: `src/features/prerequisites/handlers/shared.ts`

**Location:** After `hasNodeVersions()` function (~line 33)

**Changes:**
- Add `getPluginNodeVersions()` function (~25-30 lines)
- Export the new function

### Create: `tests/features/prerequisites/handlers/shared-getPluginNodeVersions.test.ts`

**Content:**
- 11 comprehensive unit tests
- Follows existing test patterns from `shared-dependencies.test.ts`
- No mocks needed (pure function tests)

## Implementation Details

### RED Phase (Write Failing Tests First)

```typescript
// tests/features/prerequisites/handlers/shared-getPluginNodeVersions.test.ts

import { getPluginNodeVersions, NodeVersionMapping } from '@/features/prerequisites/handlers/shared';

/**
 * Prerequisites Handlers - Plugin Node Version Filtering Test Suite
 *
 * Tests the getPluginNodeVersions utility function.
 * This function filters Node versions based on which components require a plugin.
 *
 * Total tests: 11
 */

describe('Prerequisites Handlers - getPluginNodeVersions', () => {
    describe('core functionality', () => {
        it('should return Node versions for components in requiredFor array', () => {
            const mapping: NodeVersionMapping = { '18': 'eds', '20': 'commerce-paas' };
            const requiredFor = ['eds'];

            const result = getPluginNodeVersions(mapping, requiredFor);

            expect(result).toEqual(['18']);
        });

        it('should return multiple Node versions when multiple components match', () => {
            const mapping: NodeVersionMapping = { '18': 'eds', '20': 'commerce-paas', '24': 'headless' };
            const requiredFor = ['eds', 'commerce-paas'];

            const result = getPluginNodeVersions(mapping, requiredFor);

            expect(result).toEqual(['18', '20']);
        });

        it('should return empty array when no components match requiredFor', () => {
            const mapping: NodeVersionMapping = { '18': 'eds', '20': 'commerce-paas' };
            const requiredFor = ['non-existent'];

            const result = getPluginNodeVersions(mapping, requiredFor);

            expect(result).toEqual([]);
        });
    });

    describe('dependency handling', () => {
        it('should return empty when dependency not directly in mapping', () => {
            const mapping: NodeVersionMapping = { '20': 'commerce-paas' };
            const requiredFor = ['commerce-mesh'];
            const dependencies = ['commerce-mesh'];

            const result = getPluginNodeVersions(mapping, requiredFor, dependencies);

            // commerce-mesh is in requiredFor and dependencies, but commerce-mesh
            // is NOT directly in the nodeVersionMapping (only commerce-paas is).
            // The function only finds direct component ID matches, not cross-references.
            expect(result).toEqual([]);
        });

        it('should find Node version for dependencies that exist in mapping', () => {
            const mapping: NodeVersionMapping = { '18': 'eds', '20': 'commerce-mesh' };
            const requiredFor = ['commerce-mesh'];
            const dependencies = ['commerce-mesh'];

            const result = getPluginNodeVersions(mapping, requiredFor, dependencies);

            expect(result).toEqual(['20']);
        });

        it('should combine direct and dependency matches without duplicates', () => {
            const mapping: NodeVersionMapping = { '20': 'commerce-paas' };
            const requiredFor = ['commerce-paas'];
            const dependencies = ['commerce-paas'];

            const result = getPluginNodeVersions(mapping, requiredFor, dependencies);

            expect(result).toEqual(['20']);
        });
    });

    describe('edge cases', () => {
        it('should handle empty nodeVersionMapping gracefully', () => {
            const mapping: NodeVersionMapping = {};
            const requiredFor = ['eds'];

            const result = getPluginNodeVersions(mapping, requiredFor);

            expect(result).toEqual([]);
        });

        it('should handle empty requiredFor array', () => {
            const mapping: NodeVersionMapping = { '18': 'eds' };
            const requiredFor: string[] = [];

            const result = getPluginNodeVersions(mapping, requiredFor);

            expect(result).toEqual([]);
        });

        it('should handle undefined dependencies parameter', () => {
            const mapping: NodeVersionMapping = { '18': 'eds' };
            const requiredFor = ['eds'];

            const result = getPluginNodeVersions(mapping, requiredFor, undefined);

            expect(result).toEqual(['18']);
        });

        it('should handle empty dependencies array', () => {
            const mapping: NodeVersionMapping = { '18': 'eds' };
            const requiredFor = ['eds'];

            const result = getPluginNodeVersions(mapping, requiredFor, []);

            expect(result).toEqual(['18']);
        });

        it('should not return duplicate versions', () => {
            const mapping: NodeVersionMapping = { '20': 'commerce-paas' };
            const requiredFor = ['commerce-paas'];
            const dependencies = ['commerce-paas'];

            const result = getPluginNodeVersions(mapping, requiredFor, dependencies);

            expect(result).toEqual(['20']);
            expect(result.length).toBe(1);
        });
    });
});
```

### GREEN Phase (Minimal Implementation)

Add to `src/features/prerequisites/handlers/shared.ts` after the `hasNodeVersions` function:

```typescript
/**
 * Get Node versions that require a specific plugin
 *
 * Filters the nodeVersionMapping to find which Node versions are used by
 * components that require this plugin (via requiredFor array). Also checks
 * dependencies for indirect requirements.
 *
 * @param nodeVersionMapping - Mapping of Node major version to component ID
 * @param requiredForComponents - Array of component IDs that require this plugin
 * @param dependencies - Optional array of dependency component IDs to also check
 * @returns Array of Node major versions that need this plugin installed
 *
 * @example
 * // Plugin required by 'eds' component, which uses Node 18
 * const versions = getPluginNodeVersions(
 *     { '18': 'eds', '20': 'commerce-paas' },
 *     ['eds']
 * );
 * // Returns: ['18']
 *
 * @example
 * // Plugin required by 'commerce-mesh' dependency
 * const versions = getPluginNodeVersions(
 *     { '20': 'commerce-paas' },
 *     ['commerce-mesh'],
 *     ['commerce-mesh']
 * );
 * // Returns: ['20'] if commerce-mesh maps to Node 20
 */
export function getPluginNodeVersions(
    nodeVersionMapping: NodeVersionMapping,
    requiredForComponents: string[],
    dependencies?: string[],
): string[] {
    const pluginNodeVersions: string[] = [];

    // Check direct component matches in nodeVersionMapping
    for (const [nodeVersion, componentId] of Object.entries(nodeVersionMapping)) {
        if (requiredForComponents.includes(componentId)) {
            pluginNodeVersions.push(nodeVersion);
        }
    }

    // Check dependencies for indirect matches
    if (dependencies && dependencies.length > 0) {
        for (const dep of dependencies) {
            if (requiredForComponents.includes(dep)) {
                // Find the Node version for this dependency component
                const depNodeVersion = Object.entries(nodeVersionMapping)
                    .find(([_, compId]) => compId === dep)?.[0];
                if (depNodeVersion && !pluginNodeVersions.includes(depNodeVersion)) {
                    pluginNodeVersions.push(depNodeVersion);
                }
            }
        }
    }

    return pluginNodeVersions;
}
```

### REFACTOR Phase (Improve While Tests Stay Green)

1. **Verify function placement** - Should be near other Node version helpers (`hasNodeVersions`, `getNodeVersionKeys`)
2. **Ensure consistent JSDoc style** - Match existing documentation patterns in shared.ts
3. **No duplicate code** - This extraction removes duplication from installHandler
4. **Consider sorting** - Return values in consistent order (ascending Node version)

## Expected Outcome

After completing this step:

- [x] New `getPluginNodeVersions()` function exported from `shared.ts`
- [x] All 11 unit tests passing in `shared-getPluginNodeVersions.test.ts`
- [x] Function follows pure function pattern (no side effects, no context dependency)
- [x] JSDoc documentation complete with examples
- [x] Function ready for use in Step 2 (checkHandler integration)

## Acceptance Criteria

- [x] Function extracts logic correctly matching installHandler.ts lines 308-331
- [x] All 11 unit tests pass
- [x] Function follows shared.ts patterns:
  - Pure function (no context parameter needed)
  - Clear TypeScript types
  - Proper JSDoc with @example
- [x] No runtime dependencies (can be tested without mocks)
- [x] Function is exported and available for import
- [x] Code coverage for new function is 100%

## Estimated Time

**1-2 hours**
- RED Phase: 30-45 minutes (write all tests)
- GREEN Phase: 15-20 minutes (implement function)
- REFACTOR Phase: 15-20 minutes (polish and verify)

## Notes

**Why Pure Function:**
The original code in installHandler uses `context.debugLogger.debug()` for logging, but this is informational only. The core filtering logic is pure - it just filters arrays based on membership. By extracting as a pure function:
1. Testing is simpler (no mocks)
2. Reuse is easier (no context needed)
3. Logic is more maintainable

**Sorting Consideration:**
The current implementation does not sort the returned versions. If consistent ordering is desired (e.g., `['18', '20']` always, not `['20', '18']`), add `.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))` in the refactor phase. This matches the pattern in `getNodeVersionKeys()`.
