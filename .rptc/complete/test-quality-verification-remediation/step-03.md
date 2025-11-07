# Step 3: Split Large Test Files & Eliminate Type Safety Bypasses

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Complete

**Created:** 2025-01-04
**Last Updated:** 2025-01-04

---

## Purpose

Split 25 large test files (>600 lines) into focused, maintainable files (<600 lines each) and eliminate 252 `as any` type safety bypasses across the test suite. Large test files are difficult to navigate, slow to understand, and brittle to modify. Type safety bypasses hide real type mismatches and prevent catching bugs during development.

**Why this step is important**: Large files slow down development (hard to find relevant tests) and type safety bypasses eliminate one of TypeScript's primary benefits—compile-time error detection. Splitting files by feature boundaries and adding proper types improves maintainability and catches real bugs.

**Current state**:
- 25 test files >600 lines (largest: 1384 lines)
- 252 `as any` instances across test suite
- Difficult navigation and slow comprehension
- Hidden type errors that could surface in production

**Goals**:
- Split all 25 files >600 lines to <600 lines each (feature-based splits)
- Reduce `as any` from 252 to <50 instances (80%+ reduction)
- Improve type safety and test maintainability
- Maintain 100% test compatibility (zero failures)
- No circular dependencies introduced

---

## Prerequisites

- [x] Step 1 complete (React 19 fixes established stable baseline)
- [x] Step 2 complete (Mock reduction and assertion quality improvements)
- [ ] Jest test suite passing (baseline established)
- [ ] madge installed for circular dependency detection: `npm install --save-dev madge`
- [ ] TypeScript strict mode enabled for test files

---

## Overview

This step transforms large, unwieldy test files into focused, maintainable files while simultaneously improving type safety by replacing `as any` bypasses with proper types.

**Dual-focus approach**:

1. **File splitting** - Split by logical feature boundaries (not arbitrary line counts)
2. **Type safety** - Replace `as any` with proper types incrementally

**Implementation strategy**:
- Incremental splitting (one large file at a time)
- Feature-based splits (align with test describe blocks)
- Type safety fixes during split (fix `as any` in each new file)
- Verify no circular dependencies after each split (madge)
- Full test suite verification after each file
- Maintain test coverage (no regression)

**Expected benefits**:
- Faster test file navigation (smaller, focused files)
- Better test organization (clear feature separation)
- Improved type safety (catch bugs at compile time)
- Easier maintenance (smaller files easier to modify)
- Better onboarding (clear test structure)

---

## Test Strategy

### Testing Approach

**Framework**: Jest with ts-jest, @testing-library/react

**Coverage Goal**: Maintain 85% overall, ensure splitting/type fixes don't reduce coverage

**Test Distribution**: Unit (70%), Integration (25%), E2E (5%) - no change to distribution

### Scenarios for Step 3 (RED-GREEN-REFACTOR)

This step REFACTORS existing tests, so RED phase involves running current tests, GREEN phase is splitting/fixing while keeping green, REFACTOR phase improves structure.

#### Scenario 1: Split Large Files by Feature

**Category**: File Organization (Happy Path)

- [ ] **Test**: authenticationHandlers.test.ts - Split 1384 lines into feature-focused files
  - **Given**: File has 1384 lines with multiple describe blocks (handleCheckAuth, handleAuthenticate, message patterns, edge cases)
  - **When**: Split by handler boundaries into separate files
  - **Then**: Each file <600 lines, all tests passing, coverage maintained
  - **Split Plan**:
    - `authenticationHandlers-checkAuth.test.ts` (~400 lines) - handleCheckAuth tests
    - `authenticationHandlers-authenticate.test.ts` (~500 lines) - handleAuthenticate tests
    - `authenticationHandlers-messages.test.ts` (~484 lines) - message pattern tests
  - **File**: `tests/features/authentication/handlers/authenticationHandlers.test.ts`

- [ ] **Test**: adobeEntityService.test.ts - Split 1162 lines by entity type
  - **Given**: File tests organizations, projects, workspaces (3 major entity types)
  - **When**: Split by entity boundaries (org tests, project tests, workspace tests)
  - **Then**: Each file <600 lines, all tests passing
  - **Split Plan**:
    - `adobeEntityService-organizations.test.ts` (~400 lines) - org-specific tests
    - `adobeEntityService-projects.test.ts` (~400 lines) - project-specific tests
    - `adobeEntityService-workspaces.test.ts` (~362 lines) - workspace-specific tests
  - **File**: `tests/features/authentication/services/adobeEntityService.test.ts`

- [ ] **Test**: stateManager.test.ts - Split 1114 lines by state operation type
  - **Given**: File tests getState, setState, resetState, watchers, persistence (5 major areas)
  - **When**: Split by operation type (read, write, watch, persistence)
  - **Then**: Each file <600 lines, all tests passing
  - **Split Plan**:
    - `stateManager-read.test.ts` (~350 lines) - getState operations
    - `stateManager-write.test.ts` (~400 lines) - setState/resetState operations
    - `stateManager-watch.test.ts` (~364 lines) - watcher and persistence tests
  - **File**: `tests/core/state/stateManager.test.ts`

