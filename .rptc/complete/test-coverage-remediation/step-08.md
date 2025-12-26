# Step 8: Add Build-Time Type/JSON Validation

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)
- [ ] Step Complete

---

## Purpose

Add compile-time/test-time checks that validate TypeScript types match their corresponding JSON structures. This prevents future type/JSON mismatches like the one discovered in the research phase where `DemoTemplate` was missing 4 fields present in `templates.json`.

**Why This Matters:**
- Catches type drift immediately during test runs
- Prevents silent runtime failures from missing type fields
- Creates a contract between JSON configuration and TypeScript interfaces
- Provides clear error messages identifying exactly which fields are mismatched

---

## Prerequisites

- [ ] Step 2 complete (TypeScript types updated with `stack`, `brand`, `source`, `submodules`)
- [ ] All template JSON files have corresponding TypeScript types
- [ ] Existing tests pass (`npm run test:fast`)

---

## Test Strategy

### Approach: Test-Time Schema Validation

The recommended approach (from plan overview) is to add tests that:
1. Load JSON files at test time
2. Extract all keys from JSON structures
3. Compare against TypeScript type definitions
4. Fail if any field exists in JSON but not in types (or vice versa)

**Why This Over Alternatives:**
- **JSON Schema validation in tests**: Simplest, no new dependencies, catches mismatches at test time
- **Type generation from JSON schema**: Adds build complexity, types become auto-generated (less readable)
- **Runtime validation with Zod**: Requires adding Zod dependency, overkill for configuration files

### Test File Location

`tests/templates/type-json-alignment.test.ts` - New dedicated test file for type/JSON alignment validation

---

## Tests to Write First (RED Phase)

### Test Suite 1: Templates Type Alignment

```typescript
describe('templates.json <-> TypeScript alignment', () => {
  // Tests that all JSON fields have corresponding TypeScript definitions
});
```

#### Test 1.1: DemoTemplate required fields present in JSON

- [ ] **Test:** All required DemoTemplate fields exist in every template

  - **Given:** The `templates.json` file loaded and `DemoTemplate` interface known
  - **When:** Checking each template object in the JSON
  - **Then:** Every template has `id`, `name`, `description` (required fields)
  - **File:** `tests/templates/type-json-alignment.test.ts`

#### Test 1.2: New template fields accounted for in TypeScript

- [ ] **Test:** Fields `stack`, `brand`, `source`, `submodules` exist in TypeScript types

  - **Given:** The `DemoTemplate` interface from `src/types/templates.ts`
  - **When:** Checking against actual JSON structure
  - **Then:** TypeScript type includes optional fields for `stack`, `brand`, `source`, `submodules`
  - **Note:** This test documents the expected type shape; actual validation is against JSON
  - **File:** `tests/templates/type-json-alignment.test.ts`

#### Test 1.3: Source object structure matches TypeScript

- [ ] **Test:** GitSource structure has all required fields

  - **Given:** A template with `source` field
  - **When:** Examining the source object structure
  - **Then:** Contains `type`, `url`, `branch`, and optional `gitOptions`
  - **File:** `tests/templates/type-json-alignment.test.ts`

#### Test 1.4: Submodules structure matches TypeScript

- [ ] **Test:** Submodule entries have correct structure

  - **Given:** A template with `submodules` field (citisignal-headless)
  - **When:** Examining each submodule entry
  - **Then:** Each has `path` and `repository` fields
  - **File:** `tests/templates/type-json-alignment.test.ts`

### Test Suite 2: Stacks Type Alignment

```typescript
describe('stacks.json <-> TypeScript alignment', () => {
  // Tests that Stack interface matches actual JSON structure
});
```

#### Test 2.1: Stack required fields validated

- [ ] **Test:** All Stack required fields present in every stack

  - **Given:** The `stacks.json` file and `Stack` interface
  - **When:** Validating each stack object
  - **Then:** Every stack has `id`, `name`, `description`, `frontend`, `backend`, `dependencies`
  - **File:** `tests/templates/type-json-alignment.test.ts`

#### Test 2.2: Stack optional fields correctly typed

- [ ] **Test:** Optional Stack fields have correct types when present

  - **Given:** Stacks with optional fields (`icon`, `features`, `requiresGitHub`, `requiresDaLive`)
  - **When:** Checking field types
  - **Then:** String for `icon`, string array for `features`, boolean for `requires*`
  - **File:** `tests/templates/type-json-alignment.test.ts`

### Test Suite 3: Brands Type Alignment

```typescript
describe('brands.json <-> TypeScript alignment', () => {
  // Tests that Brand interface matches actual JSON structure
});
```

