# Step 4: Update templateLoader Tests

## Purpose

Update `tests/features/project-creation/ui/helpers/templateLoader.test.ts` to use the new template structure. The current tests reference the old `defaults` structure (`defaults.frontend`, `defaults.backend`, `defaults.dependencies`) which no longer exists in `templates.json`. The new structure uses `stack`, `brand`, `source`, and `submodules` fields.

**This step depends on:**
- Step 1: Import paths must be fixed first
- Step 2: TypeScript types must be updated first (DemoTemplate interface must have new fields)

## Prerequisites

- [ ] Step 1 complete: Import paths fixed (`templates.json` instead of `demo-templates.json`)
- [ ] Step 2 complete: TypeScript types updated with `stack`, `brand`, `source`, `submodules` fields
- [ ] `templates.json` exists with new structure (verified)
- [ ] `stacks.json` exists for cross-reference validation (verified)
- [ ] `brands.json` exists for cross-reference validation (verified)

## Key Changes Summary

| Test Area | Old Structure | New Structure |
|-----------|--------------|---------------|
| Required properties | `defaults` | `stack`, `brand`, `source` |
| Component references | `defaults.frontend`, `defaults.backend` | Resolved via `stack` ID lookup in `stacks.json` |
| Dependency references | `defaults.dependencies` | Resolved via `stack.dependencies` in `stacks.json` |
| Test fixtures | Mock `DemoTemplate` with `defaults` | Mock with `stack`, `brand`, `source` |

## Tests to Write First (RED Phase)

### Test 1: Update loadDemoTemplates Structure Tests

```typescript
// File: tests/features/project-creation/ui/helpers/templateLoader.test.ts
// Purpose: Verify templates have new required properties

describe('loadDemoTemplates', () => {
  it('should ensure each template has required properties', async () => {
    // Given: Templates are loaded from templates.json
    // When: Checking each template
    const templates = await loadDemoTemplates();

    // Then: Each template should have new required properties
    templates.forEach((template) => {
      // Basic required fields (unchanged)
      expect(template.id).toBeDefined();
      expect(typeof template.id).toBe('string');
      expect(template.id.length).toBeGreaterThan(0);

      expect(template.name).toBeDefined();
      expect(typeof template.name).toBe('string');
      expect(template.name.length).toBeGreaterThan(0);

      expect(template.description).toBeDefined();
      expect(typeof template.description).toBe('string');

      // NEW: Stack reference (replaces defaults.frontend/backend)
      expect(template.stack).toBeDefined();
      expect(typeof template.stack).toBe('string');

      // NEW: Brand reference
      expect(template.brand).toBeDefined();
      expect(typeof template.brand).toBe('string');

      // NEW: Source configuration
      expect(template.source).toBeDefined();
      expect(typeof template.source).toBe('object');
      expect(template.source.type).toBe('git');
      expect(template.source.url).toBeDefined();
      expect(template.source.branch).toBeDefined();
    });
  });

  it('should ensure source configuration has required git properties', async () => {
    // Given: Templates are loaded with git source configuration
    const templates = await loadDemoTemplates();

    // Then: Each template's source should have required git properties
    templates.forEach((template) => {
      expect(template.source.type).toBe('git');
      expect(typeof template.source.url).toBe('string');
      expect(template.source.url).toMatch(/^https:\/\/github\.com\//);
      expect(typeof template.source.branch).toBe('string');

      // gitOptions is required
      expect(template.source.gitOptions).toBeDefined();
      expect(typeof template.source.gitOptions.shallow).toBe('boolean');
      expect(typeof template.source.gitOptions.recursive).toBe('boolean');
    });
  });

  it('should handle optional submodules field', async () => {
    // Given: Templates may or may not have submodules
    const templates = await loadDemoTemplates();

    // Then: Submodules should be properly structured if present
    templates.forEach((template) => {
      if (template.submodules) {
        expect(typeof template.submodules).toBe('object');
        Object.entries(template.submodules).forEach(([key, config]) => {
          expect(typeof config.path).toBe('string');
          expect(typeof config.repository).toBe('string');
        });
      }
    });
  });
});
```

### Test 2: Update validateTemplate Tests for New Structure

