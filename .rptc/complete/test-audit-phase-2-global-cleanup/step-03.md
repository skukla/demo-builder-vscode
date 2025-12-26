# Step 3: Clean features/prerequisites/, features/authentication/, and templates/ Test Files

**Purpose:** Clean the remaining 16 test files. These files may reference exports renamed in Step 2, so ensure Step 2 is complete before starting.

**Prerequisites:**
- [ ] Step 1 complete (core/ and unit/ files reviewed)
- [ ] Step 2 complete (components/ files and testUtils updated)
- [ ] All tests currently pass

---

## Files to Clean (16 files)

### features/authentication/ (1 file)
1. `tests/features/authentication/services/tokenManager.test.ts`

### features/prerequisites/ (14 files)
2. `tests/features/prerequisites/handlers/checkHandler-multiVersion.test.ts`
3. `tests/features/prerequisites/handlers/continueHandler-edge-cases.test.ts`
4. `tests/features/prerequisites/handlers/continueHandler-operations.test.ts`
5. `tests/features/prerequisites/handlers/installHandler-edgeCases.test.ts`
6. `tests/features/prerequisites/handlers/installHandler-happyPath.test.ts`
7. `tests/features/prerequisites/handlers/installHandler-nodeVersions.test.ts`
8. `tests/features/prerequisites/handlers/installHandler-sharedUtilities.test.ts`
9. `tests/features/prerequisites/handlers/installHandler-versionSatisfaction.test.ts`
10. `tests/features/prerequisites/handlers/installHandler.test.ts`
11. `tests/features/prerequisites/handlers/security-validation.test.ts`
12. `tests/features/prerequisites/handlers/shared-dependencies.test.ts`
13. `tests/features/prerequisites/handlers/shared-per-node-status.test.ts`
14. `tests/features/prerequisites/services/PrerequisitesManager-checking.test.ts`
15. `tests/features/prerequisites/services/PrerequisitesManager-edgeCases.test.ts`

### templates/ (1 file)
16. `tests/templates/type-json-alignment.test.ts`

---

## Tests to Write First

- [ ] Test: All files compile after cleanup
  - **Given:** All version references removed
  - **When:** Running `npm run compile`
  - **Then:** No TypeScript errors

- [ ] Test: All tests pass after cleanup
  - **Given:** All files cleaned
  - **When:** Running `npm test`
  - **Then:** All tests pass

---

## Implementation Details

### IMPORTANT: Node Version vs Schema Version

Many prerequisite tests mention Node versions like "Node 18", "Node 20", "Node 24". These are **runtime Node.js versions**, NOT schema versions, and should NOT be changed.

**DO NOT change:**
- `'Node 18'`, `'Node 20'`, `'Node 24'` - runtime versions
- `'v18.0.0'`, `'v20.0.0'` - Node.js version strings
- `useNodeVersion: '20'` - Node version parameter

**DO change:**
- `'v3.0.0 structure'` - schema version reference
- `mockRawRegistryV3` - versioned mock name
- Comments mentioning `v2.0` or `v3.0.0` schema versions

---

### File 1: `tokenManager.test.ts`

**Analysis:** Based on review, this file has NO schema version references. Node version mentions are runtime versions.

**Action:**
- [ ] Verify no schema version references exist
- [ ] Skip if clean (likely already clean)

---

### Files 2-15: Prerequisites Handler and Service Tests

These files likely have minimal schema version references. Most version mentions are Node.js runtime versions.

**For each file:**
- [ ] Search for `v3\.0|v2\.0|mockV3|V3_` patterns
- [ ] Skip Node version references (Node 18, Node 20, etc.)
- [ ] Update any schema version comments
- [ ] Update any versioned mock imports (if they import from testUtils)

**Specific files to watch:**

#### `checkHandler-multiVersion.test.ts`
- [ ] "multiVersion" refers to Node versions, NOT schema versions
- [ ] Likely clean - verify and skip if no schema references

