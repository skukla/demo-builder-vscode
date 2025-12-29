# Step 5: Update tests

## Purpose

Update test file imports and mocks to use the new unified `demoPackageLoader` and `DemoPackage` types, replacing references to old `Brand`, `DemoTemplate`, `brandStackLoader`, and `templateLoader` patterns. This ensures test suite passes with the new architecture before deleting old files in Step 6.

## Prerequisites

- [x] Step 1: demo-packages.json created with unified structure
- [x] Step 2: DemoPackage types defined in demoPackages.ts
- [x] Step 3: demoPackageLoader.ts created with loader functions
- [x] Step 4: Production code imports updated to new types/loader

## Test Files Analysis

### Category A: Tests to DELETE (replaced by new tests)

These test files test old loaders/types that are being replaced. They should be deleted after the new tests (created in Steps 1-3) are confirmed working.

| File | Reason for Deletion |
|------|---------------------|
| `tests/features/project-creation/ui/helpers/templateLoader.test.ts` | Replaced by `demoPackageLoader.test.ts` (Step 3) |
| `tests/features/project-creation/ui/helpers/brandDefaults.test.ts` | Brand defaults now embedded in DemoPackage; logic handled by stackHelpers |
| `tests/templates/brands.test.ts` | Replaced by `demo-packages.test.ts` (Step 1) |
| `tests/templates/templates.test.ts` | Replaced by `demo-packages.test.ts` (Step 1) |
| `tests/types/templates.test.ts` | Replaced by `demoPackages.test.ts` (Step 2) |

### Category B: Tests to UPDATE (import path changes)

These tests import `Brand` or other old types as test fixtures. They need imports updated to use `DemoPackage` from the new location.

| File | Changes Required |
|------|------------------|
| `tests/features/project-creation/ui/helpers/stackHelpers.test.ts` | Change `Brand` import from `@/types/brands` to `DemoPackage` from `@/types/demoPackages` |
| `tests/features/project-creation/ui/components/BrandGallery.helpers.test.ts` | Change `Brand` import, update mock data to use DemoPackage structure |
| `tests/features/project-creation/ui/components/BrandSelector.test.tsx` | Change `Brand` import, update mock data structure |

### Category C: Mock Files to UPDATE

| File | Changes Required |
|------|------------------|
| `tests/features/project-creation/ui/wizard/WizardContainer.mocks.tsx` | Update mocks from `brandStackLoader` + `templateLoader` to `demoPackageLoader` |

### Category D: Tests Already Created (Steps 1-3)

These tests were created in previous steps and should be passing:

- `tests/templates/demo-packages.test.ts` (Step 1)
- `tests/types/demoPackages.test.ts` (Step 2)
- `tests/features/project-creation/ui/helpers/demoPackageLoader.test.ts` (Step 3)

## Tests to Write First (TDD)

Since this is a migration step, we verify existing tests pass with updated imports rather than writing new tests.

- [ ] Test: All Category D tests pass (verify Steps 1-3 are complete)
- [ ] Test: stackHelpers.test.ts passes after import updates
- [ ] Test: BrandGallery.helpers.test.ts passes after import updates
- [ ] Test: BrandSelector.test.tsx passes after import updates
- [ ] Test: WizardContainer tests pass after mock updates
- [ ] Test: Full test suite passes after Category A deletions

## Implementation Details

### RED Phase (Verify Current State)

Before making changes, run the test suite to establish baseline:

```bash
npm run test:changed
```

Note which tests fail due to Step 4 import changes breaking old test imports.

### GREEN Phase

#### Phase 5.1: Update WizardContainer.mocks.tsx

This is the most critical file as it's imported by multiple WizardContainer test files.

**Current mock structure:**
```typescript
// Mock brandStackLoader
jest.mock('@/features/project-creation/ui/helpers/brandStackLoader', () => ({
    loadBrands: async () => [/* mock data */],
    loadStacks: async () => [/* mock data */],
}));

// Mock templateLoader
jest.mock('@/features/project-creation/ui/helpers/templateLoader', () => ({
    loadDemoTemplates: async () => [/* mock data */],
}));
```