```typescript
describe('validateTemplate', () => {
  it('should return valid for template with all required fields (new structure)', () => {
    // Given: A valid template with new structure
    const validTemplate: DemoTemplate = {
      id: 'test-template',
      name: 'Test Template',
      description: 'A test template for validation',
      stack: 'headless-paas',
      brand: 'citisignal',
      source: {
        type: 'git',
        url: 'https://github.com/test/repo',
        branch: 'main',
        gitOptions: {
          shallow: true,
          recursive: false,
        },
      },
    };

    // When: Validating the template
    const result = validateTemplate(validTemplate);

    // Then: Should return valid
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return invalid for template missing stack', () => {
    // Given: A template without stack
    const invalidTemplate = {
      id: 'no-stack',
      name: 'Missing Stack Template',
      description: 'This template has no stack',
      brand: 'citisignal',
      source: {
        type: 'git',
        url: 'https://github.com/test/repo',
        branch: 'main',
        gitOptions: { shallow: true, recursive: false },
      },
    } as DemoTemplate;

    // When: Validating the template
    const result = validateTemplate(invalidTemplate);

    // Then: Should return invalid with error about missing stack
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Template must have a stack');
  });

  it('should return invalid for template missing brand', () => {
    // Given: A template without brand
    const invalidTemplate = {
      id: 'no-brand',
      name: 'Missing Brand Template',
      description: 'This template has no brand',
      stack: 'headless-paas',
      source: {
        type: 'git',
        url: 'https://github.com/test/repo',
        branch: 'main',
        gitOptions: { shallow: true, recursive: false },
      },
    } as DemoTemplate;

    // When: Validating the template
    const result = validateTemplate(invalidTemplate);

    // Then: Should return invalid with error about missing brand
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Template must have a brand');
  });

  it('should return invalid for template missing source', () => {
    // Given: A template without source configuration
    const invalidTemplate = {
      id: 'no-source',
      name: 'Missing Source Template',
      description: 'This template has no source',
      stack: 'headless-paas',
      brand: 'citisignal',
    } as DemoTemplate;

    // When: Validating the template
    const result = validateTemplate(invalidTemplate);

    // Then: Should return invalid with error about missing source
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Template must have a source');
  });

  it('should detect unknown stack references', () => {
    // Given: A template referencing a non-existent stack
    const invalidTemplate: DemoTemplate = {
      id: 'unknown-stack',
      name: 'Unknown Stack Template',
      description: 'References unknown stack',
      stack: 'non-existent-stack',
      brand: 'citisignal',
      source: {
        type: 'git',
        url: 'https://github.com/test/repo',
        branch: 'main',
        gitOptions: { shallow: true, recursive: false },
      },
    };

    // When: Validating the template with known stacks
    const knownStacks = ['headless-paas', 'headless-accs', 'eds-paas', 'eds-accs'];
    const result = validateTemplate(invalidTemplate, { knownStacks });

    // Then: Should return invalid with error about unknown stack
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('non-existent-stack'))).toBe(true);
  });

  it('should detect unknown brand references', () => {
    // Given: A template referencing a non-existent brand
    const invalidTemplate: DemoTemplate = {
      id: 'unknown-brand',
      name: 'Unknown Brand Template',
      description: 'References unknown brand',
      stack: 'headless-paas',
      brand: 'fake-brand',
      source: {
        type: 'git',
        url: 'https://github.com/test/repo',
        branch: 'main',
        gitOptions: { shallow: true, recursive: false },
      },
    };

    // When: Validating the template with known brands
    const knownBrands = ['citisignal', 'buildright', 'default'];
    const result = validateTemplate(invalidTemplate, { knownBrands });

    // Then: Should return invalid with error about unknown brand
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('fake-brand'))).toBe(true);
  });

  it('should pass validation when knownStacks and knownBrands not provided', () => {
    // Given: A valid template without cross-reference validation
    const validTemplate: DemoTemplate = {
      id: 'test-template',
      name: 'Test Template',
      description: 'A test template',
      stack: 'any-stack',
      brand: 'any-brand',
      source: {
        type: 'git',
        url: 'https://github.com/test/repo',
        branch: 'main',
        gitOptions: { shallow: true, recursive: false },
      },
    };

    // When: Validating without knownStacks/knownBrands (skip cross-reference validation)
    const result = validateTemplate(validTemplate);

    // Then: Should pass since cross-reference validation is skipped
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
```