#### Scenario 2: Eliminate Type Safety Bypasses

**Category**: Type Safety (Happy Path)

- [ ] **Test**: Replace `as any` in mock factories with proper types
  - **Given**: 252 `as any` instances across test files (most in mock factories)
  - **When**: Replace with proper jest.Mocked<Type> or Partial<Type>
  - **Then**: Zero `as any` in targeted files, TypeScript catches type errors
  - **Example**:
    ```typescript
    // BEFORE (type unsafe):
    const mockContext = {
      authManager: {} as any,
      logger: {} as any,
    } as HandlerContext;

    // AFTER (type safe):
    const mockContext: jest.Mocked<HandlerContext> = {
      authManager: {
        isAuthenticatedQuick: jest.fn(),
        login: jest.fn(),
        // ... all required methods
      } as jest.Mocked<AuthManager>,
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        // ... all required methods
      } as jest.Mocked<Logger>,
      // ... all required properties
    };
    ```
  - **Files**: All test files (focus on newly split files first)

- [ ] **Test**: Replace `as any` in type assertions with proper type guards
  - **Given**: Type assertions using `as any` to bypass strict checks
  - **When**: Use type guards or narrow to specific types
  - **Then**: Type safety preserved, compiler catches errors
  - **Example**:
    ```typescript
    // BEFORE (bypasses type checking):
    const result = someFunction() as any as SpecificType;

    // AFTER (type safe):
    const result = someFunction();
    if (isSpecificType(result)) {
      // TypeScript knows result is SpecificType here
    }
    ```
  - **Files**: All test files with type assertions

- [ ] **Test**: Document production code type issues discovered
  - **Given**: Removing `as any` may expose type mismatches in production code
  - **When**: TypeScript errors point to production code issues
  - **Then**: Document in GitHub issue, add TODO comment, fix if critical
  - **Files**: Create `.rptc/plans/test-quality-verification-remediation/type-issues-discovered.md`

#### Scenario 3: Verify No Coverage Regression

**Category**: Coverage Maintenance (Edge Case)

- [ ] **Test**: Run coverage before and after each file split
  - **Given**: Baseline coverage report for file being split
  - **When**: After split, run coverage for new split files
  - **Then**: Combined coverage of split files ≥ original file coverage
  - **Command**: `npm test -- --coverage --testPathPattern="[filename]"`
  - **Files**: All split files

#### Scenario 4: Verify No Circular Dependencies

**Category**: Dependency Safety (Edge Case)

- [ ] **Test**: Run madge after each split to verify no circular dependencies
  - **Given**: Split creates new test files with shared test utilities
  - **When**: Run madge on test directory after split
  - **Then**: Zero circular dependencies detected
  - **Command**: `npx madge --circular tests/`
  - **Files**: All test files

### Error Conditions

#### Error 1: Split Breaks Test Suite

**Category**: Refactoring Risk

- [ ] **Test**: Handle shared test utilities during split
  - **Given**: Multiple describe blocks share beforeEach setup
  - **When**: Split into separate files requires extracting shared setup
  - **Then**: Extract to shared test utility file, import in split files
  - **Mitigation**: Create `tests/[feature]/testHelpers.ts` for shared factories/mocks

#### Error 2: Type Safety Fix Reveals Production Bug

**Category**: Bug Discovery (Expected)

- [ ] **Test**: Production code type mismatch discovered via `as any` removal
  - **Given**: `as any` was hiding type incompatibility
  - **When**: Proper type used, TypeScript error points to production code
  - **Then**: Document bug, create GitHub issue, add TODO or fix immediately
  - **Mitigation**: Separate test bugs from production bugs, prioritize production fixes

---

## Implementation Steps

### Step 3.1: Baseline and File Identification

**Purpose**: Establish current state, identify files to split and prioritize order

**Prerequisites**:
- [ ] Step 2 complete (mock reduction, assertion improvements)
- [ ] All tests passing

**Tasks**:

1. **Generate file size report**
   ```bash
   # Find all test files >600 lines
   find tests -name "*.test.ts" -type f -exec wc -l {} + | awk '$1 > 600' | sort -rn
   ```
   - [ ] Save list of 25 files >600 lines with line counts
   - [ ] Prioritize by size (largest first) and complexity

2. **Count `as any` instances per file**
   ```bash
   # Count as any per file
   find tests -name "*.test.ts" -type f -exec bash -c 'echo "$(grep -c "as any" "$1" 2>/dev/null || echo 0) $1"' _ {} \; | awk '$1 > 0' | sort -rn
   ```
   - [ ] Identify files with most `as any` instances
   - [ ] Cross-reference with files to split (fix during split)