#### `installHandler-nodeVersions.test.ts`
- [ ] "nodeVersions" refers to Node.js runtime versions
- [ ] Likely clean - verify and skip if no schema references

#### `installHandler-versionSatisfaction.test.ts`
- [ ] "versionSatisfaction" likely refers to semver, not schema
- [ ] Likely clean - verify and skip if no schema references

---

### File 16: `type-json-alignment.test.ts`

**Analysis:** This file has significant schema version references that need cleanup.

**Comment Updates:**
```typescript
// BEFORE
// Components.json v3.0.0 Field Sets

// AFTER
// Components.json Field Sets (current structure)
```

```typescript
// BEFORE
/**
 * Root-level fields for components.json v3.0.0
 */

// AFTER
/**
 * Root-level fields for components.json (current structure)
 */
```

**Test Description Updates:**
- [ ] `'components.json alignment (v3.0.0 structure)'` -> `'components.json alignment'`

**Code Comment Updates:**
```typescript
// BEFORE
// components.json alignment (v3.0.0 structure)

// AFTER
// components.json alignment
```

---

## Batch Processing Approach

Given the large number of files, use this batch approach:

### Batch A: Authentication (1 file)
- [ ] `tokenManager.test.ts` - Review and clean if needed

### Batch B: Prerequisites Handlers (11 files)
- [ ] Review each file for schema version references
- [ ] Most likely clean (Node versions only)
- [ ] Update any imports if they reference renamed testUtils exports

### Batch C: Prerequisites Services (2 files)
- [ ] `PrerequisitesManager-checking.test.ts`
- [ ] `PrerequisitesManager-edgeCases.test.ts`

### Batch D: Templates (1 file)
- [ ] `type-json-alignment.test.ts` - Requires careful cleanup of schema version references

---

## Verification Checklist

After completing all files:

- [ ] Run `npm run compile` - no errors
- [ ] Run `npm test` - ALL tests pass
- [ ] Grep verification:
  ```bash
  grep -r "v3\.0\|v2\.0" tests/ --include="*.ts" | grep -v node_modules | grep -v "test.project.v2" | grep -v "version.*3.0.0"
  ```
  Should return only legitimate version references (Node versions, semver, etc.)

---

## Final Verification (All Steps Complete)

After all 3 steps:

```bash
# Full grep check for remaining version references
grep -rE "(v3\.0\.0|v2\.0|mockV3|mockRawRegistryV3|V3_COMPONENT|V3ComponentSection)" tests/ --include="*.ts" | grep -v node_modules

# This should return EMPTY
```

If any results, evaluate whether they are:
1. Legitimate (Node versions, test data) - KEEP
2. Schema version references - CLEAN

---

## Expected Outcome

- [ ] 16 files reviewed
- [ ] Schema version references removed
- [ ] Node version references preserved
- [ ] All tests still pass
- [ ] Phase 2 complete

**Estimated Time:** 1 hour

---

## Acceptance Criteria

- [ ] All 16 files reviewed and cleaned as needed
- [ ] No TypeScript compilation errors
- [ ] All existing tests pass
- [ ] Final grep verification shows no schema version references
- [ ] Node version references (Node 18, 20, 24) remain unchanged
- [ ] Test data containing version-like strings remains unchanged

---

## Phase 2 Completion Checklist

After Step 3 is complete:

- [ ] All 26 files cleaned
- [ ] testUtils exports renamed
- [ ] tests/README.md updated
- [ ] All tests pass
- [ ] `npm run compile` succeeds
- [ ] Final grep verification passes
- [ ] Git commit ready with descriptive message:
  ```
  test(cleanup): remove v2/v3 version references from test files

  - Rename mockRawRegistryV3 to mockRegistry
  - Rename V3_COMPONENT_SECTIONS to COMPONENT_SECTIONS
  - Update comments to say "current structure" instead of "v3.0.0"
  - Preserve Node version references (runtime versions)
  - Update tests/README.md documentation
  ```
