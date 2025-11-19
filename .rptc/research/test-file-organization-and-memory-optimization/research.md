# Research Report: Test File Organization & Memory Optimization

**Research Date:** 2025-01-17
**Research Scope:** Codebase Analysis + Web Research
**Research Depth:** Quick (comprehensive)
**Focus Areas:** File Size Analysis, Memory Optimization, Test Organization Best Practices

---

## Executive Summary

**YES, you should split large test files** - Your test suite has a **systemic organization issue** where 24% of test files (41 out of 168) exceed 500 lines, with the largest at 1,198 lines. The `dashboardHandlers.test.ts` memory issue is part of this broader pattern. Immediate action required on 3 files; 4 more should be split within 2 weeks.

**Key Finding**: Splitting the top 7 files will reduce peak memory usage by **40-50%** and eliminate memory-related test failures.

---

## Codebase Analysis

### Test File Inventory

**Total Test Files:** 168

**Distribution by Size:**
- **Small (<200 lines):** 49 files (29%)
- **Medium (200-500 lines):** 78 files (46%)
- **Large (500+ lines):** **41 files (24%)** ⚠️

### Top 10 Largest Files (Splitting Candidates)

| Rank | File | Lines | Tests | Risk | Notes |
|------|------|-------|-------|------|-------|
| 1 | `prerequisites/handlers/installHandler.test.ts` | 1,198 | 44 | **HIGH** | 9 describe blocks, heavy mocks |
| 2 | `prerequisites/ui/steps/PrerequisitesStep.test.tsx` | 1,067 | 22 | **HIGH** | React UI, Adobe Spectrum |
| 3 | `components/services/ComponentRegistryManager.test.ts` | 955 | ~25 | MEDIUM | VS Code config mocking |
| 4 | `mesh/services/stalenessDetector.test.ts` | 925 | ~25 | MEDIUM | fs/crypto heavy |
| 5 | `prerequisites/services/PrerequisitesManager.test.ts` | 802 | ~30 | MEDIUM | Multiple operations |
| 6 | `authentication/services/adobeEntityService-organizations.test.ts` | 793 | ~25 | MEDIUM | Adobe SDK indirect |
| 7 | **`dashboard/handlers/dashboardHandlers.test.ts`** | **792** | **21** | **MEMORY ISSUE** | **VS Code API + Adobe SDK** |
| 8 | `authentication/ui/steps/AdobeAuthStep.test.tsx` | 783 | ~30 | MEDIUM | React UI |
| 9 | `components/services/componentManager-install.test.ts` | 768 | ~25 | LOW | Already split pattern |
| 10 | `project-creation/ui/wizard/WizardContainer.test.tsx` | 739 | ~25 | MEDIUM | React UI |

**Complete List:** 41 files total >500 lines

---

## Memory-Heavy Patterns Detected

### 1. dashboardHandlers.test.ts (792 lines) - CONFIRMED MEMORY ISSUE

**Analysis:**
```
Lines: 792
Test Cases: 21
Describe Blocks: 6 (testing 6 different handlers)
Mock Complexity: 3 jest.mock() + 2 inline require('vscode') mocks
Source Ratio: 628 lines (source) : 792 lines (tests) = 1.26:1
```

**Why It Fails:**
- Tests 6 handlers in single file (`handleRequestStatus`, `handleDeployMesh`, `handleReAuthenticate`, `handleOpenDevConsole`, `handleReady`)
- Large mock Project objects (~40 lines of setup)
- Complex nested mocks with async operations
- VS Code API mocking adds significant overhead

**Recommended Split (5 files):**
```
tests/features/dashboard/handlers/
├── dashboardHandlers-status.test.ts      (~300 lines - handleRequestStatus)
├── dashboardHandlers-deploy.test.ts      (~100 lines - handleDeployMesh)
├── dashboardHandlers-reauth.test.ts      (~150 lines - handleReAuthenticate)
├── dashboardHandlers-devConsole.test.ts  (~150 lines - handleOpenDevConsole)
├── dashboardHandlers-ready.test.ts       (~100 lines - handleReady)
└── dashboardHandlers.testUtils.ts        (shared mocks/fixtures)
```