3. **Analyze split boundaries for largest files**
   - [ ] authenticationHandlers.test.ts (1384 lines):
     - List describe blocks: `grep -n "describe(" file`
     - Identify natural split points (handler boundaries, message tests)
     - Plan 3 split files: checkAuth, authenticate, messages

   - [ ] adobeEntityService.test.ts (1162 lines):
     - Identify entity boundaries (organizations, projects, workspaces)
     - Plan 3 split files by entity type

   - [ ] stateManager.test.ts (1114 lines):
     - Identify operation types (read, write, watch, persistence)
     - Plan 3 split files by operation type

   - [ ] webviewCommunicationManager.test.ts (1083 lines):
     - Identify feature boundaries (handshake, message queue, retry logic)
     - Plan 3 split files by feature

   - [ ] componentManager.test.ts (1032 lines):
     - Identify component operations (load, update, validate)
     - Plan 3 split files by operation type

4. **Generate baseline coverage**
   ```bash
   npm test -- --coverage --testPathPattern="authenticationHandlers|adobeEntityService|stateManager|webviewCommunicationManager|componentManager"
   ```
   - [ ] Save coverage percentages for top 5 largest files
   - [ ] Use as baseline for post-split verification

5. **Install madge for circular dependency detection**
   ```bash
   npm install --save-dev madge
   ```
   - [ ] Verify installation: `npx madge --version`
   - [ ] Run baseline check: `npx madge --circular tests/`

**Expected Outcome**:
- List of 25 files to split with prioritization
- Split plan for top 5 largest files
- Baseline coverage report
- madge installed and baseline run

**Acceptance Criteria**:
- [ ] File size report generated with 25 files identified
- [ ] `as any` count per file documented
- [ ] Split plans created for top 5 files
- [ ] Baseline coverage saved
- [ ] madge installed and baseline clean

**Estimated Time**: 3-4 hours

---

### Step 3.2: Split authenticationHandlers.test.ts (1384 → 3 files)

**Purpose**: Split largest test file by handler and message pattern boundaries

**Prerequisites**:
- [ ] Step 3.1 complete (baseline established)
- [ ] Split plan approved for this file

**File to Split**:
- [ ] `tests/features/authentication/handlers/authenticationHandlers.test.ts` (1384 lines)

**Target Split Files** (feature-based boundaries):
- [ ] `tests/features/authentication/handlers/authenticationHandlers-checkAuth.test.ts` (~400 lines)
- [ ] `tests/features/authentication/handlers/authenticationHandlers-authenticate.test.ts` (~500 lines)
- [ ] `tests/features/authentication/handlers/authenticationHandlers-messages.test.ts` (~484 lines)

**Implementation Details (RED-GREEN-REFACTOR)**:

**GREEN Phase** (Split while maintaining passing tests):

1. **Extract shared test utilities** (lines 22-87)
   ```typescript
   // Create: tests/features/authentication/handlers/testHelpers.ts

   import type { HandlerContext } from '@/types/handlers';
   import type { AdobeOrg, AdobeProject } from '@/features/authentication/services/types';

   // Mock data (lines 22-36)
   export const mockOrg: AdobeOrg = { ... };
   export const mockProject: AdobeProject = { ... };
   export const mockOrgs: AdobeOrg[] = [ ... ];

   // Mock factory (lines 39-87)
   export function createMockHandlerContext(
     overrides?: Partial<HandlerContext>
   ): jest.Mocked<HandlerContext> {
     return {
       prereqManager: {} as any, // TODO: Fix as any in Step 3.3
       authManager: {
         isAuthenticatedQuick: jest.fn(),
         // ... all methods with proper types
       } as jest.Mocked<AuthManager>,
       // ... all properties
     };
   }
   ```
   - [ ] Create shared test helpers file
   - [ ] Export mock data and factory
   - [ ] Run tests to verify helpers work: `npm test authenticationHandlers`

2. **Create split file 1: authenticationHandlers-checkAuth.test.ts** (lines 90-412)
   ```typescript
   import { handleCheckAuth } from '@/features/authentication/handlers/authenticationHandlers';
   import { createMockHandlerContext, mockOrg, mockProject } from './testHelpers';

   describe('authenticationHandlers', () => {
     describe('handleCheckAuth', () => {
       // Lines 90-412: All handleCheckAuth tests
       // - happy path (lines 98-233)
       // - error handling (lines 234-305)
       // - edge cases (lines 306-412)
     });
   });
   ```
   - [ ] Create new file with handleCheckAuth tests only
   - [ ] Import from shared testHelpers
   - [ ] Run tests: `npm test authenticationHandlers-checkAuth`
   - [ ] Verify all tests passing

3. **Create split file 2: authenticationHandlers-authenticate.test.ts** (lines 413-1014)
   ```typescript
   import { handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
   import { createMockHandlerContext, mockOrg, mockOrgs } from './testHelpers';

   describe('authenticationHandlers', () => {
     describe('handleAuthenticate', () => {
       // Lines 413-1014: All handleAuthenticate tests
       // - happy path (lines 421-596)
       // - post-login organization handling (lines 597-699)
       // - error handling (lines 700-794)
       // - edge cases (lines 795-1014)
     });
   });
   ```
   - [ ] Create new file with handleAuthenticate tests
   - [ ] Import from shared testHelpers
   - [ ] Run tests: `npm test authenticationHandlers-authenticate`
   - [ ] Verify all tests passing

