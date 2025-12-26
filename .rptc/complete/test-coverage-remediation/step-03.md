# Step 3: Create templates.json Tests

## Status Tracking

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)
- [ ] Step Complete

**Estimated Time:** 45-60 minutes
**Actual Time:** _To be filled during implementation_

---

## Purpose

Create a comprehensive test suite for `templates/templates.json` that validates:
1. **Structure validation** - Required fields, types, and schema compliance
2. **Cross-reference validation** - Stack IDs exist in `stacks.json`, brand IDs exist in `brands.json`
3. **Git source validation** - Valid GitHub URLs, branch definitions, gitOptions
4. **Featured templates validation** - Boolean featured flags
5. **Submodules validation** - Optional submodule configuration

This step establishes the **cross-reference validation pattern** that will be reused for future data model tests.

---

## Prerequisites

- [x] Step 1 complete (import paths fixed)
- [x] Step 2 complete (TypeScript types updated with `stack`, `brand`, `source`, `submodules` fields)
- [ ] Watch mode running: `npm run test:watch -- tests/templates`

---

## Tests to Write First

### Test File: `tests/templates/templates.test.ts`

**Follow existing patterns from:**
- `tests/templates/brands.test.ts` - Structure validation pattern
- `tests/templates/stacks.test.ts` - Cross-reference validation pattern

---

### 1. Structure Validation Tests

- [ ] **Test: Should have $schema reference**
  - **Given:** templates.json file loaded
  - **When:** Checking $schema field
  - **Then:** Value equals `"./templates.schema.json"`

- [ ] **Test: Should have required version field**
  - **Given:** templates.json file loaded
  - **When:** Checking version field
  - **Then:** Field exists and is a string

- [ ] **Test: Should have templates array with at least 1 template**
  - **Given:** templates.json file loaded
  - **When:** Checking templates array
  - **Then:** Array exists with length >= 1

- [ ] **Test: All templates should have required fields (id, name, description, stack, brand, source)**
  - **Given:** All templates in templates.json
  - **When:** Iterating through each template
  - **Then:** Each template has all required fields defined

- [ ] **Test: All templates should have unique IDs**
  - **Given:** All templates in templates.json
  - **When:** Extracting all IDs
  - **Then:** No duplicate IDs exist (Set size equals array length)

---

### 2. Cross-Reference Validation Tests (Pattern Establishment)

- [ ] **Test: All template.stack values should reference valid stacks in stacks.json**
  - **Given:** templates.json and stacks.json loaded
  - **When:** Checking each template's stack field
  - **Then:** Stack ID exists in stacks.json stacks array

- [ ] **Test: All template.brand values should reference valid brands in brands.json**
  - **Given:** templates.json and brands.json loaded
  - **When:** Checking each template's brand field
  - **Then:** Brand ID exists in brands.json brands array

---

### 3. Git Source Validation Tests

- [ ] **Test: All templates should have source.type equal to "git"**
  - **Given:** All templates in templates.json
  - **When:** Checking source.type field
  - **Then:** Value equals "git"

- [ ] **Test: All templates should have valid GitHub URL in source.url**
  - **Given:** All templates in templates.json
  - **When:** Checking source.url field
  - **Then:** URL matches pattern `https://github.com/`

- [ ] **Test: All templates should have source.branch defined**
  - **Given:** All templates in templates.json
  - **When:** Checking source.branch field
  - **Then:** Field exists and is a non-empty string

- [ ] **Test: All templates should have gitOptions with shallow and recursive booleans**
  - **Given:** All templates in templates.json
  - **When:** Checking source.gitOptions
  - **Then:** gitOptions.shallow is boolean, gitOptions.recursive is boolean

---

### 4. Featured Templates Validation Tests

- [ ] **Test: At least one template should be featured**
  - **Given:** All templates in templates.json
  - **When:** Filtering templates with featured === true
  - **Then:** At least one template is featured

- [ ] **Test: Featured field should be boolean when present**
  - **Given:** All templates in templates.json
  - **When:** Checking featured field
  - **Then:** If present, value is boolean (not undefined or other type)

---

### 5. Specific Template Validation Tests

- [ ] **Test: citisignal-headless template should exist**
  - **Given:** templates.json file loaded
  - **When:** Finding template with id "citisignal-headless"
  - **Then:** Template exists

- [ ] **Test: citisignal-headless should have correct stack and brand**
  - **Given:** citisignal-headless template
  - **When:** Checking stack and brand fields
  - **Then:** stack equals "headless-paas", brand equals "citisignal"

- [ ] **Test: citisignal-headless should be featured**
  - **Given:** citisignal-headless template
  - **When:** Checking featured field
  - **Then:** featured equals true

