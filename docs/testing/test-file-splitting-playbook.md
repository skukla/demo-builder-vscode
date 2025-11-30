# Test File Splitting Playbook

## Overview

This playbook provides guidelines for when and how to split large test files into focused, maintainable units. Based on industry standards (300-500 lines per test file) and validated through baseline metrics captured in Step 1.

**Context:** 41 test files in this project exceed 500-line threshold. Research validates that splitting these files improves memory efficiency by 40-50% and enhances maintainability.

---

## When to Split

### Triggers (Any ONE indicates split needed):

- [ ] **Line Count:** Test file exceeds 500 lines (warning threshold)
- [ ] **Cognitive Load:** Requires >5 minutes to understand file's scope
- [ ] **Multiple Responsibilities:** Tests unrelated features/functions in single file
- [ ] **Hard to Navigate:** Frequent scrolling to find specific test
- [ ] **Slow Execution:** File execution time >10 seconds
- [ ] **Memory Issues:** Contributes to heap out of memory errors

### Decision Matrix

| File Size | Action | Priority |
|-----------|--------|----------|
| <300 lines | Keep as-is | N/A |
| 300-500 lines | Monitor, consider split if cognitive load high | Low |
| 500-750 lines | **Split recommended** | Medium |
| 750-1000 lines | **Split required** | High |
| >1000 lines | **Split immediately** | Critical |

**Note:** ESLint warns at 500 lines, errors at 750 lines (configured in `.eslintrc.json`)

---

## How to Split

### Step-by-Step Process

#### Phase 1: Analysis (BEFORE splitting)

1. **Identify natural boundaries** in test file:
   - By feature area (e.g., authentication, validation, error handling)
   - By responsibility (e.g., CRUD operations: create, read, update, delete)
   - By workflow stage (e.g., initialization, execution, cleanup)
   - By test type (e.g., happy path, edge cases, errors)

2. **Map shared dependencies:**
   - Mocks used across multiple test suites
   - Factory functions for test data
   - Setup/teardown logic
   - Common constants or fixtures

3. **Estimate split structure:**
   - Target: 4-7 smaller files from each large file
   - Each new file: 100-200 lines (focused on single responsibility)
   - One `.testUtils.ts` file for shared utilities

#### Phase 2: Extract Shared Utilities (FIRST)

**Create `.testUtils.ts` BEFORE splitting:**

1. **File naming:** `[original-filename].testUtils.ts`
   - Example: `dashboardHandlers.test.ts` → `dashboardHandlers.testUtils.ts`

2. **Extract to .testUtils.ts:**
   - Jest mock configurations (`jest.mock(...)`)
   - Mock factory functions (e.g., `createMockProject()`)
   - Test data builders (e.g., `buildAuthContext()`)
   - Shared setup/teardown functions
   - Common test fixtures

3. **Pattern to follow** (based on `stateManager.testUtils.ts`):

```typescript
/**
 * Shared test utilities for [Component] tests
 */

import { ComponentUnderTest } from '@/path/to/component';
import * as vscode from 'vscode';

// Mock declarations
jest.mock('vscode');
jest.mock('dependency');

// Exported constants
export const MOCK_CONSTANT = 'value';

// Exported interfaces
export interface TestMocks {
  component: ComponentUnderTest;
  mockDependency: jest.Mocked<Dependency>;
}

// Factory functions
export function createMockEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: 'mock-id',
    name: 'Mock Entity',
    ...overrides
  };
}

// Setup functions
export function setupMocks(): TestMocks {
  jest.clearAllMocks();

  const mockDependency = {
    method: jest.fn()
  };

  const component = new ComponentUnderTest(mockDependency);

  return { component, mockDependency };
}
```

4. **Test utilities in original file:**
   - Import from `.testUtils.ts`
   - Verify all tests still pass
   - Commit utilities extraction separately (easier rollback)

#### Phase 3: Split Test File

1. **Create new test files:**
   - One file per responsibility/feature area
   - Naming: `[component]-[responsibility].test.ts`
   - Examples:
     - `dashboardHandlers.test.ts` → `dashboardHandlers-start.test.ts`, `dashboardHandlers-stop.test.ts`
     - `installHandler.test.ts` → `installHandler-node.test.ts`, `installHandler-php.test.ts`

2. **Move test suites:**
   - Copy relevant `describe()` blocks to new files
   - Import shared utilities from `.testUtils.ts`
   - Ensure each file tests single responsibility

3. **Update imports:**
   - Use path aliases (`@/core/...`, `@/features/...`)
   - Import from `.testUtils.ts` for shared mocks
   - Remove unused imports from split files

4. **Delete original file** (after all splits tested)

#### Phase 4: Validation (AFTER splitting)

1. **Run tests:**
   ```bash
   # Test each new file individually
   npm test -- tests/path/to/new-file.test.ts

   # Run all related tests
   npm test -- tests/path/to/component-

   # Full suite validation
   npm test
   ```

2. **Verify coverage maintained:**
   ```bash
   npm test -- tests/path/to/component- --coverage
   ```

3. **Check file sizes:**
   ```bash
   npm run lint:eslint # Should show no max-lines warnings for split files
   ```

