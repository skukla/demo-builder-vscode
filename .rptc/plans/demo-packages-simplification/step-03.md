# Step 3: Create unified loader

## Purpose

Create `demoPackageLoader.ts` with functions to load demo packages from JSON and retrieve storefronts for specific stacks. This replaces the separate `brandStackLoader.ts` and `templateLoader.ts` loaders with a single unified loader following the same async patterns.

## Prerequisites

- [x] Step 1: demo-packages.json created with storefronts structure
- [x] Step 2: DemoPackage, Storefront, DemoPackagesConfig types defined

## Tests to Write First (TDD)

**File:** `tests/features/project-creation/ui/helpers/demoPackageLoader.test.ts`

### Happy Path Tests

- [x] Test: loadDemoPackages() returns array of DemoPackage objects
- [x] Test: loadDemoPackages() returns exactly 2 packages (citisignal, buildright)
- [x] Test: loadDemoPackages() returns packages with storefronts keyed by stack ID
- [x] Test: getStorefrontForStack() returns correct storefront with GitSource object
- [x] Test: getStorefrontForStack() returns storefront with submodules when defined
- [x] Test: getPackageById() returns matching package
- [x] Test: getAvailableStacksForPackage() returns stack IDs for package
- [x] Test: getAllStorefronts() returns all 5 storefronts with context

### Edge Case Tests

- [x] Test: getStorefrontForStack() returns undefined for unknown stack
- [x] Test: getStorefrontForStack() returns undefined for unknown package
- [x] Test: getPackageById() returns undefined for unknown package
- [x] Test: getPackageById() returns undefined for empty string
- [x] Test: getAvailableStacksForPackage() returns empty array for unknown package

### Validation Tests

- [x] Test: loadDemoPackages() returns packages without contentSources (derivable)
- [x] Test: Storefronts have GitSource object (not string)

## Files to Create

| File | Purpose |
|------|---------|
| `src/features/project-creation/ui/helpers/demoPackageLoader.ts` | Unified loader with loadDemoPackages(), getStorefrontForStack(), getPackageById() |

## Implementation Details

### RED Phase

Create test file with failing tests:

```typescript
// tests/features/project-creation/ui/helpers/demoPackageLoader.test.ts
import {
    loadDemoPackages,
    getStorefrontForStack,
    getPackageById,
} from '@/features/project-creation/ui/helpers/demoPackageLoader';

describe('demoPackageLoader', () => {
    describe('loadDemoPackages', () => {
        it('returns array of DemoPackage objects', async () => {
            const packages = await loadDemoPackages();

            expect(Array.isArray(packages)).toBe(true);
            expect(packages.length).toBeGreaterThan(0);
        });

        it('returns all packages from JSON', async () => {
            const packages = await loadDemoPackages();

            // Expect 5 packages based on merged brands + templates
            expect(packages.length).toBe(5);
        });

        it('each package has required properties', async () => {
            const packages = await loadDemoPackages();

            packages.forEach(pkg => {
                expect(pkg.id).toBeDefined();
                expect(pkg.name).toBeDefined();
                expect(pkg.configDefaults).toBeDefined();
                expect(pkg.contentSources).toBeDefined();
                expect(pkg.storefronts).toBeDefined();
            });
        });
    });

    describe('getPackageById', () => {
        it('returns matching package', async () => {
            const pkg = await getPackageById('citisignal');

            expect(pkg).toBeDefined();
            expect(pkg?.id).toBe('citisignal');
            expect(pkg?.name).toBe('CitiSignal');
        });

        it('returns undefined for unknown package', async () => {
            const pkg = await getPackageById('nonexistent');

            expect(pkg).toBeUndefined();
        });
    });

    describe('getStorefrontForStack', () => {
        it('returns correct storefront for valid package and stack', async () => {
            const storefront = await getStorefrontForStack('citisignal', 'headless-paas');

            expect(storefront).toBeDefined();
            expect(storefront?.source).toBeDefined();
            expect(typeof storefront?.source).toBe('string');
        });

        it('returns storefront with submodules when defined', async () => {
            // Test with a package that has submodules
            const storefront = await getStorefrontForStack('citisignal', 'headless-paas');

            // Submodules are optional - just ensure structure is correct if present
            if (storefront?.submodules) {
                expect(typeof storefront.submodules).toBe('object');
            }
        });

        it('returns undefined for unknown stack', async () => {
            const storefront = await getStorefrontForStack('citisignal', 'nonexistent-stack');

            expect(storefront).toBeUndefined();
        });

        it('returns undefined for unknown package', async () => {
            const storefront = await getStorefrontForStack('nonexistent', 'headless-paas');

            expect(storefront).toBeUndefined();
        });
    });
});
```

### GREEN Phase

Create the unified loader following existing patterns:

```typescript
// src/features/project-creation/ui/helpers/demoPackageLoader.ts
/**
 * Demo Package Loader
 *
 * Utility for loading demo packages from demo-packages.json.
 * Provides functions to retrieve packages and their storefronts
 * for specific stack configurations.
 *
 * Replaces the separate brandStackLoader.ts and templateLoader.ts
 * with a unified loader for the simplified demo-packages architecture.
 */

import demoPackagesConfig from '../../../../../templates/demo-packages.json';
import type { DemoPackage, DemoPackagesConfig, Storefront } from '@/types/demoPackages';

/**
 * Load all demo packages from demo-packages.json
 *
 * @returns Promise resolving to array of demo packages
 */
export async function loadDemoPackages(): Promise<DemoPackage[]> {
    // Import is synchronous, but we return Promise for consistency
    // and to support future async loading scenarios (e.g., remote config)
    const config = demoPackagesConfig as DemoPackagesConfig;
    return config.packages;
}

/**
 * Get a demo package by its ID
 *
 * @param packageId - The unique identifier of the package
 * @returns Promise resolving to the package, or undefined if not found
 */
export async function getPackageById(packageId: string): Promise<DemoPackage | undefined> {
    const packages = await loadDemoPackages();
    return packages.find(pkg => pkg.id === packageId);
}

/**
 * Get the storefront configuration for a specific stack within a package
 *
 * Each demo package can have multiple storefronts keyed by stack ID.
 * This function retrieves the storefront for a given package and stack combination.
 *
 * @param packageId - The demo package ID (e.g., "citisignal")
 * @param stackId - The stack ID (e.g., "headless-paas", "edge-delivery")
 * @returns Promise resolving to the Storefront, or undefined if not found
 *
 * @example
 * const storefront = await getStorefrontForStack('citisignal', 'headless-paas');
 * if (storefront) {
 *   console.log('Git source:', storefront.source);
 * }
 */
export async function getStorefrontForStack(
    packageId: string,
    stackId: string,
): Promise<Storefront | undefined> {
    const pkg = await getPackageById(packageId);
    if (!pkg) {
        return undefined;
    }

    return pkg.storefronts[stackId];
}
```

### REFACTOR Phase

1. Review function signatures match existing loader patterns (brandStackLoader.ts, templateLoader.ts)
2. Ensure JSDoc comments are comprehensive with @example blocks
3. Verify type imports use path aliases consistently (@/types/demoPackages)
4. Consider adding helper for getting all available stack IDs for a package (if needed later)

## Expected Outcome

- Single `demoPackageLoader.ts` replacing both `brandStackLoader.ts` and `templateLoader.ts`
- Three exported functions: `loadDemoPackages()`, `getPackageById()`, `getStorefrontForStack()`
- Consistent async pattern with other loaders (Promise-based)
- All tests passing for loader functionality

## Acceptance Criteria

- [x] demoPackageLoader.ts created at `src/features/project-creation/ui/helpers/`
- [x] loadDemoPackages() returns all packages from demo-packages.json
- [x] getPackageById() finds package by ID or returns undefined
- [x] getStorefrontForStack() returns storefront for valid package/stack combination
- [x] getStorefrontForStack() returns undefined for invalid combinations
- [x] JSDoc comments match existing loader file patterns
- [x] Uses path aliases for type imports (@/types/demoPackages)
- [x] All 23 tests passing (expanded from original 10)
- [x] No references to old brand/template loaders in new code

## Estimated Time

1-2 hours

## Dependencies on This Step

- **Step 4** (Update imports): Will update consumers to use this loader instead of brandStackLoader/templateLoader
- **Step 6** (Delete old files): Cannot delete old loaders until Step 4 completes migration

## Pattern Reference

This loader follows the same patterns as existing loaders:

**From brandStackLoader.ts:**
- Async function returning Promise (for future remote loading support)
- Direct JSON import with type casting
- Simple filtering/lookup logic

**From templateLoader.ts:**
- JSDoc documentation with @param and @returns
- Optional validation helpers
- Type-safe return values

The new loader consolidates both patterns into a single file with a cleaner API.

## Completion Notes

**Files Created:**
- `src/features/project-creation/ui/helpers/demoPackageLoader.ts` - Unified loader
- `tests/features/project-creation/ui/helpers/demoPackageLoader.test.ts` - 23 tests

**Functions Implemented:**
- `loadDemoPackages()` - Returns all packages from demo-packages.json
- `getPackageById(packageId)` - Finds package by ID
- `getStorefrontForStack(packageId, stackId)` - Gets storefront for package/stack combination
- `getAvailableStacksForPackage(packageId)` - Returns stack IDs for a package
- `getAllStorefronts()` - Returns all storefronts with package/stack context

**Key Design Decisions:**
- Async functions (Promise-based) for future remote loading support
- Added `StorefrontWithContext` interface for `getAllStorefronts()` return type
- Empty string packageId returns undefined (edge case handling)
- Follows established loader patterns from brandStackLoader.ts and templateLoader.ts
