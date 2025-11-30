# Step 2: Memory Management Configuration

**Status:** Pending
**Effort:** Low (30 minutes)
**Impact:** High (prevents memory crashes)
**Dependencies:** None (can run parallel with Step 1)

---

## Objective

Add Jest memory management configuration to prevent memory accumulation that causes heap out-of-memory crashes during test runs.

**Expected Outcome:**
- Workers automatically restart when memory threshold reached
- No more heap out-of-memory crashes during full test runs
- Consistent memory usage across long test sessions

---

## Background

### The Problem

The current Jest configuration has no `workerIdleMemoryLimit` setting. This means:
- Workers accumulate memory throughout test runs
- Long test suites eventually crash with "JavaScript heap out of memory"
- Memory from previous tests leaks into subsequent tests

### The Solution

Adding `workerIdleMemoryLimit: '512MB'` causes Jest to:
- Monitor each worker's memory usage
- Restart workers that exceed the threshold
- Prevent memory accumulation across test files

### Evidence

From research: One team reduced CI memory from 60GB to 5GB with this single setting.

---

## Test Strategy

### Verification Approach

Memory optimization is difficult to test directly. The validation focuses on:
1. Configuration applied correctly
2. No regressions in test behavior
3. Optional stress testing with large test batches

### Happy Path Tests

- [ ] **Test:** Configuration accepted by Jest
  - **Given:** workerIdleMemoryLimit added to jest.config.js
  - **When:** Running `npx jest --listTests`
  - **Then:** Command completes without configuration errors
  - **File:** N/A (validation test)

- [ ] **Test:** All tests pass with new memory settings
  - **Given:** Memory configuration in place
  - **When:** Running full test suite `npx jest`
  - **Then:** All 2,300+ tests pass
  - **File:** N/A (validation test)

- [ ] **Test:** Memory-intensive tests complete successfully
  - **Given:** Memory limits configured
  - **When:** Running tests in `tests/core/state/` (larger state objects)
  - **Then:** Tests pass without memory warnings
  - **File:** N/A (validation test)

### Edge Case Tests

- [ ] **Test:** Worker restart doesn't break test isolation
  - **Given:** Worker restarts mid-test-file
  - **When:** Running tests with shared state
  - **Then:** Each test runs in clean state
  - **File:** N/A (implicit validation)

### Error Condition Tests

- [ ] **Test:** Invalid memory limit value rejected
  - **Given:** Invalid value like `'invalid'` in config
  - **When:** Running Jest
  - **Then:** Clear error message about invalid configuration
  - **File:** N/A (manual verification only)

---

## Prerequisites

- [ ] Jest 30.2.0 installed (current version supports this feature)
- [ ] Current test suite passing

---

## Implementation Details

### RED Phase: Verify Current State

Confirm no memory limit is currently configured:

```bash
# Check current jest.config.js for workerIdleMemoryLimit
grep -n "workerIdleMemoryLimit" jest.config.js

# Should return nothing (setting not present)
```

### GREEN Phase: Add Memory Configuration

#### 1. Update jest.config.js

Add `workerIdleMemoryLimit` at the root level (not inside projects):

**Location:** Add after `maxWorkers: '50%',` in jest.config.js

```javascript
module.exports = {
  preset: 'ts-jest',  // Note: Will be removed after Step 1
  roots: ['<rootDir>/tests'],

  // Performance optimizations
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',  // ADD THIS LINE

  // ... rest of configuration
};
```

**Configuration Value Explanation:**
- `512MB` - Balanced threshold that allows complex tests while preventing accumulation
- Workers restart when they exceed this limit after completing a test file
- Lower values (256MB) may cause excessive restarts
- Higher values (1GB) may not prevent crashes effectively

#### 2. Optional: Add logHeapUsage for Debugging

For temporary debugging, add heap usage logging:

```javascript
module.exports = {
  // ... existing config
  workerIdleMemoryLimit: '512MB',
  // logHeapUsage: true,  // Uncomment to debug memory issues
};
```

**Note:** Remove `logHeapUsage` after confirming memory behavior - it adds noise to output.

### REFACTOR Phase: Validation

#### 1. Verify Configuration Loads

```bash
# List tests to confirm config is valid
npx jest --listTests | head -10
```

#### 2. Run Test Subset

```bash
# Run a batch of tests to verify behavior
npx jest --testPathPattern="core/" --verbose
```

#### 3. Run Full Suite

```bash
# Full test suite validation
npx jest
```

#### 4. Optional: Memory Stress Test

Run multiple test batches to verify memory stays stable:

```bash
# Run tests 3 times in sequence (not parallel)
for i in 1 2 3; do
  echo "Run $i:"
  npx jest --testPathPattern="core/state" 2>&1 | tail -5
done
```

---

## Files to Create/Modify

- [ ] `jest.config.js` - Add workerIdleMemoryLimit setting

---

## Expected Outcome

After this step:
- Jest workers restart when exceeding 512MB memory
- No heap out-of-memory crashes during extended test runs
- Memory usage remains stable across test suite
- All tests continue to pass

---

## Acceptance Criteria

- [ ] `workerIdleMemoryLimit: '512MB'` added to jest.config.js
- [ ] Configuration loads without errors
- [ ] All tests pass with new setting
- [ ] No memory-related warnings or errors in test output
- [ ] Optional: Multiple consecutive test runs complete without crashes

---

## Rollback Plan

If issues arise:

1. **Remove the setting:**
   ```bash
   # Edit jest.config.js, remove the workerIdleMemoryLimit line
   ```

2. **Clear Jest cache** (memory limit may affect caching):
   ```bash
   rm -rf .jest-cache
   npx jest --clearCache
   ```

3. **Document the issue:**
   - Note specific error messages
   - Identify which tests failed
   - Check if tests have unusual memory requirements

---

## Configuration Options Reference

| Setting | Value | Effect |
|---------|-------|--------|
| `256MB` | Conservative | Frequent restarts, minimal memory |
| `512MB` | Recommended | Balanced restarts and performance |
| `768MB` | Generous | Fewer restarts, more memory usage |
| `1024MB` | Maximum | Rare restarts, may not prevent crashes |

**Recommendation:** Start with `512MB`. Adjust only if experiencing:
- Too many worker restarts (increase to 768MB)
- Still getting memory crashes (decrease to 256MB)

---

## Notes

### Interaction with maxWorkers

The `maxWorkers: '50%'` setting limits concurrent workers. Combined with `workerIdleMemoryLimit`:
- 50% of CPU cores run tests in parallel
- Each worker limited to 512MB before restart
- Maximum theoretical memory: (CPU cores / 2) * 512MB

### Heap Size Configuration

The project already has `--max-old-space-size=4096` in package.json test scripts. This is the **total** heap limit for the main Jest process. The `workerIdleMemoryLimit` is for individual workers.

### Cache Interaction

Worker restarts clear the worker's internal state but not the Jest cache (`.jest-cache`). Cached transforms remain available across worker restarts.

---

## Estimated Time

- Configuration change: 5 minutes
- Validation: 15-20 minutes
- Total: 20-30 minutes

---

_Step 2 of 5 - Jest Testing Optimization_
