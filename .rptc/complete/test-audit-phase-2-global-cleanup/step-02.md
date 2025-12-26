# Step 2: Clean features/components/ Test Files

**Purpose:** Clean the 4 test files in features/components/, including the critical `ComponentRegistryManager.testUtils.ts` shared utility file. This step requires careful ordering because the testUtils file exports symbols used by other test files.

**Prerequisites:**
- [ ] Step 1 complete (core/ and unit/ files reviewed)
- [ ] All tests currently pass

---

## Files to Clean (4 files + 1 shared utility)

**Update Order (CRITICAL):**

1. `tests/features/components/services/ComponentRegistryManager.testUtils.ts` - **UPDATE FIRST** (shared exports)
2. `tests/features/components/services/ComponentRegistryManager-mockValidation.test.ts`
3. `tests/features/components/services/ComponentRegistryManager-security.test.ts`
4. `tests/features/components/services/ComponentRegistryManager-v3Structure.test.ts`
5. `tests/features/components/services/ComponentRegistryManager-validation.test.ts`

---

## Tests to Write First

- [ ] Test: testUtils exports compile after renaming
  - **Given:** Exports renamed in testUtils
  - **When:** Running `npm run compile`
  - **Then:** No TypeScript errors

- [ ] Test: All consumer files compile after updating imports
  - **Given:** Imports updated in all consumer files
  - **When:** Running `npm run compile`
  - **Then:** No TypeScript errors

- [ ] Test: All tests pass after refactoring
  - **Given:** All files updated
  - **When:** Running `npm test -- --testPathPattern="components"`
  - **Then:** All tests pass

---

## Implementation Details

### File 1: `ComponentRegistryManager.testUtils.ts` (Update First)

This file contains the core exports that other files depend on.

#### Renames Required:

**Variable Renames:**
- [ ] `mockRawRegistryV3` -> `mockRegistry` (NOTE: May conflict with existing `mockRawRegistry` - need to assess)
- [ ] `V3_COMPONENT_SECTIONS` -> `COMPONENT_SECTIONS`
- [ ] `V3ComponentSection` -> `ComponentSection`
- [ ] `createMaliciousRegistryV3` -> Remove function, consolidate into `createMaliciousRegistry`

**Strategy for Mock Conflict:**

The file has TWO mocks:
- `mockRawRegistry` - v2.0 structure (unified 'components' map)
- `mockRawRegistryV3` - v3.0.0 structure (separate sections)

**Decision:** Since v3.0.0 is the current structure:
1. Rename `mockRawRegistry` -> `mockLegacyRegistry` (for backward compatibility tests)
2. Rename `mockRawRegistryV3` -> `mockRegistry` (current structure)
3. Update all imports accordingly

**Comment Updates:**
- [ ] Remove version numbers from comments
- [ ] Change "v3.0.0 structure" to "current structure"
- [ ] Change "v2.0 structure" to "legacy structure" (where still needed)

**Specific Changes:**

```typescript
// BEFORE
export const mockRawRegistry: RawComponentRegistry = { ... }
export const mockRawRegistryV3: RawComponentRegistry = { ... }
export const V3_COMPONENT_SECTIONS = [ ... ]
export type V3ComponentSection = typeof V3_COMPONENT_SECTIONS[number]
export function createMaliciousRegistryV3(...) { ... }

// AFTER
export const mockLegacyRegistry: RawComponentRegistry = { ... }  // was mockRawRegistry
export const mockRegistry: RawComponentRegistry = { ... }        // was mockRawRegistryV3
export const COMPONENT_SECTIONS = [ ... ]
export type ComponentSection = typeof COMPONENT_SECTIONS[number]
// Remove createMaliciousRegistryV3, update createMaliciousRegistry to not need useV3 flag
```

---

### File 2: `ComponentRegistryManager-mockValidation.test.ts`

**Import Updates:**
- [ ] Update imports from testUtils to use new names
- [ ] `mockRawRegistryV3` -> `mockRegistry`
- [ ] `V3_COMPONENT_SECTIONS` -> `COMPONENT_SECTIONS`

**Comment Updates:**
- [ ] "v3.0.0 component sections" -> "component sections"
- [ ] "v3.0.0 mocks" -> "current mocks"