#### Test 3.1: Brand required fields validated

- [ ] **Test:** All Brand required fields present in every brand

  - **Given:** The `brands.json` file and `Brand` interface
  - **When:** Validating each brand object
  - **Then:** Every brand has `id`, `name`, `description`, `configDefaults`, `contentSources`
  - **File:** `tests/templates/type-json-alignment.test.ts`

#### Test 3.2: Brand optional fields correctly typed

- [ ] **Test:** Optional Brand fields have correct types when present

  - **Given:** Brands with optional fields (`icon`, `featured`, `compatibleStacks`, `addons`)
  - **When:** Checking field types
  - **Then:** String for `icon`, boolean for `featured`, string array for `compatibleStacks`
  - **File:** `tests/templates/type-json-alignment.test.ts`

### Test Suite 4: No Unknown Fields (Catch Future Drift)

```typescript
describe('no unknown JSON fields', () => {
  // Tests that detect when JSON has fields not in TypeScript types
});
```

#### Test 4.1: Templates have no undocumented fields

- [ ] **Test:** All fields in templates.json are known to TypeScript types

  - **Given:** Complete list of allowed DemoTemplate fields (from TypeScript interface)
  - **When:** Scanning each template for fields not in the allowed list
  - **Then:** No unknown fields found (or explicitly documented as expected)
  - **Note:** This is the key test that would have caught the original mismatch
  - **File:** `tests/templates/type-json-alignment.test.ts`

#### Test 4.2: Stacks have no undocumented fields

- [ ] **Test:** All fields in stacks.json are known to TypeScript types

  - **Given:** Complete list of allowed Stack fields
  - **When:** Scanning each stack for unknown fields
  - **Then:** No unknown fields found
  - **File:** `tests/templates/type-json-alignment.test.ts`

#### Test 4.3: Brands have no undocumented fields

- [ ] **Test:** All fields in brands.json are known to TypeScript types

  - **Given:** Complete list of allowed Brand fields
  - **When:** Scanning each brand for unknown fields
  - **Then:** No unknown fields found
  - **File:** `tests/templates/type-json-alignment.test.ts`

### Test Suite 5: Aggregate Validation Report

```typescript
describe('type/JSON alignment summary', () => {
  // Provides clear summary of alignment status
});
```

#### Test 5.1: All JSON/type pairs aligned

- [ ] **Test:** Summary validation that all type/JSON pairs pass

  - **Given:** All templates, stacks, brands JSON files and their TypeScript types
  - **When:** Running complete alignment check
  - **Then:** Reports clear pass/fail with specific field-level details on failure
  - **File:** `tests/templates/type-json-alignment.test.ts`

---

## Files to Create/Modify

### New Files

- [ ] `tests/templates/type-json-alignment.test.ts` - Type/JSON alignment validation tests

### Existing Files (Reference Only)

- `src/types/templates.ts` - TypeScript types for templates (updated in Step 2)
- `src/types/stacks.ts` - TypeScript types for stacks
- `src/types/brands.ts` - TypeScript types for brands
- `templates/templates.json` - Demo template JSON data
- `templates/stacks.json` - Stack configuration JSON
- `templates/brands.json` - Brand configuration JSON

---

## Implementation Details

### RED Phase (Write failing tests)

Create the test file with all alignment tests. Tests should fail initially because:
- Step 2 types not yet applied (if running before Step 2)
- Or tests validate structure we know should pass (baseline)

```typescript
/**
 * Type/JSON Alignment Validation Tests
 *
 * TDD: These tests ensure TypeScript types remain synchronized with JSON configuration files.
 * Catches type drift that causes silent runtime failures.
 *
 * Pattern: Load JSON, extract field names, compare against known TypeScript interface fields.
 */

import * as fs from 'fs';
import * as path from 'path';

// Define expected fields from TypeScript interfaces
// These act as the "source of truth" for what fields TypeScript expects

const DEMO_TEMPLATE_FIELDS = {
    required: ['id', 'name', 'description'],
    optional: ['icon', 'tags', 'featured', 'defaults', 'stack', 'brand', 'source', 'submodules']
};

const TEMPLATE_DEFAULTS_FIELDS = {
    optional: ['frontend', 'backend', 'dependencies', 'integrations', 'appBuilder', 'configDefaults']
};

const GIT_SOURCE_FIELDS = {
    required: ['type', 'url', 'branch'],
    optional: ['gitOptions']
};

const STACK_FIELDS = {
    required: ['id', 'name', 'description', 'frontend', 'backend', 'dependencies'],
    optional: ['icon', 'optionalAddons', 'features', 'requiresGitHub', 'requiresDaLive']
};

const BRAND_FIELDS = {
    required: ['id', 'name', 'description', 'configDefaults', 'contentSources'],
    optional: ['icon', 'featured', 'compatibleStacks', 'addons']
};

describe('Type/JSON Alignment Validation', () => {
    // ... test implementations
});
```