- [ ] **Test: citisignal-headless should have submodules defined**
  - **Given:** citisignal-headless template
  - **When:** Checking submodules field
  - **Then:** submodules object exists with demo-inspector configuration

---

### 6. Submodules Validation Tests (Optional Field)

- [ ] **Test: Templates with submodules should have valid path and repository**
  - **Given:** Templates that have submodules defined
  - **When:** Checking each submodule configuration
  - **Then:** Each submodule has path (string) and repository (string)

---

## File to Create

**Path:** `tests/templates/templates.test.ts`

```typescript
/**
 * Templates Configuration Tests
 *
 * TDD: Tests written FIRST to define behavior before implementation.
 *
 * This test suite validates the templates.json configuration file
 * which defines pre-configured demo templates combining stacks and brands.
 *
 * Key validations:
 * - Structure validation (required fields, types)
 * - Cross-reference validation (stack IDs exist in stacks.json)
 * - Cross-reference validation (brand IDs exist in brands.json)
 * - Git source validation (valid URLs, branches, gitOptions)
 */

import * as fs from 'fs';
import * as path from 'path';

describe('templates.json', () => {
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

    describe('structure validation', () => {
        it('should have $schema reference', () => {
            expect(templatesConfig.$schema).toBe('./templates.schema.json');
        });

        it('should have required version field', () => {
            expect(templatesConfig.version).toBeDefined();
            expect(typeof templatesConfig.version).toBe('string');
        });

        it('should have templates array with at least 1 template', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            expect(Array.isArray(templates)).toBe(true);
            expect(templates.length).toBeGreaterThanOrEqual(1);
        });

        it('should have unique IDs', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const ids = templates.map(t => t.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });
    });

    describe('all templates', () => {
        it('should have required fields (id, name, description, stack, brand, source)', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                expect(template.id).toBeDefined();
                expect(template.name).toBeDefined();
                expect(template.description).toBeDefined();
                expect(template.stack).toBeDefined();
                expect(template.brand).toBeDefined();
                expect(template.source).toBeDefined();
            });
        });
    });

    describe('cross-reference validation', () => {
        it('should reference valid stacks from stacks.json', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const validStackIds = new Set(stacks.map(s => s.id));

            templates.forEach(template => {
                const stackId = template.stack as string;
                expect(validStackIds.has(stackId)).toBe(true);
            });
        });

        it('should reference valid brands from brands.json', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const validBrandIds = new Set(brands.map(b => b.id));

            templates.forEach(template => {
                const brandId = template.brand as string;
                expect(validBrandIds.has(brandId)).toBe(true);
            });
        });
    });

    describe('git source validation', () => {
        it('should have source.type equal to "git"', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const source = template.source as Record<string, unknown>;
                expect(source.type).toBe('git');
            });
        });

        it('should have valid GitHub URL in source.url', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const source = template.source as Record<string, unknown>;
                const url = source.url as string;
                expect(url).toMatch(/^https:\/\/github\.com\//);
            });
        });

        it('should have source.branch defined', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const source = template.source as Record<string, unknown>;
                expect(source.branch).toBeDefined();
                expect(typeof source.branch).toBe('string');
                expect((source.branch as string).length).toBeGreaterThan(0);
            });
        });

        it('should have gitOptions with shallow and recursive booleans', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const source = template.source as Record<string, unknown>;
                const gitOptions = source.gitOptions as Record<string, unknown>;
                expect(gitOptions).toBeDefined();
                expect(typeof gitOptions.shallow).toBe('boolean');
                expect(typeof gitOptions.recursive).toBe('boolean');
            });
        });
    });

    describe('featured templates', () => {
        it('should have at least one featured template', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const featuredTemplates = templates.filter(t => t.featured === true);
            expect(featuredTemplates.length).toBeGreaterThanOrEqual(1);
        });

        it('should have boolean featured field when present', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                if (template.featured !== undefined) {
                    expect(typeof template.featured).toBe('boolean');
                }
            });
        });
    });

    describe('citisignal-headless template', () => {
        it('should exist', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const citisignalHeadless = templates.find(t => t.id === 'citisignal-headless');
            expect(citisignalHeadless).toBeDefined();
        });

        it('should have correct stack and brand', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const citisignalHeadless = templates.find(t => t.id === 'citisignal-headless');
            expect(citisignalHeadless?.stack).toBe('headless-paas');
            expect(citisignalHeadless?.brand).toBe('citisignal');
        });

        it('should be featured', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const citisignalHeadless = templates.find(t => t.id === 'citisignal-headless');
            expect(citisignalHeadless?.featured).toBe(true);
        });

        it('should have submodules defined', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const citisignalHeadless = templates.find(t => t.id === 'citisignal-headless');
            expect(citisignalHeadless?.submodules).toBeDefined();

            const submodules = citisignalHeadless?.submodules as Record<string, Record<string, string>>;
            expect(submodules['demo-inspector']).toBeDefined();
            expect(submodules['demo-inspector'].path).toBe('src/demo-inspector');
            expect(submodules['demo-inspector'].repository).toBe('skukla/demo-inspector');
        });
    });

    describe('submodules validation', () => {
        it('should have valid path and repository for all submodules', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;

            templates.forEach(template => {
                if (template.submodules) {
                    const submodules = template.submodules as Record<string, Record<string, string>>;
                    Object.entries(submodules).forEach(([name, config]) => {
                        expect(config.path).toBeDefined();
                        expect(typeof config.path).toBe('string');
                        expect(config.repository).toBeDefined();
                        expect(typeof config.repository).toBe('string');
                    });
                }
            });
        });
    });
});
```

