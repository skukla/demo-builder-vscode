# Step 7: Verification Sweep

**Purpose:** Ensure complete cleanup of old brand/template architecture with no orphaned imports, stale references, or broken type dependencies.

**Prerequisites:**
- [ ] Step 6 complete (old files deleted)
- [ ] All previous migration steps successful

---

## Verification Commands

### 7.1 Check for Stale JSON File References

Run these grep commands to ensure no code still references deleted JSON files:

```bash
# Check for brands.json imports/references
npx rg "brands\.json" --type ts --type tsx -l

# Check for templates.json imports/references (old demo-templates.json references)
npx rg "demo-templates\.json" --type ts --type tsx -l

# Expected result: No matches (empty output)
```

**Acceptance Criteria:**
- [ ] No files reference `brands.json`
- [ ] No files reference old `demo-templates.json` patterns that should now use `demo-packages.json`

---

### 7.2 Check for Old Type Imports

Run these grep commands to find orphaned type imports:

```bash
# Check for Brand type imports (should not exist independently)
npx rg "import.*\bBrand\b" --type ts --type tsx -l
npx rg "from.*brands" --type ts --type tsx -l

# Check for DemoTemplate type imports (should be replaced with DemoPackage)
npx rg "import.*\bDemoTemplate\b" --type ts --type tsx -l
npx rg "DemoTemplate[^a-zA-Z]" --type ts --type tsx -l

# Expected result: No matches for old types
```

**Acceptance Criteria:**
- [ ] No standalone `Brand` type imports remain
- [ ] No `DemoTemplate` type imports remain (replaced by `DemoPackage`)
- [ ] All type references use new unified types

---

### 7.3 Check for Old Loader Function References

Run these grep commands to find stale loader imports:

```bash
# Check for old brandStackLoader references
npx rg "brandStackLoader" --type ts --type tsx -l
npx rg "loadBrands" --type ts --type tsx -l

# Check for old templateLoader references
npx rg "templateLoader" --type ts --type tsx -l
npx rg "loadTemplates" --type ts --type tsx -l

# Check for any remaining brandLoader references
npx rg "brandLoader" --type ts --type tsx -l

# Expected result: No matches
```

**Acceptance Criteria:**
- [ ] No `brandStackLoader` references remain
- [ ] No `templateLoader` references remain
- [ ] No `loadBrands` or `loadTemplates` function calls remain
- [ ] All loading now uses `demoPackageLoader`

---

### 7.4 Check for Stale Path Constants

```bash
# Check for old path references in constants or config
npx rg "BRANDS_PATH|TEMPLATES_PATH" --type ts --type tsx -l
npx rg "brands\.json|templates\.json" --type ts --type tsx -l

# Expected result: No matches
```

**Acceptance Criteria:**
- [ ] No old path constants reference deleted files
- [ ] Path constants updated to reference `demo-packages.json`

---

### 7.5 TypeScript Compilation Verification

```bash
# Run TypeScript compiler in strict mode
npm run compile

# Or if using tsc directly:
npx tsc --noEmit

# Expected result: No compilation errors
```

**Acceptance Criteria:**
- [ ] TypeScript compiles with zero errors
- [ ] No type mismatches from migration
- [ ] All imports resolve correctly

---

### 7.6 Test Suite Verification

```bash
# Run full test suite
npm test

# Run with coverage to ensure all paths tested
npm test -- --coverage

# Expected result: All tests pass
```

**Acceptance Criteria:**
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No test files reference deleted modules
- [ ] Coverage maintained at acceptable levels

---

### 7.7 Runtime Verification (Manual)

After automated checks pass, verify manually:

1. **Launch Extension in Debug Mode (F5)**
   - [ ] Extension activates without errors
   - [ ] No console errors in Debug Console

2. **Open Project Creation Wizard**
   - [ ] Welcome step loads demo packages correctly
   - [ ] Package selection works as expected
   - [ ] Component pre-selection from packages works

3. **Check Output Channels**
   - [ ] "Demo Builder: Logs" shows no loader errors
   - [ ] "Demo Builder: Debug" shows successful package loading

---

## Remediation Steps

If any verification check fails, follow these remediation steps:

### For Stale Import Found
1. Open the file containing the stale import
2. Update import to use new `demoPackageLoader` or `DemoPackage` type
3. Re-run verification command

### For Type Error Found
1. Check if type needs to be updated from `DemoTemplate` to `DemoPackage`
2. Check if `Brand` interface should be inlined or removed
3. Update type annotations accordingly

### For Test Failure Found
1. Check if test is testing deleted functionality
2. Update test to use new package-based approach
3. Ensure test fixtures use new schema

---

## Verification Summary Checklist

**Automated Checks:**
- [ ] No `brands.json` references
- [ ] No `demo-templates.json` old-style references
- [ ] No `Brand` type imports
- [ ] No `DemoTemplate` type imports
- [ ] No old loader function references
- [ ] No stale path constants
- [ ] TypeScript compiles successfully
- [ ] All tests pass

**Manual Checks:**
- [ ] Extension activates without errors
- [ ] Demo package selection works in wizard
- [ ] No runtime console errors

---

## Expected Outcome

After this verification step:
- Complete confidence that migration is clean
- No orphaned code or broken references
- All automated quality gates pass
- Extension fully functional with new architecture

---

## Estimated Time

- Automated verification: 5-10 minutes
- Manual verification: 5-10 minutes
- Remediation (if needed): 15-30 minutes

**Total:** 15-50 minutes depending on issues found

---

## Notes

- If grep commands are unavailable, use VS Code's global search (Cmd+Shift+F)
- Search patterns should be case-sensitive for type names
- Check both `src/` and `tests/` directories
- Don't forget to check `templates/` directory for any documentation references