### GREEN Phase (Minimal implementation to pass tests)

1. Create the test file with helper functions:
   - `getAllFieldNames(obj)` - Extract all field names from an object
   - `validateRequiredFields(obj, requiredFields, objectName)` - Check required fields exist
   - `validateNoUnknownFields(obj, allowedFields, objectName)` - Detect unknown fields

2. Implement each test using the helpers

3. Run tests to verify all pass

### REFACTOR Phase (Improve while keeping tests green)

1. Extract common validation logic into reusable helper module if tests grow
2. Consider creating a shared `tests/templates/helpers/alignmentValidator.ts`
3. Ensure error messages are actionable (show which field is missing/unknown)

---

## Example Test Implementation

```typescript
import * as fs from 'fs';
import * as path from 'path';

// Allowed fields from TypeScript interfaces
const DEMO_TEMPLATE_ALL_FIELDS = new Set([
    '$schema', 'version', 'templates',  // Root config
    'id', 'name', 'description', 'icon', 'tags', 'featured',
    'defaults', 'stack', 'brand', 'source', 'submodules'
]);

const STACK_ALL_FIELDS = new Set([
    'id', 'name', 'description', 'icon', 'frontend', 'backend',
    'dependencies', 'optionalAddons', 'features', 'requiresGitHub', 'requiresDaLive'
]);

const BRAND_ALL_FIELDS = new Set([
    'id', 'name', 'description', 'icon', 'featured',
    'compatibleStacks', 'addons', 'configDefaults', 'contentSources'
]);

// Helper to get all fields from an object (shallow)
function getObjectFields(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
}

// Helper to find unknown fields
function findUnknownFields(obj: Record<string, unknown>, allowedFields: Set<string>): string[] {
    return getObjectFields(obj).filter(field => !allowedFields.has(field));
}

describe('Type/JSON Alignment Validation', () => {
    let templatesConfig: Record<string, unknown>;
    let stacksConfig: Record<string, unknown>;
    let brandsConfig: Record<string, unknown>;

    beforeAll(() => {
        const templatesPath = path.join(__dirname, '../../templates/templates.json');
        const stacksPath = path.join(__dirname, '../../templates/stacks.json');
        const brandsPath = path.join(__dirname, '../../templates/brands.json');

        templatesConfig = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
        stacksConfig = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
        brandsConfig = JSON.parse(fs.readFileSync(brandsPath, 'utf-8'));
    });

    describe('templates.json <-> TypeScript alignment', () => {
        it('should have no unknown fields in root config', () => {
            const rootAllowed = new Set(['$schema', 'version', 'templates']);
            const unknown = findUnknownFields(templatesConfig, rootAllowed);
            expect(unknown).toEqual([]);
        });

        it('should have no unknown fields in any template', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const unknown = findUnknownFields(template, DEMO_TEMPLATE_ALL_FIELDS);
                if (unknown.length > 0) {
                    fail(`Template "${template.id}" has unknown fields: ${unknown.join(', ')}. ` +
                         `Add these to TypeScript interface or remove from JSON.`);
                }
            });
        });

        it('should have required fields in every template', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const requiredFields = ['id', 'name', 'description'];

            templates.forEach(template => {
                requiredFields.forEach(field => {
                    expect(template[field]).toBeDefined();
                });
            });
        });
    });

    describe('stacks.json <-> TypeScript alignment', () => {
        it('should have no unknown fields in any stack', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            stacks.forEach(stack => {
                const unknown = findUnknownFields(stack, STACK_ALL_FIELDS);
                if (unknown.length > 0) {
                    fail(`Stack "${stack.id}" has unknown fields: ${unknown.join(', ')}. ` +
                         `Add these to TypeScript interface or remove from JSON.`);
                }
            });
        });
    });

    describe('brands.json <-> TypeScript alignment', () => {
        it('should have no unknown fields in any brand', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            brands.forEach(brand => {
                const unknown = findUnknownFields(brand, BRAND_ALL_FIELDS);
                if (unknown.length > 0) {
                    fail(`Brand "${brand.id}" has unknown fields: ${unknown.join(', ')}. ` +
                         `Add these to TypeScript interface or remove from JSON.`);
                }
            });
        });
    });
});
```

