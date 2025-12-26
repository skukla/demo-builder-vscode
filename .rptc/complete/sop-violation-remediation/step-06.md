# Step 6: Refactor Complex Inline Expressions

## Purpose

Extract 6 complex inline expressions to named helper functions per SOP code-patterns.md Sections 5-6. These violations reduce readability by requiring mental parsing of filter/map chains, conditional rendering logic, and complex computations inline in JSX.

## Prerequisites

- [ ] Can run in parallel with Steps 4-6 (per overview coordination notes)
- [ ] All tests passing before starting

## Tests to Write First (RED Phase)

### 6.1 BrandGallery.tsx - Filter/Map in Render

- [ ] **Test**: `filterBrandsBySearchQuery returns all brands when query empty`
  - **Given**: Array of 3 brands, empty search query
  - **When**: `filterBrandsBySearchQuery(brands, '')`
  - **Then**: Returns all 3 brands unchanged
  - **File**: `tests/features/project-creation/ui/components/BrandGallery.helpers.test.ts`

- [ ] **Test**: `filterBrandsBySearchQuery filters by name case-insensitive`
  - **Given**: Brands with names "Citi", "Luma", "Venia", query "lum"
  - **When**: `filterBrandsBySearchQuery(brands, 'lum')`
  - **Then**: Returns only Luma brand

- [ ] **Test**: `filterBrandsBySearchQuery filters by description`
  - **Given**: Brands with different descriptions, query matches one description
  - **When**: `filterBrandsBySearchQuery(brands, 'telecom')`
  - **Then**: Returns brand with matching description

### 6.2 ProjectsDashboard.tsx - Menu Items Array Building

- [ ] **Test**: `buildMenuItems returns only new project when callbacks undefined`
  - **Given**: No optional callbacks provided
  - **When**: `buildMenuItems(undefined, undefined)`
  - **Then**: Returns array with single 'new' item
  - **File**: `tests/features/projects-dashboard/ui/ProjectsDashboard.helpers.test.ts`

- [ ] **Test**: `buildMenuItems includes copy when callback provided`
  - **Given**: `onCopyFromExisting` callback provided
  - **When**: `buildMenuItems(mockCallback, undefined)`
  - **Then**: Returns array with 'new' and 'copy' items

- [ ] **Test**: `buildMenuItems includes all items when all callbacks provided`
  - **Given**: Both optional callbacks provided
  - **When**: `buildMenuItems(mockCopy, mockImport)`
  - **Then**: Returns array with 'new', 'copy', and 'import' items

### 6.3 ReviewStep.tsx - Service Name Resolution

- [ ] **Test**: `resolveServiceNames returns empty array when no services`
  - **Given**: Empty serviceIds array
  - **When**: `resolveServiceNames([], servicesMap)`
  - **Then**: Returns empty array
  - **File**: `tests/features/project-creation/ui/steps/ReviewStep.helpers.test.ts`

- [ ] **Test**: `resolveServiceNames resolves valid service IDs to names`
  - **Given**: Service IDs ['svc-1', 'svc-2'], services map with those IDs
  - **When**: `resolveServiceNames(ids, servicesMap)`
  - **Then**: Returns ['Service One', 'Service Two']

- [ ] **Test**: `resolveServiceNames filters out missing service IDs`
  - **Given**: Service IDs with one invalid, services map
  - **When**: `resolveServiceNames(['valid', 'missing'], servicesMap)`
  - **Then**: Returns only resolved names, no undefined

### 6.4 ReviewStep.tsx - Component Info Aggregation

- [ ] **Test**: `buildComponentInfoList returns empty when no selections`
  - **Given**: Empty component selections state
  - **When**: `buildComponentInfoList(state, componentsData, deps)`
  - **Then**: Returns empty array

- [ ] **Test**: `buildComponentInfoList includes frontend with Demo Inspector`
  - **Given**: State with frontend and demo-inspector dependency
  - **When**: `buildComponentInfoList(state, componentsData, deps)`
  - **Then**: Frontend entry has subItems with 'Demo Inspector'

### 6.5 WizardContainer.tsx - Render Step Function

- [ ] **Test**: `getStepComponent returns correct component for step name`
  - **Given**: Step name 'welcome', required props
  - **When**: `getStepComponent('welcome', props)`
  - **Then**: Returns WelcomeStep element type
  - **File**: `tests/features/project-creation/ui/wizard/WizardContainer.helpers.test.ts`

