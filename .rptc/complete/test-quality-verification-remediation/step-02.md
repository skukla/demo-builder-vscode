# Step 2: Reduce Mock-Heavy Tests & Improve Assertion Quality

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Complete

**Created:** 2025-01-04
**Last Updated:** 2025-01-04

---

## Purpose

Refactor three mock-heavy test files to reduce excessive mocking and strengthen weak assertions. Currently, these files rely on heavy mocking (65-87 mock function calls per file) that tests implementation details rather than actual behavior. They also use weak assertions (92 total instances of `toBeCalled`, `toBeTruthy`, etc.) that don't verify specific values.

**Why this step is important**: Mock-heavy tests are brittle and break when implementation changes, even when behavior is correct. Weak assertions don't catch bugs where functions return wrong values. This step improves test reliability and bug detection.

**Target files and current state**:
- `authenticationService.test.ts` - 600 lines, 52 jest.fn() calls, 31 weak assertions
- `meshDeployer.test.ts` - 728 lines, 12 jest.fn() calls, 8 weak assertions
- `adobeEntityService.test.ts` - 1162 lines, 32 jest.fn() calls, 40 weak assertions

**Goals**:
- Reduce mock calls from 96 total to <90 (60%+ reduction in targeted areas)
- Replace 79 weak assertions with specific value checks
- Improve test clarity and real behavior validation
- Maintain 100% test compatibility (all tests passing)

---

## Prerequisites

- [x] Step 1 complete (React 19 fixes established stable baseline)
- [ ] Jest test suite passing (baseline established)
- [ ] Project has TypeScript support for type-safe assertions
- [ ] Understanding of test file structure (Given-When-Then pattern)

---

## Overview

This step transforms mock-heavy tests into behavior-focused tests by:

1. **Analyzing mock usage patterns** - Identify which mocks test implementation vs behavior
2. **Reducing unnecessary mocking** - Mock only external dependencies (filesystem, network, CLI commands), not internal collaborators
3. **Strengthening assertions** - Replace weak assertions (toBeCalled, toBeTruthy) with specific value expectations
4. **Improving test clarity** - Ensure tests verify actual functionality, not internal wiring

**Implementation approach**:
- Incremental refactoring (one file at a time, verify passing after each)
- Focus on behavior testing (what it does, not how it does it)
- Maintain test coverage (no coverage regression)
- Full test suite verification after each file

