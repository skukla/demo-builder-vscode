# Step 1: SWC Integration

**Status:** Pending
**Effort:** Low (1-2 hours)
**Impact:** High (30-75% faster test execution)
**Dependencies:** None

---

## Objective

Replace ts-jest with @swc/jest as the TypeScript transformer for Jest tests. SWC is a Rust-based compiler that provides 30-75% faster transformation compared to ts-jest.

**Expected Outcome:**
- All 2,300+ tests pass with SWC transformer
- Test execution time reduced by 30-75%
- No changes required to test code

---

## Test Strategy

### Verification Approach

Since this is a configuration change with zero code changes, the test strategy focuses on validation:

1. **Baseline Capture:** Record current test execution time before changes
2. **Incremental Validation:** Test SWC on small subset first
3. **Full Suite Validation:** Run complete test suite
4. **Performance Comparison:** Compare before/after execution times

### Happy Path Tests

- [ ] **Test:** Node project tests pass with SWC
  - **Given:** SWC configured for node test project
  - **When:** Running `npx jest --selectProjects node --testPathPattern="core/logging"`
  - **Then:** All tests pass without errors
  - **File:** N/A (validation test)

- [ ] **Test:** React project tests pass with SWC
  - **Given:** SWC configured for react test project with JSX support
  - **When:** Running `npx jest --selectProjects react --testPathPattern="webview-ui"`
  - **Then:** All tests pass without errors
  - **File:** N/A (validation test)

- [ ] **Test:** Full test suite passes
  - **Given:** Complete SWC configuration in jest.config.js
  - **When:** Running `npx jest`
  - **Then:** All 2,300+ tests pass
  - **File:** N/A (validation test)

### Edge Case Tests

- [ ] **Test:** Tests with complex TypeScript features work
  - **Given:** Tests using generics, decorators, or advanced TS features
  - **When:** Running tests in `tests/core/shell/` (heavy TypeScript usage)
  - **Then:** All tests pass with correct type behavior
  - **File:** N/A (validation test)

- [ ] **Test:** Path aliases resolve correctly
  - **Given:** Tests importing via `@/core/`, `@/features/`, etc.
  - **When:** Running any test with path aliases
  - **Then:** Imports resolve without errors
  - **File:** N/A (validation test)

### Error Condition Tests

- [ ] **Test:** Clear error on invalid TypeScript
  - **Given:** Intentionally malformed TypeScript (for manual verification)
  - **When:** Running test with syntax error
  - **Then:** SWC provides readable error message with file/line info
  - **File:** N/A (manual verification)

---

## Prerequisites

- [ ] Node.js 18+ installed
- [ ] Current test suite passing (baseline verified)
- [ ] Baseline test execution time recorded

---

## Implementation Details

### RED Phase: Capture Baseline

Before making changes, capture current state:

```bash
# Capture baseline execution time
time npx jest --passWithNoTests 2>&1 | head -20

# Record in notes for comparison
echo "Baseline: [X minutes Y seconds]"
```

### GREEN Phase: Install and Configure SWC

#### 1. Install Dependencies

```bash
npm install --save-dev @swc/core @swc/jest
```

**Expected package versions:**
- @swc/core: ^1.3.0
- @swc/jest: ^0.2.0

#### 2. Create .swcrc Configuration

Create `.swcrc` at project root:

```json
{
  "$schema": "https://swc.rs/schema.json",
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "tsx": true,
      "decorators": true,
      "dynamicImport": true
    },
    "transform": {
      "react": {
        "runtime": "automatic"
      }
    },
    "target": "es2021",
    "loose": false,
    "externalHelpers": false,
    "keepClassNames": true
  },
  "module": {
    "type": "commonjs",
    "strict": false,
    "strictMode": true,
    "lazy": false,
    "noInterop": false
  },
  "sourceMaps": true
}
```

**Configuration Notes:**
- `tsx: true` - Enables JSX/TSX parsing for React tests
- `decorators: true` - Supports TypeScript decorators if used
- `target: es2021` - Matches project's Node.js 18+ target
- `keepClassNames: true` - Preserves class names for better stack traces
- `sourceMaps: true` - Enables source maps for debugging