### Test 3: Remove/Update Obsolete Tests

The following tests need to be **REMOVED** as they reference the old structure:

```typescript
// REMOVE: Tests referencing defaults.frontend, defaults.backend, defaults.dependencies
// These no longer exist in the new template structure

// OLD (to remove):
it('should ensure template defaults contain component selections', async () => {
  // This entire test should be removed - defaults structure no longer exists
});

it('should detect unknown component references in frontend', () => {
  // This entire test should be removed - frontend is now in stacks.json
});

it('should detect unknown component references in backend', () => {
  // This entire test should be removed - backend is now in stacks.json
});

it('should detect unknown component references in dependencies', () => {
  // This entire test should be removed - dependencies are now in stacks.json
});
```

## Files to Create/Modify

### Modify: `tests/features/project-creation/ui/helpers/templateLoader.test.ts`

**Location:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/tests/features/project-creation/ui/helpers/templateLoader.test.ts`

**Changes Required:**

| Section | Action | Details |
|---------|--------|---------|
| Lines 61-90 | REPLACE | Remove `defaults` tests, add `stack/brand/source` tests |
| Lines 94-113 | REPLACE | Update valid template fixture to new structure |
| Lines 115-131 | KEEP | Missing `id` test still valid |
| Lines 133-147 | KEEP | Missing `name` test still valid |
| Lines 149-163 | KEEP | Missing `description` test still valid |
| Lines 165-179 | REPLACE | Change from `defaults` to `source` |
| Lines 181-208 | REMOVE | Old frontend component reference test |
| Lines 210-234 | REMOVE | Old backend component reference test |
| Lines 236-260 | REMOVE | Old dependencies component reference test |
| Lines 262-276 | KEEP | Multiple errors collection test (update fixtures) |
| Lines 278-296 | REPLACE | Update fixture and validation options |

### Modify: `src/features/project-creation/ui/helpers/templateLoader.ts`

**Location:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/src/features/project-creation/ui/helpers/templateLoader.ts`

**Note:** This file will need to be updated to validate new structure. The implementation changes are minimal - update `validateTemplate` to check for `stack`, `brand`, `source` instead of `defaults`.

## Implementation Details (RED-GREEN-REFACTOR)

### RED Phase (Write Failing Tests)

1. **Update test file with new structure tests**:
   - Replace `defaults` property tests with `stack/brand/source` tests
   - Update all test fixtures to use new structure
   - Remove tests for `defaults.frontend/backend/dependencies`

2. **Run tests - expect failures**:
   ```bash
   npm test -- tests/features/project-creation/ui/helpers/templateLoader.test.ts
   # Expected: Failures due to:
   # - Tests expecting new properties that validateTemplate doesn't check yet
   # - Test fixtures not matching actual implementation
   ```

### GREEN Phase (Update Implementation)

1. **Update validateTemplate function**:
   ```typescript
   // In templateLoader.ts, update validateTemplate to check new fields

   export function validateTemplate(
     template: DemoTemplate,
     options?: { knownStacks?: string[]; knownBrands?: string[] }
   ): TemplateValidationResult {
     const errors: string[] = [];

     // Validate required fields
     if (!template.id || template.id.length === 0) {
       errors.push('Template must have an id');
     }

     if (!template.name || template.name.length === 0) {
       errors.push('Template must have a name');
     }

     if (!template.description) {
       errors.push('Template must have a description');
     }

     // NEW: Validate stack (replaces defaults.frontend/backend)
     if (!template.stack) {
       errors.push('Template must have a stack');
     }

     // NEW: Validate brand
     if (!template.brand) {
       errors.push('Template must have a brand');
     }

     // NEW: Validate source
     if (!template.source) {
       errors.push('Template must have a source');
     }

     // Cross-reference validation (if options provided)
     if (options?.knownStacks && template.stack) {
       if (!options.knownStacks.includes(template.stack)) {
         errors.push(`Unknown stack: ${template.stack}`);
       }
     }

     if (options?.knownBrands && template.brand) {
       if (!options.knownBrands.includes(template.brand)) {
         errors.push(`Unknown brand: ${template.brand}`);
       }
     }

     return {
       valid: errors.length === 0,
       errors,
     };
   }
   ```