**Expected benefits**:
- Less brittle tests (implementation changes don't break tests)
- Better bug detection (specific assertions catch wrong values)
- Clearer test intent (tests describe functionality, not mocking setup)
- Easier maintenance (fewer mocks to update)

---

## Test Strategy

### Testing Approach

**Framework**: Jest with ts-jest, @testing-library/react (where applicable)

**Coverage Goal**: Maintain 85% overall, ensure refactoring doesn't reduce coverage

**Test Distribution**: Unit (70%), Integration (25%), E2E (5%) - no change to distribution

### Scenarios for Step 2 (RED-GREEN-REFACTOR)

This step REFACTORS existing tests, so RED phase involves running current tests, GREEN phase is refactoring while keeping green, REFACTOR phase improves structure.

#### Scenario 1: Reduce Excessive Mocking

**Category**: Mock Reduction (Happy Path)

- [ ] **Test**: authenticationService.test.ts - Reduce mocks from 52 to <20
  - **Given**: Test file has 52 jest.fn() mock calls, mocks internal collaborators
  - **When**: Refactor to mock only external dependencies (CLI commands, SDK calls)
  - **Then**: Test passes with <20 mock calls, tests actual behavior not implementation
  - **File**: `tests/features/authentication/services/authenticationService.test.ts`

- [ ] **Test**: adobeEntityService.test.ts - Reduce mocks from 32 to <15
  - **Given**: Test file has 32 jest.fn() calls, extensive internal mocking
  - **When**: Use real internal services where possible, mock only boundaries
  - **Then**: Test passes with <15 mock calls, validates real service interactions
  - **File**: `tests/features/authentication/services/adobeEntityService.test.ts`

- [ ] **Test**: meshDeployer.test.ts - Reduce mocks from 12 to <10
  - **Given**: Test file already has fewer mocks (12), focus on quality
  - **When**: Ensure mocks are at correct boundaries (CLI, filesystem only)
  - **Then**: Test passes with <10 strategic mock calls
  - **File**: `tests/features/mesh/services/meshDeployer.test.ts`

#### Scenario 2: Strengthen Weak Assertions

**Category**: Assertion Quality (Happy Path)

- [ ] **Test**: Replace toBeCalled/toHaveBeenCalled with specific arg checks
  - **Given**: 50+ assertions use toBeCalled() without checking arguments
  - **When**: Replace with toHaveBeenCalledWith(expectedArgs)
  - **Then**: Assertions verify correct values passed, not just that function called
  - **Example**: `expect(fn).toBeCalled()` → `expect(fn).toHaveBeenCalledWith('expected-value')`
  - **Files**: All three test files

- [ ] **Test**: Replace toBeTruthy/toBeFalsy with specific value checks
  - **Given**: 29 assertions use toBeTruthy/toBeFalsy/toBeDefined/toBeUndefined
  - **When**: Replace with toBe(expectedValue) or toEqual(expectedObject)
  - **Then**: Assertions verify exact values, not just existence
  - **Example**: `expect(result).toBeTruthy()` → `expect(result).toBe(true)` or `expect(result).toEqual({id: '123'})`
  - **Files**: All three test files

#### Scenario 3: Verify No Coverage Regression

**Category**: Coverage Maintenance (Edge Case)

- [ ] **Test**: Run coverage before and after refactoring
  - **Given**: Baseline coverage report generated before refactoring
  - **When**: After refactoring, generate new coverage report
  - **Then**: Coverage maintained or improved (no regression >1%)
  - **Command**: `npm test -- --coverage`
  - **Files**: All three test files

#### Scenario 4: Test Behavior Not Implementation

**Category**: Behavior Focus (Refactoring Quality)

- [ ] **Test**: Verify tests still pass after refactoring internal code
  - **Given**: Refactored tests validate behavior (outputs, side effects)
  - **When**: Refactor production code internals (rename variables, reorder logic)
  - **Then**: Tests still pass without modification (proving they test behavior)
  - **Files**: All three test files

### Error Conditions

#### Error 1: Mock Removal Breaks Tests

**Category**: Refactoring Risk

- [ ] **Test**: Handle dependency injection when removing mocks
  - **Given**: Removing mock requires real dependency instance
  - **When**: Dependency has side effects (filesystem, network)
  - **Then**: Keep mock but verify behavior, not implementation details
  - **Mitigation**: Only remove mocks for pure functions and in-memory operations

#### Error 2: Assertion Strengthening Reveals Bugs

**Category**: Bug Discovery (Expected)

- [ ] **Test**: Discover production bugs via stronger assertions
  - **Given**: Weak assertion passes (toBeTruthy), strong assertion fails
  - **When**: Expected value doesn't match actual value
  - **Then**: Document bug in separate issue, update test with correct expected value OR fix bug
  - **Mitigation**: Differentiate test bugs from production bugs, file issues for production bugs

---

## Implementation Steps

### Step 2.1: Baseline and Analysis

**Purpose**: Establish current state, identify specific mocks and assertions to refactor

**Prerequisites**:
- [ ] Step 1 complete (React 19 fixes)
- [ ] All tests passing

**Files to Analyze**:
- [ ] `tests/features/authentication/services/authenticationService.test.ts`
- [ ] `tests/features/mesh/services/meshDeployer.test.ts`
- [ ] `tests/features/authentication/services/adobeEntityService.test.ts`

**Tasks**:

1. **Generate baseline coverage report**
   ```bash
   npm test -- --coverage --testPathPattern="authenticationService|meshDeployer|adobeEntityService"
   ```
   - [ ] Save coverage percentages for these three files
   - [ ] Screenshot or copy coverage output for comparison later

2. **Analyze mock usage in each file**
   ```bash
   # Count mocks per file
   grep -n "jest.fn()" tests/features/authentication/services/authenticationService.test.ts | wc -l
   grep -n "jest.fn()" tests/features/mesh/services/meshDeployer.test.ts | wc -l
   grep -n "jest.fn()" tests/features/authentication/services/adobeEntityService.test.ts | wc -l

   # Find weak assertions
   grep -n "toBeCalled\|toHaveBeenCalled\|toBeTruthy\|toBeFalsy\|toBeDefined\|toBeUndefined" tests/features/authentication/services/*.test.ts
   ```
   - [ ] Document which mocks are necessary (external deps: CLI, SDK, filesystem)
   - [ ] Document which mocks can be removed (internal collaborators, pure functions)
   - [ ] List all weak assertions with line numbers

3. **Create refactoring checklist per file**
   - [ ] `authenticationService.test.ts`: List mocks to remove (target: reduce from 52 to <20)
   - [ ] `meshDeployer.test.ts`: List weak assertions to strengthen (8 total)
   - [ ] `adobeEntityService.test.ts`: List mocks to remove (target: reduce from 32 to <15) and assertions to strengthen (40 total)

**Expected Outcome**:
- Baseline coverage report saved
- Specific refactoring targets identified per file
- Checklist ready for implementation

**Acceptance Criteria**:
- [ ] Coverage report generated and saved
- [ ] Mock analysis complete (categorized: keep vs remove)
- [ ] Weak assertion list complete with line numbers

**Estimated Time**: 2-3 hours

---

### Step 2.2: Refactor authenticationService.test.ts

**Purpose**: Reduce mocks from 52 to <20, strengthen 31 weak assertions

**Prerequisites**:
- [ ] Step 2.1 complete (baseline established)
- [ ] Refactoring checklist ready for this file

**File to Modify**:
- [ ] `tests/features/authentication/services/authenticationService.test.ts`

**Implementation Details (RED-GREEN-REFACTOR)**:

**RED Phase** (Current failing state - establish what needs fixing):
```bash
# Run tests to confirm current passing state
npm test authenticationService.test.ts
# All should pass - this is our GREEN baseline
# RED phase is conceptual: identify what's wrong (excessive mocks, weak assertions)
```

**GREEN Phase** (Refactor while maintaining passing tests):

1. **Identify mock categories** (lines 22-29, 57-83)
   - [ ] Keep mocks for external boundaries:
     - `CommandExecutor.executeAdobeCLI` (calls Adobe CLI)
     - `TokenManager` (manages authentication tokens)
     - `AdobeSDKClient` (calls Adobe SDK)
   - [ ] Remove/reduce mocks for internal collaborators:
     - Consider using real `AuthCacheManager` (in-memory cache, no side effects)
     - Consider using real `OrganizationValidator` (pure validation logic)
     - Consider using real `PerformanceTracker` (in-memory tracking)

2. **Refactor mock setup** (lines 96-150 in beforeEach)
   ```typescript
   // BEFORE (excessive mocking):
   mockCacheManager = {
     getCachedOrgList: jest.fn(),
     setCachedOrgList: jest.fn(),
     getCachedOrganization: jest.fn(),
     setCachedOrganization: jest.fn(),
     setCachedProject: jest.fn(),
     getCachedProject: jest.fn(),
     // ... 10+ more methods
   } as jest.Mocked<AuthCacheManager>;

   // AFTER (use real cache manager, only mock external calls):
   const realCacheManager = new AuthCacheManager();
   // AuthCacheManager is in-memory, safe to use in tests
   // Only mock if it makes external calls (verify first)
   ```

3. **Strengthen weak assertions** (search for patterns throughout file)
   ```typescript
   // BEFORE (weak - line ~200):
   expect(mockTokenManager.getToken).toHaveBeenCalled();

   // AFTER (specific):
   expect(mockTokenManager.getToken).toHaveBeenCalledWith();
   expect(mockTokenManager.getToken).toHaveReturnedWith('expected-token-value');

   // BEFORE (weak - line ~350):
   expect(result).toBeTruthy();

   // AFTER (specific):
   expect(result).toEqual({
     id: 'org123',
     code: 'ORGCODE',
     name: 'Test Organization'
   });
   ```

4. **Run tests incrementally**
   ```bash
   # After each change (mock removal or assertion strengthening)
   npm test authenticationService.test.ts
   ```
   - [ ] Fix any failures immediately
   - [ ] If removing mock breaks test, keep mock but document why (external dependency)
   - [ ] Commit after each successful refactoring chunk (e.g., "refactor: reduce mocks in auth check tests")

**REFACTOR Phase** (Improve structure after tests green):

1. **Group related tests**
   - [ ] Ensure describe blocks logically group tests (authentication checks, entity retrieval, cache operations)
   - [ ] Move common setup to outer beforeEach, test-specific setup to nested beforeEach

2. **Extract test helpers**
   ```typescript
   // If mock setup repeated across tests, extract helper
   const createAuthServiceWithMocks = (overrides = {}) => {
     const defaults = {
       commandExecutor: mockCommandExecutor,
       tokenManager: mockTokenManager,
       // ...
     };
     return new AuthenticationService({ ...defaults, ...overrides });
   };
   ```

3. **Improve test clarity**
   - [ ] Each test has clear name describing behavior tested
   - [ ] Given-When-Then structure visible in test body
   - [ ] No duplicate assertions (check each condition once)

**Expected Outcome**:
- Mock calls reduced from 52 to <20
- 31 weak assertions replaced with specific value checks
- All tests passing
- Coverage maintained or improved

**Acceptance Criteria**:
- [ ] `grep -c "jest.fn()" authenticationService.test.ts` returns <20
- [ ] Zero weak assertions in file (grep returns 0 for toBeCalled, toBeTruthy patterns)
- [ ] `npm test authenticationService.test.ts` passes (all green)
- [ ] Coverage for authenticationService.ts maintained ≥ current level

**Estimated Time**: 8-10 hours

---

### Step 2.3: Refactor meshDeployer.test.ts

**Purpose**: Reduce mocks from 12 to <10, strengthen 8 weak assertions

**Prerequisites**:
- [ ] Step 2.2 complete (authenticationService.test.ts refactored)
- [ ] Full test suite passing after Step 2.2

**File to Modify**:
- [ ] `tests/features/mesh/services/meshDeployer.test.ts`

**Implementation Details (RED-GREEN-REFACTOR)**:

**GREEN Phase** (Refactor strategically - fewer mocks already):

1. **Analyze current mocks** (lines 18-41)
   - [ ] Keep essential mocks:
     - `CommandExecutor.executeAdobeCLI` (calls Adobe CLI - must mock)
     - `fs.writeFile` (filesystem access - must mock)
     - `ServiceLocator.getCommandExecutor` (DI framework - must mock)
   - [ ] Review necessity of:
     - `validateMeshId` (security validation - could use real if pure function)

2. **Strengthen 8 weak assertions** (search throughout file)
   ```typescript
   // BEFORE (weak - line ~140):
   expect(mockLogger.info).toHaveBeenCalled();

   // AFTER (specific):
   expect(mockLogger.info).toHaveBeenCalledWith(
     expect.stringContaining('Deploying mesh configuration')
   );

   // BEFORE (weak - line ~220):
   expect(result).toBeDefined();

   // AFTER (specific):
   expect(result).toEqual({
     meshConfig: expect.objectContaining({
       sources: expect.arrayContaining([
         expect.objectContaining({
           name: 'CommerceGraphQL'
         })
       ])
     })
   });
   ```

3. **Verify mesh config generation** (lines 96-120)
   - [ ] Ensure assertions check actual config structure, not just existence
   - [ ] Example: `expect(config.meshConfig.sources).toHaveLength(1)` (specific count)
   - [ ] Example: `expect(config.meshConfig.sources[0].name).toBe('CommerceGraphQL')` (exact value)

4. **Run tests incrementally**
   ```bash
   npm test meshDeployer.test.ts
   ```
   - [ ] Verify passing after each assertion strengthening

**REFACTOR Phase**:

1. **Extract mesh config validation helper**
   ```typescript
   const expectValidMeshConfig = (config: any) => {
     expect(config).toHaveProperty('meshConfig');
     expect(config.meshConfig).toHaveProperty('sources');
     expect(config.meshConfig.sources).toBeInstanceOf(Array);
     expect(config.meshConfig.sources.length).toBeGreaterThan(0);
   };

   // Usage in tests:
   expectValidMeshConfig(result);
   expect(result.meshConfig.sources[0].name).toBe('CommerceGraphQL');
   ```

2. **Improve test organization**
   - [ ] Group by functionality: config generation, deployment, update detection
   - [ ] Clear test names describing scenarios

**Expected Outcome**:
- Mock calls reduced from 12 to <10 (strategic reduction)
- 8 weak assertions replaced with specific checks
- All tests passing
- Better config validation

**Acceptance Criteria**:
- [ ] `grep -c "jest.fn()" meshDeployer.test.ts` returns <10
- [ ] Zero weak assertions in file
- [ ] `npm test meshDeployer.test.ts` passes
- [ ] Coverage maintained ≥ current level

**Estimated Time**: 6-8 hours

---

### Step 2.4: Refactor adobeEntityService.test.ts

**Purpose**: Reduce mocks from 32 to <15, strengthen 40 weak assertions

**Prerequisites**:
- [ ] Step 2.3 complete (meshDeployer.test.ts refactored)
- [ ] Full test suite passing

**File to Modify**:
- [ ] `tests/features/authentication/services/adobeEntityService.test.ts`

**Implementation Details (RED-GREEN-REFACTOR)**:

**GREEN Phase** (Largest file, most mocks - careful refactoring):

1. **Analyze mock categories** (lines 22-24, 60-120)
   - [ ] Keep essential mocks:
     - `CommandExecutor.executeAdobeCLI` (CLI calls - must mock)
     - `AdobeSDKClient.getClient` (external SDK - must mock)
   - [ ] Consider using real implementations:
     - `AuthCacheManager` (in-memory cache - likely safe to use real)
     - `OrganizationValidator` (pure validation - use real)
     - `parseJSON` (utility function - use real)
     - Validation functions (validateOrgId, etc. - use real if pure)

2. **Refactor cache manager usage** (lines 95-108)
   ```typescript
   // BEFORE (heavy mocking):
   mockCacheManager = {
     getCachedOrgList: jest.fn(),
     setCachedOrgList: jest.fn(),
     getCachedOrganization: jest.fn(),
     setCachedOrganization: jest.fn(),
     setCachedProject: jest.fn(),
     getCachedProject: jest.fn(),
     getCachedWorkspace: jest.fn(),
     setCachedWorkspace: jest.fn(),
     clearOrganizationCache: jest.fn(),
     clearProjectCache: jest.fn(),
     clearWorkspaceCache: jest.fn(),
     clearAllCache: jest.fn(),
   } as any;

   // AFTER (use real cache manager):
   const realCacheManager = new AuthCacheManager();
   // Real instance manages state correctly, no mocking needed
   // Only mock if external dependencies exist (verify source code)
   ```

3. **Strengthen 40 weak assertions** (throughout file)
   ```typescript
   // Pattern 1: toBeCalled → toHaveBeenCalledWith
   // BEFORE:
   expect(mockSDKClient.getClient).toHaveBeenCalled();

   // AFTER:
   expect(mockSDKClient.getClient).toHaveBeenCalledWith();
   expect(mockSDKClient.getClient).toHaveReturnedWith(mockClient);

   // Pattern 2: toBeTruthy → specific value
   // BEFORE:
   expect(orgs).toBeTruthy();

   // AFTER:
   expect(orgs).toEqual([
     { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
     { id: 'org2', code: 'ORG2@AdobeOrg', name: 'Organization 2' },
   ]);

   // Pattern 3: toBeDefined → exact structure
   // BEFORE:
   expect(result).toBeDefined();

   // AFTER:
   expect(result).toEqual({
     id: expect.any(String),
     name: expect.any(String),
     // ... other expected properties
   });
   ```

4. **Run tests incrementally** (file is 1162 lines - work in chunks)
   ```bash
   # After each describe block refactored
   npm test adobeEntityService.test.ts
   ```
   - [ ] Refactor one describe block at a time
   - [ ] Verify all tests passing before moving to next block

**REFACTOR Phase**:

1. **Extract test data builders**
   ```typescript
   // Create builder for common test data
   const createMockOrg = (overrides = {}): AdobeOrg => ({
     id: 'org1',
     code: 'ORG1@AdobeOrg',
     name: 'Organization 1',
     ...overrides,
   });

   const createMockProject = (overrides = {}): AdobeProject => ({
     id: 'proj1',
     name: 'Project 1',
     title: 'Project 1 Title',
     description: 'Test project',
     org_id: '123456',
     ...overrides,
   });
   ```

2. **Group by entity type**
   - [ ] Organization tests together
   - [ ] Project tests together
   - [ ] Workspace tests together
   - [ ] Clear separation improves navigation

3. **Reduce duplication**
   - [ ] Common assertion patterns → helper functions
   - [ ] Repeated setup → outer beforeEach

**Expected Outcome**:
- Mock calls reduced from 32 to <15
- 40 weak assertions replaced with specific checks
- All tests passing
- Improved test maintainability

**Acceptance Criteria**:
- [ ] `grep -c "jest.fn()" adobeEntityService.test.ts` returns <15
- [ ] Zero weak assertions in file
- [ ] `npm test adobeEntityService.test.ts` passes
- [ ] Coverage maintained ≥ current level

**Estimated Time**: 10-12 hours

---

### Step 2.5: Full Suite Verification and Metrics

**Purpose**: Verify all changes, generate before/after metrics, run full test suite

**Prerequisites**:
- [ ] Steps 2.2, 2.3, 2.4 complete (all three files refactored)
- [ ] Individual test files passing

**Tasks**:

1. **Run full test suite**
   ```bash
   npm test
   ```
   - [ ] All tests passing (zero failures)
   - [ ] No skipped tests (except known issues in other files)
   - [ ] No test timeouts

2. **Generate final coverage report**
   ```bash
   npm test -- --coverage
   ```
   - [ ] Compare to baseline from Step 2.1
   - [ ] Coverage maintained or improved (no regression)
   - [ ] Document any changes in coverage percentages

3. **Count mock reduction**
   ```bash
   # Final mock counts
   grep -c "jest.fn()" tests/features/authentication/services/authenticationService.test.ts
   grep -c "jest.fn()" tests/features/mesh/services/meshDeployer.test.ts
   grep -c "jest.fn()" tests/features/authentication/services/adobeEntityService.test.ts
   ```
   - [ ] authenticationService: <20 (down from 52)
   - [ ] meshDeployer: <10 (down from 12)
   - [ ] adobeEntityService: <15 (down from 32)
   - [ ] Total: <45 (down from 96, 53% reduction)

4. **Verify weak assertions eliminated**
   ```bash
   # Should return 0 for targeted files
   grep -c "toBeCalled\|toBeTruthy\|toBeFalsy\|toBeDefined\|toBeUndefined" \
     tests/features/authentication/services/authenticationService.test.ts \
     tests/features/mesh/services/meshDeployer.test.ts \
     tests/features/authentication/services/adobeEntityService.test.ts
   ```
   - [ ] All three files: 0 weak assertions
   - [ ] Total eliminated: 79 weak assertions → 0

5. **Document improvements**
   - [ ] Create summary of changes:
     - Mock calls: 96 → <45 (53%+ reduction)
     - Weak assertions: 79 → 0 (100% strengthened)
     - Coverage: [Before]% → [After]% (maintained/improved)
     - Test execution time: [Before]s → [After]s (track performance)

6. **Check for circular dependencies** (if mocks were replaced with real instances)
   ```bash
   # Install madge if needed for Step 3
   npm install --save-dev madge

   # Check for circular dependencies in authentication/mesh features
   npx madge --circular src/features/authentication
   npx madge --circular src/features/mesh
   ```
   - [ ] No new circular dependencies introduced
   - [ ] Document any existing circular dependencies for Step 3

**Expected Outcome**:
- Full test suite passing
- Metrics documented (mock reduction, assertion improvements)
- No coverage regression
- No circular dependencies introduced

**Acceptance Criteria**:
- [ ] `npm test` passes completely
- [ ] Mock reduction ≥50% in targeted files
- [ ] Weak assertions eliminated in targeted files
- [ ] Coverage maintained ≥85% overall
- [ ] Metrics summary created

**Estimated Time**: 2-3 hours

---

## Expected Outcome

After completing Step 2:

- **Functionality**: Three test files refactored with improved test quality
- **Mock Reduction**: 96 mock calls → <45 (53%+ reduction)
- **Assertion Quality**: 79 weak assertions → 0 (100% strengthened)
- **Test Reliability**: Tests validate behavior, not implementation details
- **Coverage**: Maintained at ≥85% (no regression)
- **Test Suite Health**: All tests passing, no new failures introduced

**Demonstrable success**:
```bash
npm test
# PASS tests/features/authentication/services/authenticationService.test.ts
# PASS tests/features/mesh/services/meshDeployer.test.ts
# PASS tests/features/authentication/services/adobeEntityService.test.ts
# All tests passing, improved assertion quality, reduced brittleness
```

---

## Acceptance Criteria

### Quantitative Metrics

- [ ] Mock calls in authenticationService.test.ts: <20 (baseline: 52, target: 60% reduction)
- [ ] Mock calls in meshDeployer.test.ts: <10 (baseline: 12, target: maintained/improved)
- [ ] Mock calls in adobeEntityService.test.ts: <15 (baseline: 32, target: 50% reduction)
- [ ] Total mock reduction: ≥50% in targeted areas (96 → <45)
- [ ] Weak assertions eliminated: 79 → 0 in targeted files
- [ ] Coverage maintained: ≥85% overall, no file regression >1%

### Qualitative Criteria

- [ ] Tests validate behavior (outputs, side effects), not implementation (internal calls)
- [ ] Assertions check specific values, not just existence/truthiness
- [ ] Mocks only at external boundaries (CLI, SDK, filesystem), not internal collaborators
- [ ] Test names clearly describe scenarios tested
- [ ] Given-When-Then structure visible in test bodies

### Regression Prevention

- [ ] Full test suite passes (`npm test` all green)
- [ ] No new test timeouts introduced
- [ ] No circular dependencies introduced (verified via madge if applicable)
- [ ] Test execution time not increased >10%

---

## Dependencies from Other Steps

**Blocked by**:
- [x] Step 1: Fix React 19 Skipped Tests (COMPLETE - stable baseline established)

**Rationale**: Step 1 fixes 16 critical skipped tests, establishing stable baseline. Step 2 requires stable tests to safely refactor without conflating issues.

**Blocks**:
- Step 3: Split Large Test Files (depends on Step 2 improving test quality first)
- Step 4: Eliminate Type Safety Bypasses (benefits from improved test structure)

**Rationale**: Improving test quality (Step 2) before splitting files (Step 3) ensures split tests maintain quality standards. Type safety fixes (Step 4) easier with better assertions.

---

## Integration Notes

### Madge for Circular Dependency Detection

If real service instances replace mocks, verify no circular dependencies introduced:

```bash
# Install madge (if not already installed)
npm install --save-dev madge

# Check features modified in this step
npx madge --circular src/features/authentication
npx madge --circular src/features/mesh

# If circular dependencies found, document and resolve
```

**When to use madge**:
- After replacing mocked service with real instance
- If test import errors suggest circular dependency
- Before finalizing Step 2 (prevention check)

### Jest Coverage Comparison

Track coverage changes to ensure no regression:

```bash
# Before Step 2 (baseline)
npm test -- --coverage --testPathPattern="authenticationService|meshDeployer|adobeEntityService" > coverage-before.txt

# After Step 2 (comparison)
npm test -- --coverage --testPathPattern="authenticationService|meshDeployer|adobeEntityService" > coverage-after.txt

# Compare
diff coverage-before.txt coverage-after.txt
```

### Production Code Issues

If strengthening assertions reveals bugs in production code:

1. **Document the bug**:
   - Create GitHub issue with details
   - Tag with `bug`, `discovered-in-testing`
   - Include test case that fails with bug

2. **Decision point**:
   - **Fix now**: If critical, fix in this step
   - **Fix later**: If non-critical, update test with TODO comment and issue reference

3. **Update test**:
   ```typescript
   // Option 1: Test current (buggy) behavior with TODO
   expect(result).toBe(incorrectValue); // TODO: Fix bug #123, should be correctValue

   // Option 2: Fix bug immediately, update test
   expect(result).toBe(correctValue); // Bug #123 fixed
   ```

---

## Progress Tracking

**Current Step**: Step 2 of 6

**Previous Step**: Step 1 - Fix React 19 Skipped Tests (COMPLETE)

**Next Step**: Step 3 - Split Large Test Files (>600 lines)

**Overall Progress**: 16% (1/6 steps complete)

**Estimated Remaining Time**: 100-140 hours across Steps 3-6

---

## Estimated Time

**Total for Step 2**: 24-32 hours

**Breakdown**:
- Step 2.1: Baseline and Analysis: 2-3 hours
- Step 2.2: Refactor authenticationService.test.ts: 8-10 hours
- Step 2.3: Refactor meshDeployer.test.ts: 6-8 hours
- Step 2.4: Refactor adobeEntityService.test.ts: 10-12 hours
- Step 2.5: Full Suite Verification: 2-3 hours

**Risk buffer**: +4 hours if production bugs discovered requiring immediate fixes

---

**Implementation Note**: Work incrementally. Refactor one file completely before moving to next. Run full test suite after each file to catch integration issues early. Document any production code bugs discovered for triage.

**Reference**:
- Testing best practices: See testing-guide.md (SOP) if available
- Mock reduction strategies: Focus on behavior over implementation
- Assertion patterns: Use Jest's `toEqual`, `toHaveBeenCalledWith`, `expect.objectContaining` for specific checks
