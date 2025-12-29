# Step 2: Create type definitions

## Purpose

Create TypeScript types for the unified demo-packages.json structure (Option A: Nested Storefronts), replacing separate Brand and DemoTemplate types with a single cohesive DemoPackage type hierarchy.

## Prerequisites

- [x] Step 1: demo-packages.json created with storefronts structure

## Tests to Write First (TDD)

- [x] Test: GitOptions type requires shallow and recursive fields
- [x] Test: GitSource type requires type, url, branch, gitOptions
- [x] Test: Storefront type requires name, description, source
- [x] Test: DemoPackage has storefronts keyed by stack ID
- [x] Test: DemoPackage does NOT have contentSources (derivable)
- [x] Test: DemoPackagesConfig validates version and packages array
- [x] Test: Type exports are accessible from @/types

**File:** `tests/types/demoPackages.test.ts`

## Files to Update

| File | Purpose |
|------|---------|
| `src/types/demoPackages.ts` | Updated type definitions for storefronts structure |
| `tests/types/demoPackages.test.ts` | Updated tests for storefronts structure |

## Implementation Details

### Structure: Option A (Nested Storefronts)

Types match the nested storefronts structure where packages contain storefronts keyed by stack ID.

### RED Phase

Updated tests to validate new structure:
```typescript
describe('DemoPackage type (nested storefronts structure)', () => {
  it('should have storefronts keyed by stack ID', () => {
    const pkg: DemoPackage = {
      id: 'citisignal',
      storefronts: {
        'headless-paas': { ... },
        'eds-paas': { ... }
      }
    };
    expect(pkg.storefronts['headless-paas']).toBeDefined();
  });
});
```

### GREEN Phase

Updated `src/types/demoPackages.ts` with new interfaces:
- `GitOptions` - shallow, recursive (required)
- `GitSource` - type, url, branch, gitOptions (required)
- `Submodule` - path, repository
- `Storefront` - name, description, source, optional icon/featured/tags/submodules
- `Addons` - Record<string, 'required' | 'optional'>
- `DemoPackage` - id, name, description, configDefaults, storefronts (keyed by stack ID)
- `DemoPackagesConfig` - version, packages array

### REFACTOR Phase

- Added comprehensive JSDoc comments on all interfaces
- Types already exported from `src/types/index.ts`
- Removed ContentSources (derivable from source.url)
- Removed PackageSource (replaced by GitSource)

## Expected Outcome

- Types align with demo-packages.json storefronts structure
- No contentSources (derivable from GitHub source URL)
- Storefronts nested within packages, keyed by stack ID
- Consistent with existing type file patterns

## Acceptance Criteria

- [x] demoPackages.ts exports GitOptions, GitSource, Submodule, Storefront, Addons, DemoPackage, DemoPackagesConfig
- [x] Types match demo-packages.json storefronts schema from Step 1
- [x] Types exported from @/types barrel export
- [x] JSDoc comments on all interfaces
- [x] Type tests pass (21 tests)
- [x] TypeScript compiles without errors

## Completion Notes

**Files Updated:**
- `src/types/demoPackages.ts` - Updated for storefronts structure
- `tests/types/demoPackages.test.ts` - 21 tests (all passing)

**Key Changes:**
- Removed ContentSources, PackageSource (old flat structure)
- Added GitSource, Storefront types for nested structure
- DemoPackage now has storefronts: Record<string, Storefront>
- No stack field at package level (storefronts keyed by stack ID)
