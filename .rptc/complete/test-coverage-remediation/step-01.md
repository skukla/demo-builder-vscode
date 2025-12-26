# Step 1: Fix Broken Imports

## Purpose

Fix the **BLOCKING issue** where code imports non-existent `demo-templates.json` file. The file was renamed to `templates.json` but code references were not updated. This must be fixed before any other work can proceed, as it causes:
- TypeScript compilation failures
- Test failures (file not found)
- Runtime errors if somehow reached

## Prerequisites

- [ ] Research report read and understood
- [ ] Confirm `templates/templates.json` exists (verified: YES)
- [ ] Confirm `templates/demo-templates.json` does NOT exist (verified: file was renamed)

## Tests to Write First (RED Phase)

### Test 1: Import Resolution Verification

```typescript
// File: tests/unit/features/project-creation/templateLoader.test.ts
// Purpose: Verify templateLoader imports resolve correctly

describe('templateLoader imports', () => {
  it('should successfully import templates from templates.json', async () => {
    // Arrange - Import the module (this validates the import path is correct)
    const { loadDemoTemplates } = await import(
      '@/features/project-creation/ui/helpers/templateLoader'
    );

    // Act - Load templates
    const templates = await loadDemoTemplates();

    // Assert - We got an array (proves import worked)
    expect(Array.isArray(templates)).toBe(true);
  });

  it('should load at least one template', async () => {
    // Arrange
    const { loadDemoTemplates } = await import(
      '@/features/project-creation/ui/helpers/templateLoader'
    );

    // Act
    const templates = await loadDemoTemplates();

    // Assert
    expect(templates.length).toBeGreaterThan(0);
  });
});
```

### Test 2: Existing Test Path Correction

The existing test at `tests/unit/templates/demoTemplates.test.ts` will be updated to use the correct path. Running the existing test currently fails with ENOENT (file not found).

```bash
# Before fix - Expected failure:
npm test -- tests/unit/templates/demoTemplates.test.ts
# Error: ENOENT: no such file or directory, open '.../templates/demo-templates.json'

# After fix - Expected success:
npm test -- tests/unit/templates/demoTemplates.test.ts
# All tests pass
```

## Files to Create/Modify

### Modify: `src/features/project-creation/ui/helpers/templateLoader.ts`

**Location:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/src/features/project-creation/ui/helpers/templateLoader.ts`

**Changes Required:**

| Line | Type | Before | After |
|------|------|--------|-------|
| 4 | Doc | `demo-templates.json` | `templates.json` |
| 8 | Import | `demo-templates.json` | `templates.json` |
| 16 | Doc | `demo-templates.json` | `templates.json` |

**Detailed Changes:**

```diff
- * Utility for loading and validating demo templates from demo-templates.json.
+ * Utility for loading and validating demo templates from templates.json.

- import templatesConfig from '../../../../../templates/demo-templates.json';
+ import templatesConfig from '../../../../../templates/templates.json';

- * Load demo templates from demo-templates.json
+ * Load demo templates from templates.json
```

### Modify: `tests/unit/templates/demoTemplates.test.ts`

**Location:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/tests/unit/templates/demoTemplates.test.ts`

**Changes Required:**

| Line | Type | Before | After |
|------|------|--------|-------|
| 3 | Comment | `demo-templates.json` | `templates.json` |
| 49 | Path | `demo-templates.json` | `templates.json` |

**Detailed Changes:**

```diff
- * Step 4: Add citisignal-eds template to demo-templates.json
+ * Step 4: Add citisignal-eds template to templates.json

- const templatesPath = path.join(__dirname, '../../../templates/demo-templates.json');
+ const templatesPath = path.join(__dirname, '../../../templates/templates.json');
```

### Modify: `src/types/templates.ts`