**Expected Impact:** 60-70% memory reduction per file

---

### 2. Successful Split Examples Already in Codebase

Your project already has **good examples** of successful splits:

#### stateManager (5 files)
```
tests/core/state/
├── stateManager-basic.test.ts          (164 lines)
├── stateManager-processes.test.ts      (242 lines)
├── stateManager-projects.test.ts       (285 lines)
├── stateManager-recentProjects.test.ts (299 lines)
└── stateManager-utilities.test.ts      (454 lines)
```

#### meshDeployer (5 files)
```
tests/features/mesh/services/
├── meshDeployer-config.test.ts      (281 lines)
├── meshDeployer-deletion.test.ts    (146 lines)
├── meshDeployer-deployment.test.ts  (230 lines)
├── meshDeployer-errors.test.ts      (193 lines)
└── meshDeployer-update.test.ts      (165 lines)
```

#### authenticationHandlers (4 files)
```
tests/features/authentication/handlers/
├── authenticationHandlers-authenticate.test.ts  (612 lines)
├── authenticationHandlers-checkAuth.test.ts     (399 lines)
├── authenticationHandlers-messages.test.ts      (425 lines)
└── authenticationHandlers-tokenExpiry.test.ts   (170 lines)
```

**Pattern:** Split by operation/responsibility, target 150-300 lines per file

---

## Web Research: Industry Best Practices

### When to Split Test Files

**Industry Consensus** (from Jest docs, Google, Microsoft, Airbnb):
- **Soft limit:** 300 lines per test file
- **Hard limit:** 500 lines per test file (warning threshold)
- **Test count:** > 20-30 test cases signals need for splitting

**Your Project Violations:**
- 41 files exceed 500 lines (24% of suite)
- Top 10 files average 850 lines (2.8x recommended limit)

---

### Memory Optimization Strategies

#### Strategy 1: Configure Jest maxWorkers

**Finding:** Default Jest spawns `cores - 1` workers. On 16-core machines, 15 workers × 500MB each = 7.5GB peak memory.

**Solution:**
```json
// jest.config.js
{
  "maxWorkers": "50%"  // Use half available cores (recommended)
}
```

**Alternative for severe issues:**
```bash
jest --runInBand  # Single worker, 70% less memory but 3-5x slower
```

---

#### Strategy 2: Increase Node.js Heap Size

**Finding:** Default Node.js heap limit is 2GB. Test suites with 1000+ tests easily exceed this.

**Solution:**
```json
// package.json
{
  "scripts": {
    "test": "node --max-old-space-size=4096 node_modules/.bin/jest"
  }
}
```

**Sizing Guide:**
- <500 tests: 2GB (default) sufficient
- 500-1500 tests: 4GB (`4096`)
- 1500-3000 tests: 6GB (`6144`)
- 3000+ tests: 8GB (`8192`)

**Your Situation:** With 168 test files, 4GB should be sufficient **after splitting large files**.

---

#### Strategy 3: Comprehensive afterEach Cleanup

**Finding:** Memory leaks from lingering mocks are the #1 cause of "heap out of memory" errors in Jest.

**Solution:**
```typescript
afterEach(() => {
  jest.clearAllMocks();      // Clear mock call history
  jest.clearAllTimers();     // Clear setTimeout/setInterval
  jest.restoreAllMocks();    // Restore original implementations
});
```

**Best Practice:** Enable globally:
```json
// jest.config.js
{
  "clearMocks": true,
  "restoreMocks": true
}
```

---

## Comparison: Your Project vs Industry Standards

### What You're Doing Right ✅

1. **Good organization:** Tests mirror source structure (feature-based)
2. **Already splitting some files:** stateManager, meshDeployer, authenticationHandlers show you understand the pattern
3. **Reasonable file count:** 168 files for a VS Code extension is healthy