4. **Create split file 3: authenticationHandlers-messages.test.ts** (lines 1015-1384)
   ```typescript
   import { handleCheckAuth, handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
   import { createMockHandlerContext } from './testHelpers';

   describe('authenticationHandlers', () => {
     describe('Message Pattern Tests', () => {
       // Lines 1015-1384: All message consistency tests
       // - Constant message pattern (lines 1015-1186)
       // - subMessage updates (lines 1187-1222)
       // - Error message sanitization (lines 1223-1339)
       // - Visual consistency (lines 1340-1384)
     });
   });
   ```
   - [ ] Create new file with message pattern tests
   - [ ] Import from shared testHelpers
   - [ ] Run tests: `npm test authenticationHandlers-messages`
   - [ ] Verify all tests passing

5. **Verify split success**
   ```bash
   # Run all split files together
   npm test authenticationHandlers-checkAuth authenticationHandlers-authenticate authenticationHandlers-messages

   # Check coverage maintained
   npm test -- --coverage --testPathPattern="authenticationHandlers"

   # Verify no circular dependencies
   npx madge --circular tests/features/authentication/handlers
   ```
   - [ ] All split tests passing
   - [ ] Coverage maintained (≥ original file coverage)
   - [ ] No circular dependencies detected

6. **Delete original file**
   ```bash
   git rm tests/features/authentication/handlers/authenticationHandlers.test.ts
   ```
   - [ ] Remove original large file
   - [ ] Verify full test suite still passes: `npm test`

**REFACTOR Phase** (Fix `as any` in new files):

1. **Fix `as any` in testHelpers.ts**
   ```typescript
   // BEFORE (type unsafe):
   export function createMockHandlerContext(
     overrides?: Partial<HandlerContext>
   ): jest.Mocked<HandlerContext> {
     return {
       prereqManager: {} as any, // ❌ Type bypass
       authManager: { ... } as any, // ❌ Type bypass
       // ...
     };
   }

   // AFTER (type safe):
   export function createMockHandlerContext(
     overrides?: Partial<HandlerContext>
   ): jest.Mocked<HandlerContext> {
     return {
       prereqManager: {
         // All required methods properly typed
       } as jest.Mocked<PrerequisitesManager>,
       authManager: {
         // All required methods properly typed
       } as jest.Mocked<AuthenticationManager>,
       // ...
     };
   }
   ```
   - [ ] Identify all `as any` in testHelpers.ts
   - [ ] Replace with proper jest.Mocked<Type> types
   - [ ] Run tests to verify type fixes work

2. **Fix remaining `as any` in split files**
   - [ ] Search each split file: `grep -n "as any" [file]`
   - [ ] Replace with proper types (Partial<Type>, jest.Mocked<Type>, type guards)
   - [ ] Document any production code type issues discovered
   - [ ] Run tests after each fix

3. **Verify type safety**
   ```bash
   # TypeScript compile check (should pass with no errors)
   npx tsc --noEmit --project tsconfig.json

   # Count remaining as any (target: 0 in these files)
   grep -c "as any" tests/features/authentication/handlers/*.test.ts
   ```
   - [ ] TypeScript compilation clean
   - [ ] Zero `as any` in split files (or <5 if production code limitations)

**Expected Outcome**:
- authenticationHandlers.test.ts (1384 lines) → 3 files (~400-500 lines each)
- Shared test helpers extracted and reusable
- `as any` eliminated in new files (10 instances → 0)
- All tests passing
- Coverage maintained
- No circular dependencies

**Acceptance Criteria**:
- [ ] 3 new split files created, each <600 lines
- [ ] Shared testHelpers.ts created and reused
- [ ] Original file deleted
- [ ] All tests passing: `npm test authenticationHandlers`
- [ ] Coverage maintained ≥ baseline
- [ ] Zero `as any` in split files (or documented exceptions)
- [ ] No circular dependencies: `npx madge --circular tests/`

**Estimated Time**: 8-10 hours

---

### Step 3.3: Split adobeEntityService.test.ts (1162 → 3 files)

**Purpose**: Split by entity type boundaries (organizations, projects, workspaces)

**Prerequisites**:
- [ ] Step 3.2 complete (authenticationHandlers split successfully)
- [ ] Full test suite passing

**File to Split**:
- [ ] `tests/features/authentication/services/adobeEntityService.test.ts` (1162 lines)

**Target Split Files** (entity-based boundaries):
- [ ] `tests/features/authentication/services/adobeEntityService-organizations.test.ts` (~400 lines)
- [ ] `tests/features/authentication/services/adobeEntityService-projects.test.ts` (~400 lines)
- [ ] `tests/features/authentication/services/adobeEntityService-workspaces.test.ts` (~362 lines)

**Implementation Details (GREEN-REFACTOR)**:

**GREEN Phase**:

1. **Analyze describe block structure**
   ```bash
   grep -n "describe(" tests/features/authentication/services/adobeEntityService.test.ts
   ```
   - [ ] Identify organization tests (getOrganizations, selectOrganization, etc.)
   - [ ] Identify project tests (getProjects, selectProject, etc.)
   - [ ] Identify workspace tests (getWorkspaces, selectWorkspace, etc.)

2. **Extract shared test utilities**
   - [ ] Create `tests/features/authentication/services/entityTestHelpers.ts`
   - [ ] Move mock data (organizations, projects, workspaces)
   - [ ] Move factory functions (createMockEntityService)
   - [ ] Verify helpers work: `npm test adobeEntityService`

3. **Create split file 1: organizations**
   - [ ] New file with all organization-related tests
   - [ ] Import from entityTestHelpers
   - [ ] Run tests: `npm test adobeEntityService-organizations`

4. **Create split file 2: projects**
   - [ ] New file with all project-related tests
   - [ ] Import from entityTestHelpers
   - [ ] Run tests: `npm test adobeEntityService-projects`

5. **Create split file 3: workspaces**
   - [ ] New file with all workspace-related tests
   - [ ] Import from entityTestHelpers
   - [ ] Run tests: `npm test adobeEntityService-workspaces`

6. **Verify and delete original**
   - [ ] All split tests passing
   - [ ] Coverage maintained
   - [ ] Delete original file
   - [ ] Full suite passes

**REFACTOR Phase** (Fix `as any`):

1. **Fix `as any` in entityTestHelpers.ts**
   - [ ] Replace `{} as any` with proper mocks
   - [ ] Use jest.Mocked<Type> for all service mocks
   - [ ] Run tests to verify

2. **Fix `as any` in split files**
   - [ ] Search and replace in each file
   - [ ] Document production code type issues
   - [ ] Run tests after each fix

3. **Verify type safety**
   - [ ] TypeScript compilation clean
   - [ ] Zero `as any` in split files (target)

**Expected Outcome**:
- adobeEntityService.test.ts (1162 lines) → 3 files (~400 lines each)
- `as any` reduced (40 instances → <5)
- All tests passing
- Coverage maintained

**Acceptance Criteria**:
- [ ] 3 new split files created, each <600 lines
- [ ] entityTestHelpers.ts created
- [ ] Original file deleted
- [ ] All tests passing
- [ ] Coverage maintained ≥ baseline
- [ ] `as any` reduced to <5 in split files
- [ ] No circular dependencies

**Estimated Time**: 8-10 hours

---

### Step 3.4: Split Remaining Large Files (5 more files)

**Purpose**: Split remaining files >600 lines using same pattern

**Prerequisites**:
- [ ] Steps 3.2, 3.3 complete (pattern established)
- [ ] Full test suite passing

**Files to Split** (in priority order):

1. **stateManager.test.ts** (1114 lines) → 3 files by operation type
   - [ ] stateManager-read.test.ts (getState operations)
   - [ ] stateManager-write.test.ts (setState/resetState)
   - [ ] stateManager-watch.test.ts (watchers, persistence)

2. **webviewCommunicationManager.test.ts** (1083 lines) → 3 files by feature
   - [ ] webviewCommunicationManager-handshake.test.ts
   - [ ] webviewCommunicationManager-queue.test.ts
   - [ ] webviewCommunicationManager-retry.test.ts

3. **componentManager.test.ts** (1032 lines) → 3 files by operation
   - [ ] componentManager-load.test.ts
   - [ ] componentManager-update.test.ts
   - [ ] componentManager-validate.test.ts

4. **typeGuards.test.ts** (1014 lines) → 2 files by type category
   - [ ] typeGuards-primitives.test.ts
   - [ ] typeGuards-complex.test.ts

5. **securityValidation.test.ts** (878 lines) → 2 files by validation type
   - [ ] securityValidation-input.test.ts
   - [ ] securityValidation-auth.test.ts

**Implementation Pattern** (apply to each file):

1. **Analyze describe blocks** - Identify natural split boundaries
2. **Extract shared utilities** - Create testHelpers.ts for each feature area
3. **Create split files** - One at a time, verify passing
4. **Fix `as any`** - In helpers and split files
5. **Verify** - Coverage, circular deps, type safety
6. **Delete original** - After all splits verified

**For each file**:
- [ ] Analyze and plan split (1 hour)
- [ ] Extract shared utilities (2 hours)
- [ ] Create split files (3-4 hours)
- [ ] Fix `as any` instances (2-3 hours)
- [ ] Verify and cleanup (1 hour)

**Expected Outcome**:
- 5 large files → 15 split files (all <600 lines)
- `as any` reduced significantly in each file
- All tests passing
- Coverage maintained

**Acceptance Criteria**:
- [ ] All 5 files split successfully
- [ ] Each split file <600 lines
- [ ] All tests passing for each file
- [ ] Coverage maintained ≥ baseline for each file
- [ ] `as any` reduced 80%+ in split files
- [ ] No circular dependencies