**Location:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/src/types/templates.ts`

**Changes Required:**

| Line | Type | Before | After |
|------|------|--------|-------|
| 57 | Doc | `demo-templates.json` | `templates.json` |

**Detailed Changes:**

```diff
- * DemoTemplatesConfig - Root structure of demo-templates.json
+ * DemoTemplatesConfig - Root structure of templates.json
```

## Implementation Details (RED-GREEN-REFACTOR)

### RED Phase (Verify Current Failure)

1. **Run TypeScript compilation** - should FAIL with import error:
   ```bash
   npm run compile
   # Expected: Error - Cannot find module '../../../../../templates/demo-templates.json'
   ```

2. **Run existing test** - should FAIL with ENOENT:
   ```bash
   npm test -- tests/unit/templates/demoTemplates.test.ts
   # Expected: ENOENT: no such file or directory
   ```

3. **Document baseline** - Both commands fail, confirming the blocking issue.

### GREEN Phase (Apply Minimal Fixes)

1. **Fix templateLoader.ts import** (critical path):
   ```typescript
   // Line 8: Change import path
   import templatesConfig from '../../../../../templates/templates.json';
   ```

2. **Fix demoTemplates.test.ts path**:
   ```typescript
   // Line 49: Change file path
   const templatesPath = path.join(__dirname, '../../../templates/templates.json');
   ```

3. **Fix documentation references**:
   - templateLoader.ts lines 4 and 16
   - templates.ts line 57

4. **Verify fixes**:
   ```bash
   # TypeScript compiles
   npm run compile

   # Tests pass
   npm test -- tests/unit/templates/demoTemplates.test.ts
   ```

### REFACTOR Phase

- No refactoring needed - this is a straightforward path fix
- The changes are minimal and surgical
- No architectural changes required

## Expected Outcome

After completing this step:

- [ ] TypeScript compiles without import errors (`npm run compile` succeeds)
- [ ] `templateLoader.ts` successfully imports from `templates.json`
- [ ] `demoTemplates.test.ts` successfully reads from `templates.json`
- [ ] All existing template tests pass
- [ ] Documentation accurately references `templates.json`

## Acceptance Criteria

- [ ] Import path in `templateLoader.ts` (line 8) points to `templates.json`
- [ ] Test path in `demoTemplates.test.ts` (line 49) points to `templates.json`
- [ ] Documentation in `templateLoader.ts` (lines 4, 16) references `templates.json`
- [ ] Documentation in `templates.ts` (line 57) references `templates.json`
- [ ] `npm run compile` succeeds without module resolution errors
- [ ] `npm test -- tests/unit/templates/demoTemplates.test.ts` passes all tests
- [ ] No runtime errors when loading templates in the extension

## Verification Commands

```bash
# 1. Verify TypeScript compilation
npm run compile

# 2. Verify specific test file
npm test -- tests/unit/templates/demoTemplates.test.ts

# 3. Verify templateLoader in isolation (if test exists)
npm test -- --testPathPattern="templateLoader"

# 4. Full test suite sanity check
npm test
```

## Dependencies from Other Steps

- **None** - This is a blocking fix that must complete first
- All subsequent steps depend on this fix being in place
- Steps 2-8 cannot proceed until imports resolve correctly

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Missed import references | Low | Medium | Search codebase for all `demo-templates.json` references |
| Schema file also renamed | Low | Low | Check if `demo-templates.schema.json` needs updates |
| Webpack bundling issues | Low | Medium | Test full build after changes |

### Additional Search (Recommended)

Before marking complete, search for any other references:

```bash
# Search entire codebase for old filename
grep -r "demo-templates.json" --include="*.ts" --include="*.tsx" --include="*.js"
grep -r "demo-templates.json" --include="*.md"
```

## Estimated Time

**15-20 minutes**

- 5 minutes: Verify current failure state (RED phase)
- 5 minutes: Apply fixes to 3 files (GREEN phase)
- 5-10 minutes: Verify all tests pass and compile succeeds

## Notes

- The schema file `demo-templates.schema.json` still exists and is correctly named for schema validation
- The `$schema` reference in `templates.json` may still point to `demo-templates.schema.json` which is fine
- This fix unblocks the entire test coverage remediation effort

---

**Step Status:** ✅ COMPLETE (2025-12-24)

**Completion Summary:**
- All import paths fixed from `demo-templates.json` to `templates.json`
- TypeScript compilation succeeds
- No remaining `demo-templates.json` references in codebase
- 12 tests passing, 14 failing (schema mismatch - addressed in Steps 2-4)

**Files Modified:**
- `src/features/project-creation/ui/helpers/templateLoader.ts` (lines 4, 8, 16)
- `tests/unit/templates/demoTemplates.test.ts` (lines 3, 49)
- `tests/features/project-creation/ui/helpers/templateLoader.test.ts` (lines 4, 13)
- `src/types/templates.ts` (line 57)

**Next Step:** Step 2 - Update TypeScript Types (depends on this step completing successfully)
