# Step 6: Delete Old Files

## Purpose

Remove deprecated brand/template files now that the migration to demo-packages architecture is complete. This cleanup step eliminates code duplication and ensures the codebase only contains the new unified architecture.

## Prerequisites

- [ ] Step 5 complete (all tests updated and passing)
- [ ] All imports updated to use new demo-packages modules
- [ ] No remaining references to old files in the codebase

---

## Pre-Deletion Verification

**CRITICAL**: Before deleting ANY files, verify the migration is complete.

### Verification Tests

- [ ] **Test: All unit tests pass**
  - **Given:** Migration complete from steps 1-5
  - **When:** Run full test suite
  - **Then:** All tests pass with no failures
  - **Command:** `npm test`

- [ ] **Test: No references to old modules remain**
  - **Given:** Codebase with old files still present
  - **When:** Search for imports of deprecated modules
  - **Then:** Zero matches found (except test files testing old modules)
  - **Command:** `grep -r "from.*brands\.ts\|from.*templates\.ts\|from.*brandDefaults\|from.*brandStackLoader\|from.*templateLoader\|from.*templateDefaults" src/ --include="*.ts" --include="*.tsx"`

- [ ] **Test: Extension compiles without errors**
  - **Given:** All source files present
  - **When:** Run TypeScript compilation
  - **Then:** No compilation errors
  - **Command:** `npm run compile`

---

## Files to Delete

### Template Configuration Files

| File | Reason for Deletion |
|------|---------------------|
| `templates/brands.json` | Replaced by `templates/demo-packages.json` |
| `templates/brands.schema.json` | Replaced by `templates/demo-packages.schema.json` |
| `templates/templates.json` | Replaced by `templates/demo-packages.json` |
| `templates/demo-templates.schema.json` | Replaced by `templates/demo-packages.schema.json` |

### Type Definition Files

| File | Reason for Deletion |
|------|---------------------|
| `src/types/brands.ts` | Replaced by `src/types/demoPackages.ts` |
| `src/types/templates.ts` | Replaced by `src/types/demoPackages.ts` |

### Helper Files

| File | Reason for Deletion |
|------|---------------------|
| `src/features/project-creation/ui/helpers/brandDefaults.ts` | Replaced by `src/features/project-creation/ui/helpers/demoPackageDefaults.ts` |
| `src/features/project-creation/ui/helpers/brandStackLoader.ts` | Replaced by `src/features/project-creation/ui/helpers/demoPackageLoader.ts` |
| `src/features/project-creation/ui/helpers/templateLoader.ts` | Replaced by `src/features/project-creation/ui/helpers/demoPackageLoader.ts` |
| `src/features/project-creation/ui/helpers/templateDefaults.ts` | Replaced by `src/features/project-creation/ui/helpers/demoPackageDefaults.ts` |

---

## Implementation Details

### Phase 1: Final Reference Check

Before deletion, perform a comprehensive search for any remaining references:

```bash
# Search for brand-related imports
grep -rn "brands\.json\|brands\.schema" templates/ src/
grep -rn "from.*['\"].*brands['\"]" src/
grep -rn "from.*brandDefaults" src/
grep -rn "from.*brandStackLoader" src/

# Search for template-related imports
grep -rn "templates\.json\|demo-templates\.schema" templates/ src/
grep -rn "from.*['\"].*templates['\"]" src/
grep -rn "from.*templateLoader" src/
grep -rn "from.*templateDefaults" src/
```

**Expected Result:** No matches in production code (matches in old test files are expected and will be deleted).

### Phase 2: Delete Template Configuration Files

```bash
# Delete old template configuration files
rm templates/brands.json
rm templates/brands.schema.json
rm templates/templates.json
rm templates/demo-templates.schema.json
```

**Files deleted:**
- [ ] `templates/brands.json`
- [ ] `templates/brands.schema.json`
- [ ] `templates/templates.json`
- [ ] `templates/demo-templates.schema.json`

### Phase 3: Delete Type Definition Files

```bash
# Delete old type files
rm src/types/brands.ts
rm src/types/templates.ts
```

**Files deleted:**
- [ ] `src/types/brands.ts`
- [ ] `src/types/templates.ts`

### Phase 4: Delete Helper Files

```bash
# Delete old helper files
rm src/features/project-creation/ui/helpers/brandDefaults.ts
rm src/features/project-creation/ui/helpers/brandStackLoader.ts
rm src/features/project-creation/ui/helpers/templateLoader.ts
rm src/features/project-creation/ui/helpers/templateDefaults.ts
```

**Files deleted:**
- [ ] `src/features/project-creation/ui/helpers/brandDefaults.ts`
- [ ] `src/features/project-creation/ui/helpers/brandStackLoader.ts`
- [ ] `src/features/project-creation/ui/helpers/templateLoader.ts`
- [ ] `src/features/project-creation/ui/helpers/templateDefaults.ts`

### Phase 5: Delete Old Test Files

Delete any test files that were specifically testing the old modules (if they exist):

```bash
# Delete old test files if they exist
rm -f tests/unit/types/brands.test.ts
rm -f tests/unit/types/templates.test.ts
rm -f tests/unit/features/project-creation/ui/helpers/brandDefaults.test.ts
rm -f tests/unit/features/project-creation/ui/helpers/brandStackLoader.test.ts
rm -f tests/unit/features/project-creation/ui/helpers/templateLoader.test.ts
rm -f tests/unit/features/project-creation/ui/helpers/templateDefaults.test.ts
```

**Note:** Use `-f` flag to avoid errors if files don't exist.

---

## Post-Deletion Verification

### Verification Checklist

- [ ] **Test: TypeScript compilation succeeds**
  - **Command:** `npm run compile`
  - **Expected:** No errors

- [ ] **Test: All tests pass after deletion**
  - **Command:** `npm test`
  - **Expected:** All tests pass

- [ ] **Test: Extension builds successfully**
  - **Command:** `npm run build`
  - **Expected:** Build completes without errors

- [ ] **Test: No broken imports**
  - **Command:** `npm run compile 2>&1 | grep -i "cannot find module"`
  - **Expected:** No output (no missing module errors)

---

## Expected Outcome

After completing this step:

1. **Codebase cleaned:** All deprecated brand/template files removed
2. **No orphaned code:** No dead imports or references
3. **Tests passing:** Full test suite runs successfully
4. **Build working:** Extension compiles and builds without errors

**Total files deleted:** 10 files
- 4 template configuration files
- 2 type definition files
- 4 helper files

---

## Rollback Plan

If issues are discovered after deletion:

1. **Git restore:** `git checkout HEAD -- <deleted-file-path>`
2. **Or restore all:** `git checkout HEAD -- templates/brands.json templates/brands.schema.json templates/templates.json templates/demo-templates.schema.json src/types/brands.ts src/types/templates.ts src/features/project-creation/ui/helpers/brandDefaults.ts src/features/project-creation/ui/helpers/brandStackLoader.ts src/features/project-creation/ui/helpers/templateLoader.ts src/features/project-creation/ui/helpers/templateDefaults.ts`

---

## Acceptance Criteria

- [ ] All 10 deprecated files deleted
- [ ] TypeScript compilation succeeds
- [ ] All tests pass
- [ ] Extension builds successfully
- [ ] No console errors when running extension
- [ ] No remaining references to deleted modules

**Estimated Time:** 15 minutes

---

## Notes

- This step should only be executed after ALL previous steps are complete and verified
- The deletion is safe because all functionality has been migrated to the new demo-packages architecture
- Git history preserves the old files if needed for reference