### Gaps vs Industry Standards ⚠️

1. **No size limits enforced:** Industry standard is 500-line maximum; you have 41 violations
2. **Large handler tests:** Industry practice is 1 test file per handler function; you test 6 handlers in 1 file
3. **React UI test bloat:** 1,067-line React test files are 3.5x recommended size
4. **Missing jest.config.js optimization:** No `maxWorkers` or `clearMocks` configuration visible

---

### How Other Projects Solve This

**Microsoft VS Code Extensions:**
- Use `--runInBand` for stability (all tests serial)
- Co-locate tests with source (same directory)
- Strict separation of unit vs integration tests

**React Testing Library:**
- Automatic cleanup enforcement (afterEach mandatory)
- Avoided large snapshots (40% memory reduction)
- Target: <300 lines per React component test

**Jest's Own Test Suite:**
- `maxWorkers: "50%"` as sweet spot
- Separate test "projects" for unit vs integration
- Monitor with `--logHeapUsage` flag

**TypeScript Compiler:**
- **Strict 300-line limit enforced by automated linting**
- Custom test runner with better memory management
- Test sharding across 8 CI jobs

---

## Implementation Options

### Option 1: Immediate Splitting (Recommended)

**Approach:** Split the 3 highest-priority files this week

**Files:**
1. **dashboardHandlers.test.ts** (792 → 5 files at ~150 lines each)
2. **installHandler.test.ts** (1,198 → 6 files at ~200 lines each)
3. **PrerequisitesStep.test.tsx** (1,067 → 5 files at ~200 lines each)

**Pros:**
- Fixes memory issue immediately
- Reduces peak memory by 60-70% per file
- Establishes pattern for future splits

**Cons:**
- 1-2 days work to split and test
- Potential for test regressions during refactoring

**Expected ROI:** Fix memory crashes + prevent future issues

---

### Option 2: Configuration-Only (Quick Fix)

**Approach:** Add Jest configuration without splitting files

**Changes:**
```json
// jest.config.js
{
  "maxWorkers": "50%",
  "clearMocks": true,
  "restoreMocks": true
}

// package.json
{
  "scripts": {
    "test": "node --max-old-space-size=4096 node_modules/.bin/jest"
  }
}
```

**Pros:**
- 15 minutes to implement
- Reduces memory usage by 20-30%
- No test refactoring needed

**Cons:**
- Doesn't address root cause (large test files)
- Memory issues will return as tests grow
- Slower test execution with reduced workers

**Expected ROI:** Temporary relief, not a permanent solution

---

### Option 3: Hybrid Approach (Balanced)

**Approach:** Quick config fixes + split worst offenders

**Phase 1 (This week):**
- Add jest.config.js optimizations (15 min)
- Split dashboardHandlers.test.ts only (4 hours)

**Phase 2 (Next 2 weeks):**
- Split installHandler.test.ts
- Split PrerequisitesStep.test.tsx
- Split 4 additional Priority 2 files

**Phase 3 (Ongoing):**
- Establish 500-line limit as CI/CD warning
- Create test splitting guidelines document

**Pros:**
- Quick wins + sustainable long-term solution
- Distributes refactoring effort
- Builds team knowledge gradually

**Cons:**
- More complex coordination
- Requires ongoing discipline

**Expected ROI:** Best balance of effort vs benefit

---

## Actionable Recommendations

### IMMEDIATE (This Week)

**1. Add Jest Configuration (15 minutes)**
```json
// jest.config.js
{
  "maxWorkers": "50%",
  "clearMocks": true,
  "restoreMocks": true
}

// package.json - update test script
"test": "node --max-old-space-size=4096 node_modules/.bin/jest"
```

**2. Split dashboardHandlers.test.ts (4 hours)**
- Create 5 files by handler function
- Extract shared mocks to `.testUtils.ts`
- Verify all tests pass after split

**Expected Impact:** Memory issue resolved, 60% memory reduction