- [ ] **Test**: `getStepComponent returns null for unknown step`
  - **Given**: Invalid step name 'unknown-step'
  - **When**: `getStepComponent('unknown-step', props)`
  - **Then**: Returns null

## Files to Create/Modify

- [ ] `src/features/project-creation/ui/components/BrandGallery.tsx` - Extract `filterBrandsBySearchQuery`
- [ ] `src/features/projects-dashboard/ui/ProjectsDashboard.tsx` - Extract `buildMenuItems`
- [ ] `src/features/project-creation/ui/steps/ReviewStep.tsx` - Extract `resolveServiceNames`, refactor `componentInfo` derivation
- [ ] `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Extract step rendering to `getStepComponent` or keep switch (acceptable pattern per SOP)
- [ ] `tests/features/project-creation/ui/components/BrandGallery.helpers.test.ts` - New test file
- [ ] `tests/features/projects-dashboard/ui/ProjectsDashboard.helpers.test.ts` - New test file
- [ ] `tests/features/project-creation/ui/steps/ReviewStep.helpers.test.ts` - New test file

## Implementation Details

### RED Phase

Write failing tests for each helper function before implementation:

```typescript
// BrandGallery.helpers.test.ts
describe('filterBrandsBySearchQuery', () => {
    const mockBrands = [
        { id: 'citi', name: 'CitiSignal', description: 'Telecom demo' },
        { id: 'luma', name: 'Luma', description: 'Retail demo' },
    ];

    it('returns all brands when query is empty', () => {
        expect(filterBrandsBySearchQuery(mockBrands, '')).toEqual(mockBrands);
    });

    it('filters case-insensitively by name', () => {
        const result = filterBrandsBySearchQuery(mockBrands, 'citi');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('citi');
    });
});
```

### GREEN Phase

1. **BrandGallery.tsx** - Extract filter logic above component:
   ```typescript
   function filterBrandsBySearchQuery(brands: Brand[], query: string): Brand[] {
       if (!query.trim()) return brands;
       const lowerQuery = query.toLowerCase();
       return brands.filter(b =>
           b.name.toLowerCase().includes(lowerQuery) ||
           b.description.toLowerCase().includes(lowerQuery)
       );
   }
   ```

2. **ProjectsDashboard.tsx** - Extract menu items builder:
   ```typescript
   interface MenuItem {
       key: string;
       label: string;
       icon: 'add' | 'copy' | 'import';
   }

   function buildMenuItems(
       onCopyFromExisting?: () => void,
       onImportFromFile?: () => void,
   ): MenuItem[] {
       const items: MenuItem[] = [
           { key: 'new', label: 'New Project', icon: 'add' },
       ];
       if (onCopyFromExisting) {
           items.push({ key: 'copy', label: 'Copy from Existing...', icon: 'copy' });
       }
       if (onImportFromFile) {
           items.push({ key: 'import', label: 'Import from File...', icon: 'import' });
       }
       return items;
   }
   ```

3. **ReviewStep.tsx** - Extract service name resolution:
   ```typescript
   function resolveServiceNames(
       serviceIds: string[],
       services: Record<string, { name: string }> | undefined,
   ): string[] {
       if (!services) return [];
       return serviceIds
           .map(id => services[id]?.name)
           .filter((name): name is string => Boolean(name));
   }
   ```

4. **WizardContainer.tsx** - The switch statement in `renderStep` is acceptable per SOP (explicit control flow). No extraction needed unless it exceeds complexity threshold.

### REFACTOR Phase

- Ensure helper functions are exported for testing
- Add JSDoc comments explaining purpose
- Remove any duplicate logic that can share helpers
- Verify all tests pass

## Expected Outcome

- 6 complex inline expressions extracted to named helpers
- Each helper is independently testable
- Improved readability in render functions
- All existing tests passing
- New tests achieving 100% coverage on extracted helpers

## Acceptance Criteria

- [ ] All 6 violations addressed per SOP code-patterns.md
- [ ] New helper functions have dedicated test coverage
- [ ] No behavior changes (pure refactoring)
- [ ] Code follows project style guide
- [ ] All tests passing

## Estimated Time

2-3 hours