**Estimated Time**: 40-50 hours (8-10 hours per file × 5 files)

---

### Step 3.5: Address Remaining Medium Files (600-800 lines)

**Purpose**: Split files in 600-800 line range if they have clear split boundaries

**Prerequisites**:
- [ ] Step 3.4 complete (all large files split)
- [ ] Full test suite passing

**Files to Evaluate** (600-800 line range):

From the baseline analysis, identify files 600-800 lines:
- [ ] meshDeployer.test.ts (728 lines) - already refactored in Step 2
- [ ] shared.test.ts (725 lines) - prerequisite handlers shared logic
- [ ] installHandler.test.ts (696 lines) - prerequisite install handler
- [ ] checkHandler.test.ts (693 lines) - prerequisite check handler
- [ ] fieldValidation.test.ts (640 lines) - field validation logic
- [ ] createHandler.test.ts (635 lines) - project creation handler
- [ ] lifecycleHandlers.test.ts (626 lines) - lifecycle management

**Decision Criteria for Splitting**:

For each file, evaluate:
1. **Clear split boundaries?** - Multiple distinct feature areas?
2. **High `as any` count?** - >20 instances suggesting complexity?
3. **Navigation difficulty?** - Hard to find specific tests?

**If YES to 2+ criteria**: Split file
**If NO to all criteria**: Keep as-is, just fix `as any`

**Implementation**:

1. **Evaluate each file**
   ```bash
   # Check describe structure
   grep -n "describe(" [file]

   # Count as any
   grep -c "as any" [file]

   # Check line distribution
   wc -l [file]
   ```
   - [ ] Document split decision for each file
   - [ ] If splitting, identify boundaries

2. **Split files with clear boundaries** (apply same pattern as Step 3.4)
   - [ ] Extract shared utilities
   - [ ] Create split files
   - [ ] Fix `as any`
   - [ ] Verify

3. **Fix `as any` in files kept as-is**
   - [ ] Search for `as any`: `grep -n "as any" [file]`
   - [ ] Replace with proper types
   - [ ] Run tests after each fix

**Expected Outcome**:
- 3-5 files split (if boundaries clear)
- Remaining files: `as any` reduced 80%+
- All tests passing

**Acceptance Criteria**:
- [ ] All 7 files evaluated with documented decisions
- [ ] Split files (if any) <600 lines each
- [ ] `as any` reduced to <50 total across all files in this range
- [ ] All tests passing
- [ ] Coverage maintained

**Estimated Time**: 12-16 hours

---

### Step 3.6: Global `as any` Cleanup and Verification

**Purpose**: Final sweep to eliminate remaining `as any` instances across entire test suite

**Prerequisites**:
- [ ] Steps 3.2-3.5 complete (all large/medium files split and cleaned)
- [ ] Full test suite passing

**Tasks**:

1. **Count remaining `as any` instances**
   ```bash
   # Total count
   grep -r "as any" tests --include="*.test.ts" | wc -l

   # Per file breakdown (top 20)
   find tests -name "*.test.ts" -exec bash -c 'echo "$(grep -c "as any" "$1" 2>/dev/null || echo 0) $1"' _ {} \; | awk '$1 > 0' | sort -rn | head -20
   ```
   - [ ] Target: <50 total `as any` instances (from baseline 252)
   - [ ] Document remaining instances and reasons

2. **Categorize remaining `as any` instances**
   - [ ] **Acceptable**: Production code limitations (document with TODO)
   - [ ] **Fixable**: Can be replaced with proper types
   - [ ] **Unsafe**: Need immediate fix (security, critical paths)

3. **Fix remaining fixable instances**
   ```bash
   # Fix by category
   # 1. Mock factories
   # 2. Type assertions
   # 3. Test data builders
   ```
   - [ ] Replace `as any` with jest.Mocked<Type>
   - [ ] Use Partial<Type> for incomplete objects
   - [ ] Add type guards where needed
   - [ ] Run tests after each fix

4. **Document production code type issues**
   - [ ] Create `.rptc/plans/test-quality-verification-remediation/type-issues-discovered.md`
   - [ ] List all production code type mismatches found
   - [ ] Prioritize: Critical (fix now), Important (next sprint), Low (technical debt)
   - [ ] Create GitHub issues for production type fixes

5. **Verify no circular dependencies introduced**
   ```bash
   # Full test suite check
   npx madge --circular tests/

   # Feature-specific checks
   npx madge --circular tests/features/authentication
   npx madge --circular tests/features/mesh
   npx madge --circular tests/features/prerequisites
   ```
   - [ ] Zero circular dependencies in test code
   - [ ] Document any found and resolve

6. **Generate final metrics**
   ```bash
   # File counts
   find tests -name "*.test.ts" | wc -l
   find tests -name "*testHelpers.ts" | wc -l

   # Line count distribution
   find tests -name "*.test.ts" -exec wc -l {} + | awk '$1 > 600' | wc -l

   # as any count
   grep -r "as any" tests --include="*.test.ts" | wc -l

   # Coverage
   npm test -- --coverage
   ```
   - [ ] All files <600 lines (target: 100%)
   - [ ] `as any` <50 instances (from 252, target: 80%+ reduction)
   - [ ] Coverage maintained ≥85%