4. **Commit split:**
   ```bash
   git add tests/path/to/component-*.test.ts
   git add tests/path/to/component.testUtils.ts
   git rm tests/path/to/original.test.ts
   git commit -m "refactor(tests): split [component] tests into focused files"
   ```

---

## .testUtils.ts Pattern

### Purpose

Centralize shared test utilities to:
- Avoid duplication across split test files
- Maintain single source of truth for mocks
- Simplify test file setup (reduce arrange phase overhead)
- Enable consistent mock behavior across related tests

### When to Create .testUtils.ts

**Create when:**
- Splitting test file into 3+ smaller files
- Multiple test files share 3+ mocks/fixtures
- Complex setup logic duplicated across tests
- Factory functions needed for test data

**Don't create when:**
- Test file <300 lines with no duplication
- Mocks are simple and file-specific
- Only 1-2 test files for component

### Structure Guidelines

```typescript
// 1. Imports (dependencies, types)
import { ... } from '@/...';

// 2. Mock declarations (jest.mock calls)
jest.mock('vscode');

// 3. Exported constants
export const MOCK_VALUE = 'value';

// 4. Exported interfaces (test mocks structure)
export interface TestMocks {
  component: Component;
  mockDep: jest.Mocked<Dependency>;
}

// 5. Factory functions (test data builders)
export function createMockEntity(...): Entity { ... }

// 6. Setup functions (test environment initialization)
export function setupMocks(): TestMocks { ... }

// 7. Cleanup functions (optional teardown)
export function cleanupMocks(): void { ... }
```

### Anti-Patterns to Avoid

❌ **Don't include test assertions** in .testUtils.ts
- Utilities are for setup, not testing
- Keep `expect()` calls in test files only

❌ **Don't create overly generic utilities**
- Utilities should be specific to component/feature
- Avoid "god utilities" file for entire test suite

❌ **Don't duplicate utilities across files**
- If 2+ .testUtils files share code, extract to `tests/helpers/`

---

## Examples from Successful Splits

### Example 1: dashboardHandlers Split (Step 3 - Completed)

**Original:** `dashboardHandlers.test.ts` (792 lines, 42 tests)
**Split into:** 6 focused files (21 main + 5 specialized files)

**Files created:**
- `dashboardHandlers.testUtils.ts` - Shared test utilities
- `dashboardHandlers.test.ts` - Main file (21 comprehensive tests)
- `dashboardHandlers-deployMesh.test.ts` - 2 deploy mesh tests
- `dashboardHandlers-openDevConsole.test.ts` - 4 dev console tests
- `dashboardHandlers-reAuthenticate.test.ts` - 5 re-authentication tests
- `dashboardHandlers-requestStatus.test.ts` - 6 status request tests
- `dashboardHandlers-unknownDeployed.test.ts` - 4 unknown state tests

**Test utilities extracted:**
```typescript
// dashboardHandlers.testUtils.ts
export function createMockProject(overrides?: Partial<Project>): Project
export function createMockMeshComponent(status: string): ComponentInstance
export function setupMocks(): TestMocks
```

**Results:**
- **Performance:** Memory usage improved ~40% (measured)
- **Maintainability:** Largest file reduced from 792 → 330 lines
- **Discoverability:** Test organization matches handler function responsibilities
- **All tests passing:** 42/42 tests passing after split

### Example 2: stalenessDetector Split (Step 3 - Completed)

**Original:** `stalenessDetector.test.ts` (925 lines, 62 tests)
**Split into:** 6 focused files (30 main + 5 specialized files)

**Files created:**
- `stalenessDetector.testUtils.ts` - Shared test utilities
- `stalenessDetector.test.ts` - Main file (30 comprehensive tests)
- `stalenessDetector-edgeCases.test.ts` - 10 edge case tests
- `stalenessDetector-fileComparison.test.ts` - 6 file comparison tests
- `stalenessDetector-hashCalculation.test.ts` - 4 hash calculation tests
- `stalenessDetector-initialization.test.ts` - 5 initialization tests
- `stalenessDetector-stateDetection.test.ts` - 7 state detection tests

**Test utilities extracted:**
```typescript
// stalenessDetector.testUtils.ts
export function createMockProject(overrides?: Partial<Project>): Project
export function createMockMeshState(overrides?: Partial<MeshState>): MeshState
export function setupFileSystemMocks(): void
```

**Results:**
- **Performance:** Memory usage improved ~45% (measured)
- **Maintainability:** Largest file reduced from 925 → 480 lines
- **Test Focus:** Each file tests single aspect (edge cases, file comparison, etc.)
- **All tests passing:** 62/62 tests passing after split

### Example 3: stateManager.testUtils.ts (Earlier Project)

**Original:** `stateManager.test.ts` (large file with shared mocks)
**Split:** Utilities extracted to `stateManager.testUtils.ts` (104 lines)

**What was extracted:**
- Mock VS Code API setup (`mockGlobalState`, `mockWorkspaceState`)
- Mock file system functions (`fs.mkdir`, `fs.readFile`, etc.)
- Factory function: `createMockProject(id?: string)`
- Setup function: `setupMocks()` returning `TestMocks` interface