---

## Implementation Details

### RED Phase (Write Failing Tests First)

1. Create the test file at `tests/templates/templates.test.ts`
2. Run tests with watch mode: `npm run test:watch -- tests/templates/templates.test.ts`
3. Verify tests pass (templates.json structure should already match)

**Note:** Since this step creates tests for an EXISTING configuration file (`templates.json`), the tests should pass immediately once written. The "RED" phase is conceptually that we're documenting expected behavior that was previously untested.

### GREEN Phase (Minimal Implementation)

No implementation changes required. The `templates.json` file already exists with the correct structure.

This step is about **adding test coverage** to validate the existing data model.

### REFACTOR Phase

1. Review test organization - ensure logical grouping
2. Ensure consistent assertion patterns with `brands.test.ts` and `stacks.test.ts`
3. Remove any redundant tests
4. Add additional edge case tests if gaps identified

---

## Expected Outcome

After this step completes:

- [ ] New test file `tests/templates/templates.test.ts` exists
- [ ] All 18+ tests pass
- [ ] Cross-reference validation pattern established (reusable for future tests)
- [ ] Data model coverage increases from ~40% toward 80% target

**Tests Passing:**
- 4 structure validation tests
- 1 all templates test
- 2 cross-reference validation tests
- 4 git source validation tests
- 2 featured templates tests
- 4 citisignal-headless specific tests
- 1 submodules validation test

---

## Acceptance Criteria

- [ ] Test file follows existing pattern from `brands.test.ts` and `stacks.test.ts`
- [ ] All tests use Given-When-Then structure in descriptions
- [ ] Cross-reference validation loads both source and target JSON files
- [ ] Tests run successfully in watch mode (<10 seconds)
- [ ] No console.log or debugger statements
- [ ] Test file <200 lines (simple, focused)

---

## Dependencies on Previous Steps

| Dependency | Required For | Status |
|------------|--------------|--------|
| Step 1 (Fix imports) | Not directly required | Must be complete |
| Step 2 (Fix types) | Type definitions for test fixtures | Must be complete |

---

## Dependencies for Future Steps

| Step | Depends On This Step For |
|------|--------------------------|
| Step 4 (Migrate legacy tests) | Cross-reference pattern established here |
| Step 8 (Build validation) | Template validation tests provide baseline |

---

## Rollback Plan

If tests fail unexpectedly:

1. Check `templates.json` structure matches expected format
2. Check `stacks.json` has all required stack IDs referenced by templates
3. Check `brands.json` has all required brand IDs referenced by templates
4. Review test file for typos in field names

**No code changes are made in this step** - only new test files created. Rollback = delete test file.

---

## Notes

### Pattern Establishment

This step establishes the **cross-reference validation pattern**:

```typescript
// Load both configs
const sourceConfig = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
const targetConfig = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));

// Extract valid IDs from target
const validIds = new Set(targetConfig.items.map(item => item.id));

// Validate each source reference
sourceConfig.items.forEach(item => {
    expect(validIds.has(item.referenceId)).toBe(true);
});
```

This pattern will be reused in future tests for other cross-references (e.g., components referencing prerequisites).

### Why These Tests Matter

Without these tests:
- Templates could reference non-existent stacks (runtime error)
- Templates could reference non-existent brands (runtime error)
- Git URLs could be malformed (clone failures)
- Schema compliance not enforced

With these tests:
- Cross-references validated at test time, not runtime
- Configuration errors caught in CI before deployment
- Data model contracts explicitly documented in tests

---

**Step Status:** ✅ COMPLETE (2025-12-24)

**Completion Summary:**
- Created 18 comprehensive tests for templates.json validation
- All tests passing (18/18)
- Cross-reference validation pattern established (templates → stacks, templates → brands)
- Git source validation (URLs, branches, gitOptions)
- Featured templates and submodules validation

**Files Created:**
- `tests/templates/templates.test.ts` (173 lines, 18 tests)

**Next Step:** Step 4 - Migrate Legacy Tests (Update demoTemplates.test.ts)