**Expected Outcome**:
- `as any` reduced from 252 to <50 (80%+ reduction achieved)
- All test files <600 lines
- Production code type issues documented
- No circular dependencies
- Full test suite passing

**Acceptance Criteria**:
- [ ] `as any` count <50 total (80%+ reduction from baseline 252)
- [ ] Zero files >600 lines
- [ ] type-issues-discovered.md created with production code issues
- [ ] No circular dependencies: `npx madge --circular tests/` returns empty
- [ ] Full test suite passes: `npm test`
- [ ] Coverage maintained ≥85%
- [ ] TypeScript compilation clean: `npx tsc --noEmit`

**Estimated Time**: 6-8 hours

---

## Expected Outcome

After completing Step 3:

- **File Organization**: All 25 large files split into focused files <600 lines each
- **Type Safety**: `as any` reduced from 252 to <50 instances (80%+ reduction)
- **Maintainability**: Easier navigation, clear feature separation, better test organization
- **Test Suite Health**: All tests passing, coverage maintained ≥85%, no circular dependencies
- **Production Quality**: Type issues discovered and documented for remediation
- **Development Speed**: Faster test file navigation, clearer test structure

**Demonstrable success**:
```bash
# File size check (should show zero files >600 lines)
find tests -name "*.test.ts" -exec wc -l {} + | awk '$1 > 600'
# Output: (empty - success!)

# as any count (should show <50)
grep -r "as any" tests --include="*.test.ts" | wc -l
# Output: 45 (or similar <50 - success!)

# Full test suite
npm test
# PASS - all tests passing

# Coverage check
npm test -- --coverage
# Coverage: 85.3% (maintained - success!)

# Circular dependency check
npx madge --circular tests/
# Output: (empty - success!)
```

---

## Acceptance Criteria

### Quantitative Metrics

- [ ] File count: 25 files >600 lines → 0 files >600 lines (100% split)
- [ ] Largest file: Max 600 lines (down from 1384 lines baseline)
- [ ] `as any` reduction: 252 → <50 instances (80%+ reduction)
- [ ] Test helpers created: ~8-10 testHelpers.ts files for shared utilities
- [ ] Coverage maintained: ≥85% overall, no file regression >1%
- [ ] Circular dependencies: 0 (verified via madge)

### Qualitative Criteria

- [ ] Split files organized by clear feature boundaries (not arbitrary line counts)
- [ ] Test helpers extracted and reused across split files
- [ ] Type safety improved with proper jest.Mocked<Type> and Partial<Type>
- [ ] Production code type issues documented in type-issues-discovered.md
- [ ] Test organization improves navigation (clear file names, focused scope)
- [ ] TypeScript compilation clean (npx tsc --noEmit passes)

### Regression Prevention

- [ ] Full test suite passes (`npm test` all green)
- [ ] No new test timeouts introduced
- [ ] No circular dependencies introduced (verified via madge)
- [ ] Coverage maintained ≥85% overall
- [ ] Test execution time not increased >10%

---

## Dependencies from Other Steps

**Blocked by**:
- [x] Step 1: Fix React 19 Skipped Tests (COMPLETE - stable baseline established)
- [x] Step 2: Reduce Mock-Heavy Tests (COMPLETE - quality improvements established)

**Rationale**: Steps 1-2 establish stable baseline and improve test quality. Step 3 builds on this foundation to improve test organization and type safety.

**Blocks**:
- Step 4: Expand Unit Test Coverage (benefits from clear test organization)
- Step 5: Document Improvements (needs final metrics from Step 3)

**Rationale**: Better test organization (Step 3) makes it easier to identify coverage gaps (Step 4) and provides accurate metrics for documentation (Step 5).

---

## Integration Notes

### Madge for Circular Dependency Detection

Use madge throughout this step to ensure no circular dependencies introduced:

```bash
# Install madge (Step 3.1)
npm install --save-dev madge

# Check after each split
npx madge --circular tests/features/authentication/handlers

# Full suite check
npx madge --circular tests/

# Visualize dependencies (optional, for complex cases)
npx madge --circular --image circular-deps.svg tests/
```

