# Step 3: Pre-Test Type Checking

**Status:** Pending
**Effort:** Low (30 minutes)
**Impact:** Medium (maintains type safety)
**Dependencies:** Step 1 (SWC Integration) must be complete

---

## Objective

Add a separate TypeScript type-checking step to maintain type safety since SWC (from Step 1) skips type checking during transformation.

**Expected Outcome:**
- `npm run test:typecheck` script available for developers
- Type errors caught before test execution
- CI pipeline can include type checking as separate step
- Zero runtime overhead during test execution

---

## Background

### Why This Is Needed

SWC is fast because it:
- Strips types without validating them
- Skips semantic analysis
- Does not build a type graph

This means TypeScript errors are NOT caught during test runs. A test file with type errors will still execute (and potentially pass or fail for wrong reasons).

### The Solution

Add a separate `tsc --noEmit` step that:
- Performs full type checking
- Does not emit compiled files (no-emit)
- Runs before tests in CI
- Available as optional local step

---

## Test Strategy

### Verification Approach

This step adds a new npm script. Verification focuses on:
1. Script executes successfully
2. Type errors are caught
3. No interference with test execution

### Happy Path Tests

- [ ] **Test:** Type check passes on valid code
  - **Given:** `test:typecheck` script configured
  - **When:** Running `npm run test:typecheck`
  - **Then:** Command completes with exit code 0
  - **File:** N/A (validation test)

- [ ] **Test:** Type check catches errors
  - **Given:** Intentionally introduce a type error in a test file
  - **When:** Running `npm run test:typecheck`
  - **Then:** Command fails with clear error message and location
  - **File:** N/A (manual verification)

### Edge Case Tests

- [ ] **Test:** Type check covers all test files
  - **Given:** tsconfig includes tests directory
  - **When:** Running type check
  - **Then:** All 345 test files are checked
  - **File:** N/A (validation test)

### Error Condition Tests

- [ ] **Test:** Type error provides actionable message
  - **Given:** Test file with type mismatch
  - **When:** Running type check
  - **Then:** Error shows file, line, column, and expected types
  - **File:** N/A (manual verification)

---

## Prerequisites

- [ ] Step 1 (SWC Integration) complete
- [ ] TypeScript 5.7+ installed (current version)
- [ ] tsconfig.json includes test files

---

## Implementation Details

### RED Phase: Verify Type Coverage

Check that TypeScript currently covers test files:

```bash
# Verify tsconfig includes tests
grep -A 5 "include" tsconfig.json

# Check for test file patterns
```

### GREEN Phase: Add Type Check Script

#### 1. Update package.json

Add the `test:typecheck` script to package.json:

**Location:** Add in the `scripts` section, near other test scripts

```json
{
  "scripts": {
    // ... existing scripts
    "test": "node --max-old-space-size=4096 node_modules/.bin/jest",
    "test:typecheck": "tsc --noEmit --project tsconfig.json",
    "test:fast": "node --max-old-space-size=4096 node_modules/.bin/jest --maxWorkers=75%",
    // ... rest of scripts
  }
}
```

**Script Explanation:**
- `tsc` - TypeScript compiler
- `--noEmit` - Check types only, don't output files
- `--project tsconfig.json` - Use project's TypeScript configuration

#### 2. Verify tsconfig.json Coverage

Ensure tsconfig.json includes test files. Check current configuration:

```bash
cat tsconfig.json | grep -A 10 "include"
```

If tests are not included, you may need to create or update a test-specific tsconfig:

**Option A: Tests already included in main tsconfig**
No changes needed.

**Option B: Create tsconfig.test.json if needed**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": [
    "src/**/*",
    "tests/**/*"
  ]
}
```

Then update the script:
```json
"test:typecheck": "tsc --noEmit --project tsconfig.test.json"
```

#### 3. Optional: Add Full Test Script

For convenience, add a script that runs both typecheck and tests:

```json
{
  "scripts": {
    "test:typecheck": "tsc --noEmit --project tsconfig.json",
    "test:full": "npm run test:typecheck && npm test"
  }
}
```

### REFACTOR Phase: Validation

#### 1. Test Script Execution

```bash
# Run type check
npm run test:typecheck

# Should complete with exit code 0
echo $?
```

#### 2. Verify Error Detection

Temporarily introduce a type error:

```bash
# Create a temporary test file with type error
cat > tests/temp-type-error.test.ts << 'EOF'
const x: string = 123;  // Type error: number not assignable to string
describe('temp', () => {
  it('fails typecheck', () => {
    expect(x).toBe(123);
  });
});
EOF

# Run type check - should fail
npm run test:typecheck

# Clean up
rm tests/temp-type-error.test.ts
```

#### 3. Verify Test Independence

Confirm tests still run independently of type checking:

```bash
# Tests should run even if type check fails
npx jest --testPathPattern="core/logging" --verbose
```

---

## Files to Create/Modify

- [ ] `package.json` - Add test:typecheck script
- [ ] `tsconfig.test.json` - Create only if needed for test file coverage

---

## Expected Outcome

After this step:
- Developers can run `npm run test:typecheck` before committing
- CI pipeline can include type checking step
- Type errors are caught despite SWC's speed optimization
- Test execution speed remains fast (type checking is separate)

---

## Acceptance Criteria

- [ ] `npm run test:typecheck` script added to package.json
- [ ] Script completes successfully on current codebase (exit code 0)
- [ ] Script catches intentional type errors
- [ ] Error messages include file and line information
- [ ] Tests can still run independently of type checking
- [ ] Documentation updated to mention new script

---

## Rollback Plan

If issues arise:

1. **Remove the script:**
   ```bash
   # Edit package.json, remove test:typecheck line
   ```

2. **If tsconfig.test.json was created:**
   ```bash
   rm tsconfig.test.json
   ```

No other changes needed - this step only adds optional tooling.

---

## CI Integration (Optional)

Add type checking to CI pipeline:

```yaml
# Example GitHub Actions step
- name: Type Check
  run: npm run test:typecheck

- name: Run Tests
  run: npm test
```

**Recommendation:** Run type check first - it's faster and catches issues early.

---

## Notes

### Execution Time

Type checking time varies by codebase size:
- Small projects: 5-15 seconds
- Medium projects: 15-45 seconds
- This project (345 test files + source): Estimated 20-40 seconds

### Why --noEmit?

- `--noEmit` performs type checking without writing output files
- Faster than full compilation
- No disk I/O for compiled output
- Clean - doesn't modify project structure

### Alternative: Build-Time Checking

If build process already runs tsc, type errors are caught there. The `test:typecheck` script is for:
- Running tests without full build
- Quick validation during development
- CI optimization (check types before running tests)

---

## Estimated Time

- Script addition: 5 minutes
- Configuration verification: 10 minutes
- Testing and validation: 15 minutes
- Total: 30 minutes

---

_Step 3 of 5 - Jest Testing Optimization_