#### 3. Update jest.config.js

Replace ts-jest transforms with @swc/jest:

**Before (current):**
```javascript
// Node project
transform: {
  '^.+\\.ts$': ['ts-jest', {
    tsconfig: {
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  }],
},

// React project
transform: {
  '^.+\\.(ts|tsx)$': ['ts-jest', {
    tsconfig: {
      jsx: 'react',
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      types: ['@testing-library/jest-dom', 'jest', 'node'],
    },
  }],
},
```

**After (new):**
```javascript
// Node project
transform: {
  '^.+\\.ts$': ['@swc/jest', {
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: false,
        decorators: true,
      },
      transform: null,
      target: 'es2021',
    },
    module: {
      type: 'commonjs',
    },
    sourceMaps: true,
  }],
},

// React project
transform: {
  '^.+\\.(ts|tsx)$': ['@swc/jest', {
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: true,
        decorators: true,
      },
      transform: {
        react: {
          runtime: 'automatic',
        },
      },
      target: 'es2021',
    },
    module: {
      type: 'commonjs',
    },
    sourceMaps: true,
  }],
},
```

### REFACTOR Phase: Validation and Cleanup

#### 1. Incremental Validation

Test SWC on a small subset first:

```bash
# Test core/logging (uses TypeScript features)
npx jest --testPathPattern="core/logging" --verbose

# Test shell (complex TS with generics)
npx jest --testPathPattern="core/shell" --verbose

# Test React components
npx jest --selectProjects react --testPathPattern="NavigationPanel" --verbose
```

#### 2. Full Suite Validation

```bash
# Run complete test suite
npx jest

# Verify all tests pass (expected: 2,300+ tests)
```

#### 3. Performance Comparison

```bash
# Capture new execution time
time npx jest --passWithNoTests 2>&1 | head -20

# Calculate improvement
# Expected: 30-75% reduction from baseline
```

---

## Files to Create/Modify

- [ ] `.swcrc` - Create SWC configuration file
- [ ] `jest.config.js` - Update transform configuration for both projects
- [ ] `package.json` - Add @swc/core and @swc/jest to devDependencies

---

## Expected Outcome

After this step:
- All 345 test files transform successfully with SWC
- All 2,300+ tests pass
- Test execution time reduced by 30-75%
- No changes to test code required
- ts-jest remains in package.json as fallback (do not remove)

---

## Acceptance Criteria

- [ ] @swc/core and @swc/jest installed in devDependencies
- [ ] .swcrc configuration file created
- [ ] jest.config.js updated with @swc/jest transforms
- [ ] All Node project tests pass (269 files)
- [ ] All React project tests pass (76 files)
- [ ] Execution time improved by at least 30%
- [ ] No console warnings about transformation errors
- [ ] Path aliases (@/core/, @/features/, etc.) resolve correctly

---

## Rollback Plan

If issues arise:

1. **Revert jest.config.js** to use ts-jest:
   ```bash
   git checkout -- jest.config.js
   ```

2. **Remove .swcrc** (not needed for ts-jest):
   ```bash
   rm .swcrc
   ```

3. **Keep SWC packages** for future retry:
   - Do not uninstall @swc/core or @swc/jest
   - Document specific failure patterns for investigation

---

## Notes

### Why SWC Over Vitest?

Research showed Vitest has performance regressions in CI (2-3x slower in some cases). SWC provides the speed benefits while keeping Jest's ecosystem and patterns.

### Type Checking

SWC does not perform type checking during transformation. This is intentional for speed. Type safety is restored in Step 3 with a separate `tsc --noEmit` check.

### Reference Implementation

Microsoft's accessibility-insights-web achieved 75% improvement with this exact approach:
https://github.com/microsoft/accessibility-insights-web/pull/4336

---

## Estimated Time

- Installation: 5 minutes
- Configuration: 15 minutes
- Validation: 30-60 minutes
- Total: 1-1.5 hours

---

_Step 1 of 5 - Jest Testing Optimization_