**When to use madge**:
- After extracting shared test helpers (verify helpers don't create cycles)
- After creating each split file (verify imports are clean)
- Before deleting original file (final verification)
- After Step 3.6 (comprehensive final check)

### TypeScript Strict Mode Considerations

When fixing `as any`, enable strict type checking:

```bash
# Check types without running tests
npx tsc --noEmit --project tsconfig.json

# If errors found, iterative fix approach:
# 1. Fix errors in production code (create issues for later if needed)
# 2. Update test types to match production
# 3. Use proper mocks with jest.Mocked<Type>
```

**Common type fixes**:
```typescript
// Pattern 1: Mock factory with complete type
const mockService: jest.Mocked<ServiceType> = {
  method1: jest.fn(),
  method2: jest.fn(),
  // ... all required methods
};

// Pattern 2: Partial for incomplete objects
const partialConfig: Partial<ConfigType> = {
  requiredField: 'value',
  // Other fields optional
};

// Pattern 3: Type guard for narrowing
function isValidResult(result: unknown): result is ValidType {
  return typeof result === 'object' && result !== null && 'id' in result;
}

// Usage
if (isValidResult(result)) {
  // TypeScript knows result is ValidType here
  console.log(result.id);
}
```

### Production Code Type Issues

If removing `as any` exposes production code type issues:

1. **Document the issue**:
   ```markdown
   ## Production Type Issue: AuthManager.login return type

   **File**: src/features/authentication/services/authenticationService.ts
   **Line**: 145
   **Issue**: login() declared as returning AuthResult but actually returns AuthResult | null
   **Impact**: Tests must cast to handle null case
   **Fix**: Update production code type to AuthResult | null
   **Priority**: Medium (not blocking, but type safety improvement)
   **GitHub Issue**: #123
   ```

2. **Decision point**:
   - **Fix now**: If critical security/correctness issue
   - **Fix later**: If low-impact type mismatch
   - **Document with TODO**: Add comment in test with issue reference

3. **Test update strategies**:
   ```typescript
   // Option 1: Add type assertion with TODO
   const result = await authManager.login() as AuthResult; // TODO: Fix #123 - should handle null

   // Option 2: Handle null case in test
   const result = await authManager.login();
   if (result === null) {
     throw new Error('Login failed');
   }
   // result is AuthResult here

   // Option 3: Fix production code immediately
   // Update authenticationService.ts return type to AuthResult | null
   // Update test to handle both cases
   ```

### Shared Test Helpers Organization

Organize test helpers by feature area:

```text
tests/
├── features/
│   ├── authentication/
│   │   ├── handlers/
│   │   │   ├── testHelpers.ts           # Shared for handler tests
│   │   │   ├── authenticationHandlers-checkAuth.test.ts
│   │   │   └── authenticationHandlers-authenticate.test.ts
│   │   └── services/
│   │       ├── entityTestHelpers.ts     # Shared for entity service tests
│   │       ├── adobeEntityService-organizations.test.ts
│   │       └── adobeEntityService-projects.test.ts
│   └── mesh/
│       ├── testHelpers.ts               # Shared for mesh tests
│       └── services/
│           └── meshDeployer.test.ts
└── core/
    ├── state/
    │   ├── stateTestHelpers.ts          # Shared for state tests
    │   ├── stateManager-read.test.ts
    │   └── stateManager-write.test.ts
    └── communication/
        └── webviewCommunicationManager.test.ts
```

**Helper file naming convention**:
- `testHelpers.ts` - General helpers for feature area
- `[feature]TestHelpers.ts` - Specific helpers (e.g., entityTestHelpers.ts)

**Helper file structure**:
```typescript
// testHelpers.ts structure

// 1. Imports
import type { ... } from '@/types';

// 2. Mock data (exported constants)
export const mockOrg: AdobeOrg = { ... };
export const mockProject: AdobeProject = { ... };

// 3. Factory functions (exported functions)
export function createMockHandlerContext(
  overrides?: Partial<HandlerContext>
): jest.Mocked<HandlerContext> {
  // ...
}

// 4. Test utilities (exported helper functions)
export function expectValidAuthState(state: AuthState): void {
  expect(state).toHaveProperty('isAuthenticated');
  // ...
}
```

---

## Progress Tracking

**Current Step**: Step 3 of 6

**Previous Step**: Step 2 - Reduce Mock-Heavy Tests (COMPLETE)

**Next Step**: Step 4 - Expand Unit Test Coverage

**Overall Progress**: 33% (2/6 steps complete)

**Estimated Remaining Time**: 68-108 hours across Steps 4-6

---

## Estimated Time

**Total for Step 3**: 77-98 hours

**Breakdown**:
- Step 3.1: Baseline and File Identification: 3-4 hours
- Step 3.2: Split authenticationHandlers.test.ts: 8-10 hours
- Step 3.3: Split adobeEntityService.test.ts: 8-10 hours
- Step 3.4: Split Remaining Large Files (5 files): 40-50 hours
- Step 3.5: Address Medium Files (600-800 lines): 12-16 hours
- Step 3.6: Global `as any` Cleanup: 6-8 hours

**Risk buffer**: +10 hours if production code type issues require immediate fixes

---

**Implementation Note**: Work incrementally on file splitting. Complete one large file split (extract helpers, create splits, fix types, verify) before moving to next file. This prevents overwhelming debugging sessions and isolates issues quickly. Run madge after each split to catch circular dependencies early.

**Reference**:
- File organization: Keep splits focused on single feature/entity/operation
- Type safety: Prefer proper types over `unknown` widening
- Production issues: Document for later fix unless critical security/correctness concern
- Testing best practices: See testing-guide.md (SOP) for test organization patterns
