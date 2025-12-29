# Step 4: Update all imports and type references

## Purpose

This is the **critical migration step** that replaces all Brand/DemoTemplate imports with DemoPackage throughout the codebase. This step transforms the codebase to use the unified package architecture created in Steps 1-3.

**Scope**: Update ~10 files across UI components, helpers, and type exports. All changes must be atomic to ensure the wizard continues functioning throughout the migration.

## Prerequisites

- [x] Step 1: demo-packages.json created with unified structure
- [x] Step 2: DemoPackage, Storefront, DemoPackagesConfig types defined
- [x] Step 3: demoPackageLoader.ts created with loadDemoPackages(), getPackageById(), getStorefrontForStack()

## Migration Strategy

### Type Mapping

| Old Type | New Type | Notes |
|----------|----------|-------|
| `Brand` | `DemoPackage` | Brand data embedded in package |
| `DemoTemplate` | `DemoPackage` | Template source becomes storefront |
| `BrandsConfig` | `DemoPackagesConfig` | Root config structure |
| `DemoTemplatesConfig` | `DemoPackagesConfig` | Same root structure |

### Loader Mapping

| Old Loader | New Loader | Notes |
|------------|------------|-------|
| `loadBrands()` | `loadDemoPackages()` | Returns DemoPackage[] |
| `loadDemoTemplates()` | `loadDemoPackages()` | Same function, packages serve both roles |
| `loadStacks()` | `loadStacks()` | **No change** - stacks.json remains separate |

### Prop Renaming Strategy

For clarity and consistency, rename props/variables:
- `brands` -> `packages`
- `selectedBrand` -> `selectedPackage`
- `onBrandSelect` -> `onPackageSelect`
- `brandName` -> `packageName`

## Tests to Write First (TDD)

**File:** `tests/features/project-creation/ui/migration/importMigration.test.ts`

### Compilation Tests

- [ ] Test: All files compile without TypeScript errors after migration
  - **Given:** All imports updated to use DemoPackage
  - **When:** TypeScript compilation runs
  - **Then:** No type errors related to Brand/DemoTemplate

- [ ] Test: DemoPackage type is importable from @/types
  - **Given:** src/types/index.ts exports demoPackages
  - **When:** Import `{ DemoPackage }` from `@/types`
  - **Then:** Type is available and matches expected shape

### Component Prop Tests

- [ ] Test: WelcomeStep accepts packages prop with DemoPackage[]
  - **Given:** WelcomeStep component with new prop types
  - **When:** Rendered with packages array
  - **Then:** Component renders without errors

- [ ] Test: BrandGallery (renamed PackageGallery) accepts packages prop
  - **Given:** PackageGallery component with DemoPackage[] prop
  - **When:** Rendered with packages array
  - **Then:** Component displays package names and descriptions

- [ ] Test: BrandSelector (renamed PackageSelector) uses DemoPackage
  - **Given:** PackageSelector component
  - **When:** Rendered with packages array
  - **Then:** Selector options match package names

### Helper Function Tests

- [ ] Test: filterPackagesBySearchQuery works with DemoPackage[]
  - **Given:** Array of DemoPackages with various names/descriptions
  - **When:** filterPackagesBySearchQuery called with search term
  - **Then:** Returns filtered packages matching name or description

- [ ] Test: getContentSourceForPackage returns correct EDS source
  - **Given:** DemoPackage with contentSources.eds defined
  - **When:** getContentSourceForPackage called with 'edge-delivery' stack
  - **Then:** Returns the EDS content source URL

### Integration Tests

- [ ] Test: WizardContainer loads packages using new loader
  - **Given:** WizardContainer mounted
  - **When:** useEffect runs for package loading
  - **Then:** packages state populated from loadDemoPackages()

- [ ] Test: ReviewStep resolves package name from ID
  - **Given:** ReviewStep with selectedPackage in state
  - **When:** Component renders
  - **Then:** Displays human-readable package name

## Files to Modify

### Phase 1: Type Exports (Foundation)

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add export for demoPackages, remove brands/templates exports (Step 6) |

### Phase 2: Loaders and Helpers

| File | Changes |
|------|---------|
| `src/features/project-creation/ui/helpers/stackHelpers.ts` | Update Brand -> DemoPackage, update function signatures |
| `src/features/project-creation/ui/components/brandGalleryHelpers.ts` | Rename to packageGalleryHelpers.ts, update types |

### Phase 3: UI Components