**New mock structure:**
```typescript
// Mock demoPackageLoader (replaces brandStackLoader + templateLoader)
jest.mock('@/features/project-creation/ui/helpers/demoPackageLoader', () => ({
    __esModule: true,
    loadDemoPackages: async () => [
        {
            id: 'test-package',
            name: 'Test Package',
            description: 'Test package for unit tests',
            stack: 'test-stack',
            featured: true,
            configDefaults: {
                ADOBE_COMMERCE_WEBSITE_CODE: 'test',
            },
            contentSources: {
                eds: 'main--test--example.aem.live',
            },
            storefronts: {
                'test-stack': {
                    source: 'https://github.com/test/repo',
                },
            },
        },
    ],
    getPackageById: async (id: string) => {
        if (id === 'test-package') {
            return {
                id: 'test-package',
                name: 'Test Package',
                /* ... */
            };
        }
        return undefined;
    },
    getStorefrontForStack: async (packageId: string, stackId: string) => {
        if (packageId === 'test-package' && stackId === 'test-stack') {
            return { source: 'https://github.com/test/repo' };
        }
        return undefined;
    },
}));
```

#### Phase 5.2: Update stackHelpers.test.ts

**Current imports:**
```typescript
import type { Brand } from '@/types/brands';
```

**New imports:**
```typescript
import type { DemoPackage } from '@/types/demoPackages';
```

**Update test fixtures:**
```typescript
// OLD: citisignalBrand: Brand
const citisignalBrand: Brand = {
    id: 'citisignal',
    name: 'CitiSignal',
    configDefaults: { /* ... */ },
    contentSources: { eds: '...' },
};

// NEW: citisignalPackage: DemoPackage
const citisignalPackage: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'Telecommunications demo',
    configDefaults: {
        ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
        ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
        ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
    },
    contentSources: { eds: 'main--accs-citisignal--demo-system-stores.aem.live' },
    storefronts: {
        'headless-paas': { source: 'https://github.com/skukla/citisignal-nextjs' },
    },
};
```

**Note:** `getContentSourceForBrand()` function signature may need updating in Step 4 if not already done. If function now accepts DemoPackage, update test calls accordingly.

#### Phase 5.3: Update BrandGallery.helpers.test.ts

**Current imports:**
```typescript
import { filterBrandsBySearchQuery } from '@/features/project-creation/ui/components/brandGalleryHelpers';
import type { Brand } from '@/types/brands';
```

**New imports:**
```typescript
import { filterPackagesBySearchQuery } from '@/features/project-creation/ui/components/packageGalleryHelpers';
import type { DemoPackage } from '@/types/demoPackages';
```

**Update test fixtures:**
```typescript
// OLD
const mockBrands: Brand[] = [
    { id: 'citisignal', name: 'CitiSignal', description: '...' },
];

// NEW
const mockPackages: DemoPackage[] = [
    {
        id: 'citisignal',
        name: 'CitiSignal',
        description: '...',
        configDefaults: {},
        contentSources: {},
        storefronts: {},
    },
];
```

**Note:** If `filterBrandsBySearchQuery` was renamed to `filterPackagesBySearchQuery` in Step 4, update function name in imports. If function name kept same but signature changed, update accordingly.

#### Phase 5.4: Update BrandSelector.test.tsx

**Current imports:**
```typescript
import { BrandSelector } from '@/features/project-creation/ui/components/BrandSelector';
import { Brand } from '@/types/brands';
```

**New imports:**
```typescript
import { PackageSelector } from '@/features/project-creation/ui/components/PackageSelector';
import { DemoPackage } from '@/types/demoPackages';
```

**Update test fixtures:**
```typescript
// OLD
const mockBrands: Brand[] = [
    {
        id: 'citisignal',
        name: 'CitiSignal',
        description: '...',
        icon: 'citisignal',
        featured: true,
        configDefaults: { /* ... */ },
        contentSources: { eds: '...' },
    },
];

// NEW
const mockPackages: DemoPackage[] = [
    {
        id: 'citisignal',
        name: 'CitiSignal',
        description: '...',
        featured: true,
        configDefaults: {
            ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
            ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
        },
        contentSources: { eds: 'main--accs-citisignal--demo-system-stores.aem.live' },
        storefronts: {
            'headless-paas': { source: 'https://github.com/...' },
        },
    },
];
```

**Update test descriptions and assertions:**
- `'should render all brands'` -> `'should render all packages'`
- `'should show selected state for selected brand'` -> `'should show selected state for selected package'`
- Update data-testid from `'brand-card'` to `'package-card'` if component changed

#### Phase 5.5: Delete Category A Test Files

After all updates are verified passing, delete obsolete test files:

```bash
rm tests/features/project-creation/ui/helpers/templateLoader.test.ts
rm tests/features/project-creation/ui/helpers/brandDefaults.test.ts
rm tests/templates/brands.test.ts
rm tests/templates/templates.test.ts
rm tests/types/templates.test.ts
```

### REFACTOR Phase