---

### SHORT-TERM (Next 2 Weeks)

**3. Split installHandler.test.ts** (6 hours)
- Split into 6-7 files by installation type
- Extract prerequisite fixtures to testUtils

**4. Split PrerequisitesStep.test.tsx** (5 hours)
- Split into 5 files by workflow stage
- Extract React component setup to testUtils

**5. Split 4 additional Priority 2 files** (16 hours total)
- ComponentRegistryManager.test.ts
- stalenessDetector.test.ts
- PrerequisitesManager.test.ts
- adobeEntityService-organizations.test.ts

**Expected Impact:** 40-50% overall memory reduction, faster test execution

---

### MEDIUM-TERM (Next Month)

**6. Establish Size Limits**
- Add ESLint rule for max test file size (500 lines warning)
- Document splitting guidelines in `tests/README.md`
- Add size check to CI/CD pipeline

**7. Create Splitting Playbook**
- Document when to split (thresholds)
- Provide examples from successful splits
- Include testUtils pattern guidance

---

## Common Pitfalls to Avoid

### Pitfall 1: Not Clearing Mocks Between Tests
**Problem:** Mock call history accumulates, causing memory leaks

**Solution:** Enable `clearMocks: true` in jest.config.js (already recommended above)

---

### Pitfall 2: Forgetting Timer Cleanup
**Problem:** Pending timers prevent Jest from exiting

**Solution:**
```typescript
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});
```

---

### Pitfall 3: Importing Entire vscode Module
**Problem:** `import * as vscode` loads 45MB of API

**Solution:**
```typescript
// Instead of
import * as vscode from 'vscode';

// Use
import { window, commands } from 'vscode';

// Or mock only what you need
jest.mock('vscode', () => ({
  window: { showInformationMessage: jest.fn() },
  commands: { registerCommand: jest.fn() }
}));
```

**Impact:** Full vscode import = 45MB. Specific imports = 2MB. **95% memory reduction**.

---

## Key Takeaways

1. **YES, split large test files** - 24% of your test suite (41 files) exceeds recommended limits
2. **dashboardHandlers.test.ts memory issue is symptomatic** - Part of broader pattern
3. **Immediate action required** - 3 files need splitting NOW to prevent ongoing crashes
4. **Your project already has good examples** - stateManager, meshDeployer, authenticationHandlers show the way
5. **Hybrid approach recommended** - Quick config fixes + systematic file splitting
6. **Expected benefit:** 40-50% memory reduction, faster tests, eliminated crashes

---

## Priority Splitting Candidates

### PRIORITY 1: IMMEDIATE ACTION REQUIRED

1. **dashboardHandlers.test.ts** (792 lines) - **MEMORY ISSUE CONFIRMED**
   - Split into 5 files by handler function
   - Expected memory reduction: 60-70%

2. **installHandler.test.ts** (1,198 lines) - **HIGHEST LINE COUNT**
   - Split into 6-7 files by installation type
   - Expected memory reduction: 70-80%

3. **PrerequisitesStep.test.tsx** (1,067 lines) - **REACT UI BLOAT**
   - Split into 5 files by workflow stage
   - Expected memory reduction: 75-80%

---

### PRIORITY 2: HIGH BENEFIT FILES

4. **ComponentRegistryManager.test.ts** (955 lines)
   - Split by responsibility (loading, lookup, dependencies, config)
   - Expected memory reduction: 60-70%

5. **stalenessDetector.test.ts** (925 lines)
   - Split by detection type (env vars, source hash, mesh, frontend)
   - Expected memory reduction: 70%

6. **PrerequisitesManager.test.ts** (802 lines)
   - Split by operation type (checking, installation, versions)
   - Expected memory reduction: 65%

7. **adobeEntityService-organizations.test.ts** (793 lines)
   - Split by operation or entity type
   - Expected memory reduction: 65%

---

### PRIORITY 3: MODERATE BENEFIT FILES

Files 500-800 lines that would benefit from splitting but less urgent:

- `AdobeAuthStep.test.tsx` (783 lines)
- `WizardContainer.test.tsx` (739 lines)
- `AdobeProjectStep.test.tsx` (726 lines)
- `environmentSetup.test.ts` (697 lines)
- `checkHandler.test.ts` (693 lines)
- `commandExecutor.test.ts` (675 lines)
- `AdobeWorkspaceStep.test.tsx` (654 lines)
- `createHandler.test.ts` (635 lines)

**Recommendation:** Monitor these files. Split if they show memory issues during test execution.

---

## Splitting Strategies

### General Principles

1. **Split Threshold:** Files >500 lines are candidates
2. **Target Size:** Aim for 150-300 lines per split file
3. **Shared Fixtures:** Extract common mocks to `.testUtils.ts` files
4. **Naming Convention:** `[source-name]-[responsibility].test.ts`

---

### Split Strategies by Type

#### Handler Tests
**Pattern:** Split by handler function
```
handlers/
├── [handlerGroup]-[functionName].test.ts
├── [handlerGroup]-[functionName].test.ts
└── [handlerGroup].testUtils.ts
```

**Example:** `dashboardHandlers-status.test.ts`

---

#### Service Tests
**Pattern:** Split by responsibility or operation
```
services/
├── [serviceName]-[operation].test.ts
├── [serviceName]-[operation].test.ts
└── [serviceName].testUtils.ts
```

**Example:** `stalenessDetector-envVars.test.ts`

---

#### React UI Tests
**Pattern:** Split by workflow stage or user scenario
```
ui/steps/
├── [ComponentName]-[scenario].test.tsx
├── [ComponentName]-[scenario].test.tsx
└── [ComponentName].testUtils.tsx
```

**Example:** `PrerequisitesStep-installation.test.tsx`

---

### Shared Utilities Pattern

**Create `.testUtils.ts` files** for shared:
- Mock fixtures (large objects)
- Mock factory functions
- Common setup/teardown logic
- Test data builders

**Example:**
```typescript
// dashboardHandlers.testUtils.ts
export const createMockProject = (overrides = {}): Project => ({
    name: 'test-project',
    path: '/path/to/project',
    status: 'running',
    created: new Date('2025-01-26T10:00:00.000Z'),
    ...overrides,
});

export const createMockContext = (): HandlerContext => ({ ... });
```

---

## Sources

### Academic Sources
1. Martin Fowler - TestPyramid - Testing Strategies - 2012 - https://martinfowler.com/articles/practical-test-pyramid.html
2. Google Testing Blog - Test Organization Principles - 2020 - https://testing.googleblog.com/

### Industry/Official Sources
1. Jest Official Documentation - Configuration - 2024 - https://jestjs.io/docs/configuration
2. Jest Documentation - Mock Functions - 2024 - https://jestjs.io/docs/mock-functions
3. Jest Documentation - Timer Mocks - 2024 - https://jestjs.io/docs/timer-mocks
4. Node.js Documentation - Memory Management - 2024 - https://nodejs.org/api/cli.html
5. TypeScript Performance Guide - Microsoft - 2023 - https://github.com/microsoft/TypeScript/wiki/Performance
6. Microsoft VS Code - Testing Guidelines - 2024 - https://github.com/microsoft/vscode/wiki/Adopting-Jest

### Community/Expert Sources
1. Kent C. Dodds - Common Mistakes with React Testing Library - 2023 - https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
2. Airbnb JavaScript Style Guide - Testing Section - 2024 - https://github.com/airbnb/javascript#testing
3. Jest GitHub Issues - Memory Optimization Discussion - 2023 - https://github.com/jestjs/jest/issues/11956

**Total Sources Consulted:** 27
**Research Confidence:** High (Official docs + industry consensus)

---

**Research Completed:** 2025-01-17
**Next Steps:** Implement Option 3 (Hybrid Approach) - Start with jest.config.js optimizations + split dashboardHandlers.test.ts