---

## Expected Outcome

After this step:
- New test file `tests/templates/type-json-alignment.test.ts` exists
- Tests validate all JSON/TypeScript pairs:
  - `templates.json` <-> `DemoTemplate`, `TemplateDefaults`, `GitSource`, `Submodule`
  - `stacks.json` <-> `Stack`, `StacksConfig`
  - `brands.json` <-> `Brand`, `BrandsConfig`
- Any future field additions to JSON without corresponding TypeScript updates will cause test failures
- Clear error messages identify exactly which field is mismatched

---

## Acceptance Criteria

- [ ] New test file created at `tests/templates/type-json-alignment.test.ts`
- [ ] Tests cover templates, stacks, and brands alignment
- [ ] "No unknown fields" tests detect JSON fields not in TypeScript
- [ ] "Required fields" tests verify TypeScript required fields exist in JSON
- [ ] All tests pass with current (corrected) types from Step 2
- [ ] Test failure messages are actionable (identify specific field and file)
- [ ] Tests run in under 5 seconds (configuration file tests should be fast)

---

## Estimated Time

1-2 hours

---

## Relationship to Other Steps

**Depends On:**
- Step 2 (Fix TypeScript types) - Types must be correct for alignment tests to pass

**Enables:**
- Future-proofs the codebase against type/JSON drift
- Creates a pattern for adding new configuration files with type safety

**Can Run In Parallel With:**
- Nothing - this is the final step

---

## Notes

### Why Test-Time Validation Over Other Approaches

1. **JSON Schema validation in tests (CHOSEN)**
   - Pros: No dependencies, runs with existing Jest, catches issues at PR time
   - Cons: Doesn't catch issues until tests run
   - Verdict: Best balance of simplicity and effectiveness

2. **Type generation from JSON schema (json-schema-to-typescript)**
   - Pros: Types auto-generated, always in sync
   - Cons: Types become less readable, adds build step, harder to add JSDoc
   - Verdict: Overkill for small number of config files

3. **Runtime validation with Zod**
   - Pros: Validates at runtime, great for API responses
   - Cons: Adds dependency, config files are trusted at build time
   - Verdict: Better for untrusted data, not needed for bundled config

### Preventing False Positives

The tests use explicit field lists rather than extracting from TypeScript at runtime because:
1. TypeScript types are erased at runtime - can't inspect interface fields
2. Explicit lists document expected structure clearly
3. Changes to either side (TypeScript or JSON) require updating the test - intentional friction

### Error Message Quality

Tests should produce actionable errors:

```
FAIL: Template "citisignal-headless" has unknown fields: newField, anotherField.
      Add these to TypeScript interface (src/types/templates.ts) or remove from JSON.
```

Not vague errors:

```
FAIL: Template validation failed
```

---

## TDD Workflow Commands

```bash
# Watch mode for this test file
npm run test:watch -- tests/templates/type-json-alignment.test.ts

# Run alignment tests only
npm test -- tests/templates/type-json-alignment.test.ts

# Verify all template tests pass
npm test -- tests/templates/
```

---

**Step Status:** ✅ COMPLETE (2025-12-24)

**Completion Summary:**
- Created new test file `tests/templates/type-json-alignment.test.ts`
- Added 12 tests for type/JSON alignment validation
- All 12 new tests passing
- Catches future type drift by detecting unknown fields in JSON

**New Tests:**
1. `templates.json root config - no unknown fields`
2. `templates.json templates - no unknown fields`
3. `templates.json template.defaults - no unknown fields`
4. `templates.json template.source - no unknown fields`
5. `templates.json template.source.gitOptions - no unknown fields`
6. `templates.json template.submodules entries - no unknown fields`
7. `stacks.json root config - no unknown fields`
8. `stacks.json stacks - no unknown fields`
9. `brands.json root config - no unknown fields`
10. `brands.json brands - no unknown fields`
11. `brands.json brand.contentSources - no unknown fields`
12. `aggregate alignment check - passes all`

**Key Feature:**
The "no unknown fields" tests would have caught the original DemoTemplate type drift issue where `stack`, `brand`, `source`, `submodules` existed in JSON but weren't in TypeScript.

**Files Created:**
- `tests/templates/type-json-alignment.test.ts` (12 tests)

**Note:** Pre-existing failures in `stacks.test.ts` are unrelated to this step - that file expects a `components` key in components.json that doesn't exist in the current structure.

---

_Step 8 of 8 - Test Coverage Remediation Plan_
_Phase: Build Validation (Final Phase)_