1. Ensure consistent naming across all updated tests (packages vs brands)
2. Update any test descriptions that still reference "brands" or "templates"
3. Verify mock data structures are minimal but complete (all required DemoPackage fields)
4. Run full test suite to catch any missed references

## Files to Modify

| File | Action |
|------|--------|
| `tests/features/project-creation/ui/wizard/WizardContainer.mocks.tsx` | Update mocks |
| `tests/features/project-creation/ui/helpers/stackHelpers.test.ts` | Update imports + fixtures |
| `tests/features/project-creation/ui/components/BrandGallery.helpers.test.ts` | Update imports + fixtures |
| `tests/features/project-creation/ui/components/BrandSelector.test.tsx` | Update imports + fixtures |

## Files to Delete

| File | Reason |
|------|--------|
| `tests/features/project-creation/ui/helpers/templateLoader.test.ts` | Replaced by demoPackageLoader.test.ts |
| `tests/features/project-creation/ui/helpers/brandDefaults.test.ts` | Brand defaults now embedded in packages |
| `tests/templates/brands.test.ts` | Replaced by demo-packages.test.ts |
| `tests/templates/templates.test.ts` | Replaced by demo-packages.test.ts |
| `tests/types/templates.test.ts` | Replaced by demoPackages.test.ts |

## Expected Outcome

- All test files use new `DemoPackage` type and `demoPackageLoader` imports
- No references to `@/types/brands` or `@/types/templates` in test files
- No references to `brandStackLoader` or `templateLoader` in test mocks
- Full test suite passes (all features still working with new architecture)
- 5 obsolete test files deleted

## Acceptance Criteria

- [ ] WizardContainer.mocks.tsx updated to mock demoPackageLoader
- [ ] stackHelpers.test.ts passes with DemoPackage fixtures
- [ ] BrandGallery.helpers.test.ts passes with DemoPackage fixtures
- [ ] BrandSelector.test.tsx passes with updated component/props
- [ ] No grep matches for `from '@/types/brands'` in tests/
- [ ] No grep matches for `from '@/types/templates'` in tests/ (except if file not deleted yet)
- [ ] No grep matches for `brandStackLoader` in tests/
- [ ] No grep matches for `templateLoader` in tests/ (except templateDefaults if still used)
- [ ] 5 obsolete test files deleted
- [ ] Full test suite passes: `npm test`
- [ ] Coverage maintained at 80%+ for affected files

## Verification Commands

```bash
# Verify no old imports remain
grep -r "from '@/types/brands'" tests/ --include="*.ts" --include="*.tsx"
grep -r "from '@/types/templates'" tests/ --include="*.ts" --include="*.tsx"
grep -r "brandStackLoader" tests/ --include="*.ts" --include="*.tsx"
grep -r "templateLoader" tests/ --include="*.ts" --include="*.tsx"

# Run affected tests
npm run test:file -- tests/features/project-creation/ui/wizard/
npm run test:file -- tests/features/project-creation/ui/helpers/stackHelpers.test.ts
npm run test:file -- tests/features/project-creation/ui/components/BrandGallery
npm run test:file -- tests/features/project-creation/ui/components/BrandSelector

# Run full test suite
npm test
```

## Estimated Time

2-3 hours

## Risks

| Risk | Mitigation |
|------|------------|
| Missing test file in Category A/B lists | Run grep verification commands to find all references |
| Component renamed in Step 4 but test not updated | Use TypeScript compiler errors to identify mismatches |
| Mock structure incomplete | Ensure all DemoPackage required fields present in mocks |
| Test descriptions still mention "brands" | Search for "brand" in test descriptions and update |

## Dependencies on This Step

- **Step 6** (Delete old files): Cannot safely delete `brands.ts`, `templates.ts`, loaders until tests updated
- **Step 7** (Verification sweep): Will confirm no remaining references after this step

## Notes

### Regarding Component Renames

If Step 4 renamed components (e.g., `BrandSelector` -> `PackageSelector`), the test file may also need renaming:
- `BrandSelector.test.tsx` -> `PackageSelector.test.tsx`
- `BrandGallery.helpers.test.ts` -> `PackageGallery.helpers.test.ts`

If component names were kept the same (just props/types changed), file names can stay the same.

### Regarding Function Signature Changes

If `stackHelpers.ts` functions changed signatures in Step 4:
- `getContentSourceForBrand(brand: Brand, stackId)` -> `getContentSourceForPackage(pkg: DemoPackage, stackId)`

Update test calls accordingly. The test fixtures (mock data) will need the new DemoPackage shape regardless.