| File | Changes |
|------|---------|
| `src/features/project-creation/ui/components/BrandSelector.tsx` | Rename to PackageSelector.tsx, update props and types |
| `src/features/project-creation/ui/components/BrandGallery.tsx` | Rename to PackageGallery.tsx, update props and types |
| `src/features/project-creation/ui/steps/WelcomeStep.tsx` | Update imports, prop types, and variable names |
| `src/features/project-creation/ui/steps/ReviewStep.tsx` | Update imports and package name resolution |
| `src/features/project-creation/ui/wizard/WizardContainer.tsx` | Update loader imports and state types |

### Phase 4: Backend/Commands

| File | Changes |
|------|---------|
| `src/features/project-creation/handlers/executor.ts` | Update to use getStorefrontForStack() |
| `src/features/dashboard/commands/showDashboard.ts` | Update package name resolution |

## Implementation Details

### RED Phase

Create migration test file:

```typescript
// tests/features/project-creation/ui/migration/importMigration.test.ts
import { DemoPackage, DemoPackagesConfig } from '@/types/demoPackages';

describe('DemoPackage import migration', () => {
    describe('type exports', () => {
        it('DemoPackage type is correctly shaped', () => {
            const pkg: DemoPackage = {
                id: 'test-package',
                name: 'Test Package',
                description: 'Test description',
                configDefaults: { STORE_CODE: 'test' },
                contentSources: { eds: 'https://example.com' },
                storefronts: {
                    'headless-paas': {
                        source: 'https://github.com/example/repo',
                    },
                },
            };

            expect(pkg.id).toBe('test-package');
            expect(pkg.configDefaults).toBeDefined();
            expect(pkg.storefronts['headless-paas']).toBeDefined();
        });
    });
});
```

### GREEN Phase

#### 1. Update src/types/index.ts

```typescript
// Add new export (keep old exports for now - removed in Step 6)
export * from './demoPackages';

// These will be removed in Step 6:
// export * from './templates';
// export * from './brands';
export * from './stacks'; // Keep - stacks.json remains
```

#### 2. Update stackHelpers.ts

```typescript
// src/features/project-creation/ui/helpers/stackHelpers.ts
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { ComponentSelection } from '@/types/webview';

/**
 * Get the content source URL for a package based on stack type
 */
export function getContentSourceForPackage(
    pkg: DemoPackage,
    stackId: string,
): string | undefined {
    if (stackId === 'edge-delivery') {
        return pkg.contentSources?.eds;
    }
    return undefined;
}

// deriveComponentsFromStack stays unchanged (uses Stack, not Brand)
// filterComponentConfigsForStackChange stays unchanged (uses Stack)
// getStackComponentIds stays unchanged (uses Stack)
```

#### 3. Rename and Update brandGalleryHelpers.ts -> packageGalleryHelpers.ts

```typescript
// src/features/project-creation/ui/components/packageGalleryHelpers.ts
import type { DemoPackage } from '@/types/demoPackages';

/**
 * Filters packages based on a search query.
 */
export function filterPackagesBySearchQuery(
    packages: DemoPackage[],
    searchQuery: string,
): DemoPackage[] {
    if (!searchQuery.trim()) {
        return packages;
    }
    const query = searchQuery.toLowerCase();
    return packages.filter(
        (pkg) =>
            pkg.name.toLowerCase().includes(query) ||
            (pkg.description?.toLowerCase().includes(query) ?? false)
    );
}
```

#### 4. Rename and Update BrandSelector.tsx -> PackageSelector.tsx

```typescript
// src/features/project-creation/ui/components/PackageSelector.tsx
import { Text } from '@adobe/react-spectrum';
import React, { useCallback, useRef } from 'react';
import { DemoPackage } from '@/types/demoPackages';

export interface PackageSelectorProps {
    packages: DemoPackage[];
    selectedPackage?: string;
    onSelect: (packageId: string) => void;
}

interface PackageCardProps {
    pkg: DemoPackage;
    isSelected: boolean;
    isFeatured: boolean;
    onSelect: (packageId: string) => void;
    onNavigate: (direction: 'prev' | 'next' | 'first' | 'last') => void;
    cardRef: React.RefObject<HTMLDivElement | null>;
}

const PackageCard: React.FC<PackageCardProps> = ({
    pkg,
    isSelected,
    isFeatured,
    onSelect,
    onNavigate,
    cardRef,
}) => {
    // ... implementation unchanged except prop names
};

export const PackageSelector: React.FC<PackageSelectorProps> = ({
    packages,
    selectedPackage,
    onSelect,
}) => {
    // ... implementation unchanged except variable names
};
```

#### 5. Rename and Update BrandGallery.tsx -> PackageGallery.tsx