2. **Verify tests pass**:
   ```bash
   npm test -- tests/features/project-creation/ui/helpers/templateLoader.test.ts
   # Expected: All tests pass
   ```

### REFACTOR Phase

1. **Clean up removed code**:
   - Remove any unused imports (`validateComponentReferences` if no longer needed)
   - Ensure consistent error message formatting
   - Add JSDoc comments for new options parameter

2. **Verify no regressions**:
   ```bash
   npm test -- --testPathPattern="template"
   ```

## Expected Outcome

After completing this step:

- [ ] All templateLoader tests use new structure (`stack`, `brand`, `source`)
- [ ] `validateTemplate` validates new required fields
- [ ] Cross-reference validation works for stacks and brands
- [ ] No tests reference old `defaults` structure
- [ ] All tests pass

## Acceptance Criteria

- [ ] Test file updated to use new `DemoTemplate` structure
- [ ] All `defaults.frontend/backend/dependencies` references removed
- [ ] Tests validate `stack`, `brand`, `source` fields
- [ ] Cross-reference validation tests for `knownStacks` and `knownBrands`
- [ ] `validateTemplate` function updated to match new structure
- [ ] All tests pass: `npm test -- tests/features/project-creation/ui/helpers/templateLoader.test.ts`
- [ ] No TypeScript errors in test file or implementation
- [ ] Code follows project style guide

## Verification Commands

```bash
# 1. Run specific test file
npm test -- tests/features/project-creation/ui/helpers/templateLoader.test.ts

# 2. Run all template-related tests
npm test -- --testPathPattern="template"

# 3. TypeScript compilation check
npm run compile

# 4. Verify no references to old structure remain
grep -r "defaults.frontend" tests/
grep -r "defaults.backend" tests/
grep -r "defaults.dependencies" tests/
# Expected: No results (all old references removed)
```

## Dependencies from Other Steps

- **Depends on Step 1:** Import paths must resolve correctly
- **Depends on Step 2:** TypeScript types must include `stack`, `brand`, `source`, `submodules`
- **Blocks Step 5+:** Test patterns established here are used in later steps

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TypeScript type mismatch | Medium | Medium | Verify Step 2 complete; types match actual JSON |
| Breaking existing tests | Low | Medium | Run full test suite after changes |
| validateTemplate signature change | Medium | Low | Check all callers of validateTemplate |
| Incomplete fixture updates | Low | Low | Use actual template as reference for fixtures |

## Estimated Time

**30-45 minutes**

- 10 minutes: Update test fixtures to new structure
- 10 minutes: Remove obsolete tests
- 10 minutes: Update validateTemplate implementation
- 10-15 minutes: Verify all tests pass, no regressions

## Notes

- The `validateTemplate` function signature changes from accepting `knownComponents?: string[]` to accepting `options?: { knownStacks?: string[]; knownBrands?: string[] }`. This is a breaking change but the function is only used in tests currently.
- The old `defaults` structure is completely replaced by the new `stack/brand/source` structure. No backward compatibility is needed.
- Submodules validation is optional since not all templates have submodules.

---

**Step Status:** ✅ COMPLETE (2025-12-24)

**Completion Summary:**
- Updated 18 tests to use new template structure (stack, brand, source)
- Updated `validateTemplate` function with new validation logic
- Added cross-reference validation for knownStacks/knownBrands
- Removed obsolete `demoTemplates.test.ts` (tested non-existent templates)
- All tests passing (18/18)

**Files Modified:**
- `tests/features/project-creation/ui/helpers/templateLoader.test.ts` (updated tests)
- `src/features/project-creation/ui/helpers/templateLoader.ts` (updated validation)

**Files Deleted:**
- `tests/unit/templates/demoTemplates.test.ts` (obsolete)

**Next Step:** Step 5 - Component Updater Tests (independent, can run in parallel with Steps 6-7)