**Test Description Updates:**
- [ ] `'should have all v3.0.0 component sections present'` -> `'should have all component sections present'`
- [ ] `'should NOT have deprecated components map (v2.0 structure)'` -> `'should use section-based structure (not deprecated components map)'`
- [ ] `'createMaliciousRegistry v3.0.0 support'` -> `'createMaliciousRegistry'`
- [ ] `'should create malicious registry for v3.0.0 frontends section'` -> `'should create malicious registry for frontends section'`
- [ ] Similar updates for other v3.0.0 mentions

---

### File 3: `ComponentRegistryManager-security.test.ts`

**Import Updates:**
- [ ] `mockRawRegistryV3` -> `mockRegistry`
- [ ] `createMaliciousRegistryV3` -> `createMaliciousRegistry`
- [ ] `V3_COMPONENT_SECTIONS` -> `COMPONENT_SECTIONS`

**Comment Updates:**
- [ ] Remove version references

---

### File 4: `ComponentRegistryManager-v3Structure.test.ts`

**File Rename:**
- [ ] Consider renaming file to `ComponentRegistryManager-structure.test.ts`

**Comment Updates (Header):**
```typescript
// BEFORE
/**
 * ComponentRegistryManager v3.0.0 Structure Tests
 *
 * These tests validate that ComponentRegistryManager correctly handles the
 * v3.0.0 components.json structure where components are in separate sections
 * ...
 */

// AFTER
/**
 * ComponentRegistryManager Structure Tests
 *
 * These tests validate that ComponentRegistryManager correctly handles the
 * current components.json structure where components are in separate sections
 * ...
 */
```

**Import Updates:**
- [ ] `mockRawRegistryV3` -> `mockRegistry`

**Test Description Updates:**
- [ ] `'ComponentRegistryManager - v3.0.0 Structure Support'` -> `'ComponentRegistryManager - Structure Support'`
- [ ] `'loading v3.0.0 structure'` -> `'loading registry structure'`
- [ ] `'getComponentById with v3.0.0 structure'` -> `'getComponentById'`
- [ ] `'getNodeVersionToComponentMapping with v3.0.0 structure'` -> `'getNodeVersionToComponentMapping'`
- [ ] `'getRequiredNodeVersions with v3.0.0 structure'` -> `'getRequiredNodeVersions'`
- [ ] `'getFrontends/getBackends with v3.0.0 structure'` -> `'getFrontends/getBackends'`

---

### File 5: `ComponentRegistryManager-validation.test.ts`

**Import Updates:**
- [ ] Update any v3 references from testUtils

**Comment/Description Updates:**
- [ ] Remove version references

---

## Documentation Update: tests/README.md

The README contains version alignment documentation that should be updated:

**Current text:**
```markdown
2. **Version alignment**: When JSON structure changes (e.g., v2.0 -> v3.0.0), add new versioned mocks
...
// v2.0 structure (unified 'components' map)
...
// v3.0.0 structure (separate top-level sections)
```

**Updated text:**
```markdown
2. **Structure alignment**: When JSON structure changes, update mocks to match current structure
...
// legacy structure (unified 'components' map)
...
// current structure (separate top-level sections)
```

---

## Verification Checklist

After completing all files:

- [ ] Run `npm run compile` - no errors
- [ ] Run `npm test -- --testPathPattern="components"` - all tests pass
- [ ] Grep verification:
  ```bash
  grep -r "v3\.0\|v2\.0\|mockV3\|mockRawRegistryV3\|V3_" tests/features/components/ --include="*.ts"
  ```
  Should return empty.

---

## Expected Outcome

- [ ] testUtils exports renamed
- [ ] All 4 test files updated with new import names
- [ ] Test descriptions no longer mention version numbers
- [ ] Comments updated to say "current" instead of "v3.0.0"
- [ ] All tests still pass
- [ ] Ready for Step 3

**Estimated Time:** 1 hour

---

## Acceptance Criteria

- [ ] All 5 files updated (4 tests + 1 testUtils)
- [ ] All exports renamed per spec
- [ ] All imports updated to match
- [ ] No TypeScript compilation errors
- [ ] All existing tests pass
- [ ] tests/README.md updated
- [ ] Git diff shows consistent renaming pattern