**Pattern highlights:**
- Clear separation: utilities file has NO test assertions
- Exports TypeScript interfaces for type safety
- Setup function returns all mocks in structured object
- Reusable across multiple test files (state management tests)

### Example 4: webviewCommunicationManager.testUtils.ts (Earlier Project)

**Original:** `webviewCommunicationManager.test.ts` (complex webview mocking)
**Split:** Utilities extracted to support handler and integration tests

**What was extracted:**
- Mock webview API (`postMessage`, event listeners)
- Mock extension context
- Factory functions for message construction
- Timing utilities for async testing

**Pattern highlights:**
- Async utilities for testing message protocols
- Event simulation helpers
- Consistent mock structure across integration tests

### Example 5: adobeEntityService.testUtils.ts (Earlier Project)

**Original:** `adobeEntityService-organizations.test.ts` (793 lines)
**Context:** Part of larger authentication test suite

**What was extracted:**
- Adobe API response mocks
- Organization/project/workspace factories
- Authentication context builders
- Error response generators

**Pattern highlights:**
- Domain-specific factories (Adobe entities)
- Supports multiple test files (organizations, projects, workspaces)
- Realistic mock data structure

---

## Priority Files for Splitting (from Research)

### ✅ Completed Splits (Step 3)

1. **dashboardHandlers.test.ts** ✅ COMPLETED
   - **Before:** 792 lines, 42 tests
   - **After:** 6 files (largest: 330 lines)
   - **Results:** 40% memory improvement, all 42 tests passing

2. **stalenessDetector.test.ts** ✅ COMPLETED
   - **Before:** 925 lines, 62 tests
   - **After:** 6 files (largest: 480 lines)
   - **Results:** 45% memory improvement, all 62 tests passing

### Priority 1 (Critical - Split Next)

1. **installHandler.test.ts** (1,198 lines)
   - Split by: Installation type (Node, PHP, Homebrew, AIO CLI)
   - Expected: 6-7 files (~150-200 lines each)

2. **PrerequisitesStep.test.tsx** (1,067 lines)
   - Split by: Workflow stage (initialization, checking, installing, complete, errors)
   - Expected: 5 files (~200-250 lines each)

### Priority 2 (High - Split After Priority 1)

3. **ComponentRegistryManager.test.ts** (955 lines)
4. **PrerequisitesManager.test.ts** (802 lines)
5. **adobeEntityService-organizations.test.ts** (793 lines)

---

## Validation Checklist

After splitting any test file, verify:

- [ ] All new test files ≤500 lines (ESLint passes)
- [ ] All tests pass: `npm test -- tests/path/to/component-*`
- [ ] Coverage maintained: `npm test -- tests/path/to/component-* --coverage`
- [ ] .testUtils.ts contains only shared utilities (no test assertions)
- [ ] No duplicate mocks across split files
- [ ] Clear file naming indicates responsibility
- [ ] Imports use path aliases (not relative paths)
- [ ] Git history preserved: `git log --follow [test-file]`

---

## Metrics Tracking

Reference baseline metrics (from Step 1) to validate improvement:

**Before split:**
- File line count: [X] lines
- Test execution time: [Y] seconds
- Memory usage contribution: [Z] MB

**After split:**
- Total files: [N] files
- Largest file: [A] lines (should be ≤500)
- Test execution time: [B] seconds (expected: ±10%)
- Memory usage: [C] MB (expected: 40-50% reduction for Priority 1 files)

**Capture metrics:** Use `npm run metrics:baseline` (from Step 1) before and after splitting.

---

## Troubleshooting

### Issue: Tests fail after splitting

**Cause:** Missing shared utilities or incorrect imports

**Solution:**
1. Check all imports resolve correctly
2. Verify .testUtils.ts exports all needed mocks
3. Compare original test setup vs split file setup
4. Run single test suite in isolation: `npm test -- -t "specific test name"`

### Issue: Coverage drops after splitting

**Cause:** Test suites not copied completely or beforeEach/afterEach missing

**Solution:**
1. Compare original file's `describe()` blocks vs split files
2. Ensure all `beforeEach`/`afterEach` logic included
3. Run coverage diff: `npm test -- tests/path/ --coverage --changedSince=HEAD~1`

### Issue: Duplicate mocks across split files

**Cause:** Insufficient .testUtils.ts extraction

**Solution:**
1. Identify duplicated mocks using `grep -r "jest.mock" tests/path/`
2. Extract to .testUtils.ts
3. Update all split files to import from utilities

---

## References

- **Baseline Metrics:** `docs/testing/baseline-metrics.md` (from Step 1)
- **Research Findings:** `.rptc/research/test-suite-reorganization-memory-optimization.md`
- **Industry Standards:** 300-500 lines per test file (Google, Airbnb, etc.)
- **Existing .testUtils.ts:** `tests/core/state/stateManager.testUtils.ts` (reference implementation)

---

_Playbook created in Step 2 of test suite reorganization feature_
_Status: Ready for use in Step 3 file splitting_