```typescript
// src/features/project-creation/ui/components/PackageGallery.tsx
import { DemoPackage } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';
import { filterPackagesBySearchQuery } from './packageGalleryHelpers';

export interface PackageGalleryProps {
    packages: DemoPackage[];
    stacks: Stack[];
    selectedPackage?: string;
    selectedStack?: string;
    selectedAddons?: string[];
    onPackageSelect: (packageId: string) => void;
    onStackSelect: (stackId: string) => void;
    onAddonsChange?: (addons: string[]) => void;
    headerContent?: React.ReactNode;
}

// Update internal references from brand -> pkg
// Update compatibleStacks access (now on DemoPackage directly)
// Update addons access (now on DemoPackage directly)
```

#### 6. Update WelcomeStep.tsx

```typescript
// src/features/project-creation/ui/steps/WelcomeStep.tsx
import { PackageGallery } from '../components/PackageGallery';
import { DemoPackage } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';

interface WelcomeStepProps extends BaseStepProps {
    existingProjectNames?: string[];
    /** Available demo packages for selection */
    packages?: DemoPackage[];
    /** Initial view mode from extension settings */
    initialViewMode?: 'cards' | 'rows';
    /** Available stacks/architectures for selection */
    stacks?: Stack[];
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
}

export function WelcomeStep({
    state,
    updateState,
    setCanProceed,
    existingProjectNames = [],
    packages,
    initialViewMode,
    stacks,
    onArchitectureChange,
}: WelcomeStepProps) {
    // Check if packages are provided (new unified architecture)
    const hasPackages = packages && packages.length > 0;
    const hasStacks = stacks && stacks.length > 0;

    // Handler for package selection
    const handlePackageSelect = useCallback(
        (packageId: string) => {
            if (packageId !== state.selectedPackage) {
                const pkg = packages?.find(p => p.id === packageId);
                updateState({
                    selectedPackage: packageId,
                    selectedStack: undefined,
                    packageConfigDefaults: pkg?.configDefaults,
                });
            }
        },
        [updateState, state.selectedPackage, packages],
    );

    // ... rest of implementation with updated variable names
}
```

#### 7. Update WizardContainer.tsx

```typescript
// src/features/project-creation/ui/wizard/WizardContainer.tsx
import { loadDemoPackages } from '../helpers/demoPackageLoader';
import { loadStacks } from '../helpers/brandStackLoader'; // Keep for stacks
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';

// In component:
const [packages, setPackages] = useState<DemoPackage[]>([]);
const [stacks, setStacks] = useState<Stack[]>([]);

useEffect(() => {
    loadDemoPackages().then(setPackages);
    loadStacks().then(setStacks);
}, []);

// In WelcomeStep render:
return <WelcomeStep {...props} packages={packages} stacks={stacks} />;

// In ReviewStep render:
return <ReviewStep {...props} packages={packages} stacks={stacks} />;
```

#### 8. Update ReviewStep.tsx

```typescript
// src/features/project-creation/ui/steps/ReviewStep.tsx
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';

interface ReviewStepProps extends BaseStepProps {
    componentsData?: ComponentsData;
    /** Available packages for name resolution */
    packages?: DemoPackage[];
    /** Available stacks for name resolution */
    stacks?: Stack[];
}

// In component:
const packageName = state.selectedPackage
    ? packages?.find(p => p.id === state.selectedPackage)?.name
    : undefined;
```

#### 9. Update showDashboard.ts

```typescript
// src/features/dashboard/commands/showDashboard.ts
import type { DemoPackage, DemoPackagesConfig } from '@/types/demoPackages';
import type { Stack, StacksConfig } from '@/types/stacks';

private async resolvePackageStackNames(project: Project | null): Promise<{
    packageName?: string;
    stackName?: string;
}> {
    if (!project?.selectedPackage && !project?.selectedStack) {
        return {};
    }

    try {
        const result: { packageName?: string; stackName?: string } = {};

        // Resolve package name
        if (project.selectedPackage) {
            const packagesPath = path.join(
                this.context.extensionPath,
                'templates',
                'demo-packages.json',
            );
            const packagesLoader = new ConfigurationLoader<DemoPackagesConfig>(packagesPath);
            const packagesConfig = await packagesLoader.load();
            const pkg = packagesConfig.packages.find(
                (p: DemoPackage) => p.id === project.selectedPackage,
            );
            if (pkg) {
                result.packageName = pkg.name;
            }
        }

        // Stack resolution stays the same
        // ...
    }
}
```

#### 10. Update executor.ts (minimal changes)

The executor.ts uses inline types for FrontendSource - it doesn't directly reference Brand/DemoTemplate. However, it does reference `selectedBrand` and `selectedStack` in state. After migration:

```typescript
// In ProjectCreationConfig interface:
selectedPackage?: string;  // Renamed from selectedBrand
selectedStack?: string;    // Stays the same

// Update references in loadComponentDefinitions:
const errorMsg = comp.type === 'frontend'
    ? `No storefront found for stack "${typedConfig.selectedStack}" and package "${typedConfig.selectedPackage}". ` +
      `Please ensure a matching storefront exists in demo-packages.json.`
    : `...`;
```

### REFACTOR Phase

1. **Consistent naming**: Ensure all variable names use `pkg` or `package` instead of `brand`
2. **Remove unused imports**: Clean up any remaining Brand/DemoTemplate imports
3. **Update JSDoc comments**: Update all documentation to reference "package" instead of "brand"
4. **Verify no regressions**: Run full test suite to ensure wizard still functions

## State Property Renaming

Update `WizardState` and related types (if in scope for this step):

| Old Property | New Property |
|--------------|--------------|
| `selectedBrand` | `selectedPackage` |
| `brandConfigDefaults` | `packageConfigDefaults` |

**Note**: If WizardState is defined elsewhere, note this for Step 5 (test updates) or create a separate substep.

## Expected Outcome

- All files compile without TypeScript errors
- Wizard flow functions identically to before
- All imports use `DemoPackage` instead of `Brand`/`DemoTemplate`
- `loadDemoPackages()` replaces both `loadBrands()` and `loadDemoTemplates()`
- Components renamed for clarity: `BrandGallery` -> `PackageGallery`, etc.

## Acceptance Criteria

- [ ] `src/types/index.ts` exports `DemoPackage`, `DemoPackagesConfig`, `Storefront`, `ContentSources`
- [ ] No TypeScript compilation errors in any modified file
- [ ] All 10 files updated with new imports and type references
- [ ] Component props renamed: `brands` -> `packages`, `selectedBrand` -> `selectedPackage`
- [ ] Helper functions renamed: `filterBrandsBySearchQuery` -> `filterPackagesBySearchQuery`
- [ ] Loader calls updated: `loadBrands()` -> `loadDemoPackages()`
- [ ] Files renamed: `BrandSelector.tsx` -> `PackageSelector.tsx`, `BrandGallery.tsx` -> `PackageGallery.tsx`
- [ ] `showDashboard.ts` resolves package names from `demo-packages.json`
- [ ] All existing wizard tests pass (may need updates - defer to Step 5)
- [ ] No references to `Brand` or `DemoTemplate` types in modified files

## Estimated Time

3-4 hours

## Risk Mitigation

### Risk: Breaking wizard during migration

**Mitigation**:
1. Update in dependency order (types -> loaders -> helpers -> components -> commands)
2. Run TypeScript compilation after each file update
3. Test wizard manually after completing all updates

### Risk: Missing import updates

**Mitigation**:
1. Use grep to find all remaining Brand/DemoTemplate references
2. TypeScript compilation will catch missing type updates
3. Run verification grep after migration (Step 7)

## Verification Commands

After completing this step, run these verification commands:

```bash
# Check for remaining Brand imports (should be 0 in modified files)
grep -r "from '@/types/brands'" src/features/project-creation/
grep -r "from '@/types/templates'" src/features/project-creation/

# Verify TypeScript compiles
npm run build

# Run related tests
npm test -- tests/features/project-creation/
```

## Dependencies on This Step

- **Step 5** (Update tests): Test files need to be updated to use new types
- **Step 6** (Delete old files): Cannot delete old type files until all imports migrated
- **Step 7** (Verification sweep): Will confirm no remaining Brand/DemoTemplate references

## File Change Summary

### Renamed Files

| Old Name | New Name |
|----------|----------|
| `BrandSelector.tsx` | `PackageSelector.tsx` |
| `BrandGallery.tsx` | `PackageGallery.tsx` |
| `brandGalleryHelpers.ts` | `packageGalleryHelpers.ts` |

### Modified Files (Type Updates Only)

| File | Import Changes |
|------|---------------|
| `WelcomeStep.tsx` | `Brand` -> `DemoPackage`, `DemoTemplate` removed |
| `WizardContainer.tsx` | `Brand`, `DemoTemplate` -> `DemoPackage` |
| `stackHelpers.ts` | `Brand` -> `DemoPackage` |
| `ReviewStep.tsx` | `Brand` -> `DemoPackage` |
| `executor.ts` | Minimal - inline types, state prop rename |
| `showDashboard.ts` | `Brand`, `BrandsConfig` -> `DemoPackage`, `DemoPackagesConfig` |
| `src/types/index.ts` | Add `export * from './demoPackages'` |
