# Step 3: File Splitting (Priority 1 & 2)

## Purpose

Split 7 large test files (Priority 1: 3 files, 3,057 lines; Priority 2: 4 files, 3,475 lines) into focused, maintainable files following the playbook established in Step 2. This step achieves 40-50% memory reduction target by breaking down memory-intensive test files into smaller units.

**Why this is the LARGEST step:** File splitting requires careful extraction of shared utilities, precise boundary identification, and validation for each of 7 files. Each split creates 4-7 new files plus .testUtils.ts, totaling ~35 new files created.

**Why this comes after Step 2:** Playbook from Step 2 provides systematic split process (4-phase approach), .testUtils.ts pattern, and decision criteria. Step 1 baseline metrics identify which files to target for maximum memory impact.

---

## Prerequisites

- [x] Step 1 complete: Baseline metrics captured, identifies top 7 memory-heavy files
- [x] Step 2 complete: Playbook created at `docs/testing/test-file-splitting-playbook.md`
- [x] Step 2 complete: ESLint max-lines rule configured (500-line warning)
- [ ] Step 2 playbook reviewed: Understand 4-phase split process (Analysis → Utilities → Split → Validation)
- [ ] Existing .testUtils.ts files examined for pattern reference

---

## Tests to Write First

**CRITICAL:** Each file split MUST validate tests still pass and coverage maintained.

### Test 1: Priority 1 File 1 - dashboardHandlers.test.ts Split Validation

- [ ] **Test:** Verify all dashboard handler tests pass after split
  - **Given:** dashboardHandlers.test.ts split into 5 files + dashboardHandlers.testUtils.ts
  - **When:** Run `npm test -- tests/features/dashboard/handlers/dashboardHandlers-`
  - **Then:** All tests pass, 0 failures, coverage ≥92% (baseline: 92%)
  - **File:** Validation via jest command, not dedicated test file

### Test 2: Priority 1 File 2 - installHandler.test.ts Split Validation

- [ ] **Test:** Verify all install handler tests pass after split
  - **Given:** installHandler.test.ts split into 7 files + installHandler.testUtils.ts
  - **When:** Run `npm test -- tests/features/prerequisites/handlers/installHandler-`
  - **Then:** All tests pass, 0 failures, coverage maintained
  - **File:** Validation via jest command

### Test 3: Priority 1 File 3 - PrerequisitesStep.test.tsx Split Validation

- [ ] **Test:** Verify all prerequisites step tests pass after split
  - **Given:** PrerequisitesStep.test.tsx split into 6 files + PrerequisitesStep.testUtils.tsx
  - **When:** Run `npm test -- tests/features/prerequisites/ui/steps/PrerequisitesStep-`
  - **Then:** All tests pass, 0 failures, coverage maintained
  - **File:** Validation via jest command

### Test 4: Priority 2 Files (4 files) Split Validation

- [ ] **Test:** Verify ComponentRegistryManager tests pass after split
  - **Given:** ComponentRegistryManager.test.ts split into 5 files
  - **When:** Run `npm test -- tests/features/components/services/ComponentRegistryManager-`
  - **Then:** All tests pass, coverage maintained

- [ ] **Test:** Verify stalenessDetector tests pass after split
  - **Given:** stalenessDetector.test.ts split into 5 files
  - **When:** Run `npm test -- tests/features/mesh/services/stalenessDetector-`
  - **Then:** All tests pass, coverage maintained

- [ ] **Test:** Verify PrerequisitesManager tests pass after split
  - **Given:** PrerequisitesManager.test.ts split into 5 files
  - **When:** Run `npm test -- tests/features/prerequisites/services/PrerequisitesManager-`
  - **Then:** All tests pass, coverage maintained

- [ ] **Test:** Verify adobeEntityService-organizations tests pass after split
  - **Given:** adobeEntityService-organizations.test.ts split into 4 files
  - **When:** Run `npm test -- tests/features/authentication/services/adobeEntityService-organizations-`
  - **Then:** All tests pass, coverage maintained

### Test 5: ESLint Validation Post-Split

- [ ] **Test:** Verify no split file exceeds 500-line threshold
  - **Given:** All 7 Priority files split into smaller files
  - **When:** Run `npm run lint:eslint tests/`
  - **Then:** 0 max-lines warnings for newly split files (all <500 lines)
  - **File:** Validation via eslint command

### Test 6: Memory Reduction Validation

- [ ] **Test:** Verify memory usage reduced by 40-50% for Priority 1 files
  - **Given:** Baseline metrics from Step 1, split files executed
  - **When:** Run memory profiling on Priority 1 test suite: `npm test -- tests/features/dashboard/ tests/features/prerequisites/handlers/ tests/features/prerequisites/ui/steps/`
  - **Then:** Memory usage reduced by 40-50% compared to baseline (captured in `docs/testing/baseline-metrics.md`)
  - **File:** Validation via baseline comparison script (from Step 1)

---

## Files to Create/Modify

### Priority 1 Files to Split (3 files → ~18 new files):

**File 1: dashboardHandlers.test.ts (792 lines → 5 files + utilities)**

- [ ] **SPLIT:** `tests/features/dashboard/handlers/dashboardHandlers.test.ts` (DELETE after split)

**CREATE (6 files):**
- [ ] `tests/features/dashboard/handlers/dashboardHandlers.testUtils.ts` - Shared mocks, mock project factory
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-requestStatus.test.ts` (~160 lines) - handleRequestStatus tests (lines 95-225)
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-unknownDeployed.test.ts` (~140 lines) - unknownDeployedState handling (lines 226-366)
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-deployMesh.test.ts` (~120 lines) - handleDeployMesh tests (lines 517-637)
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-reAuthenticate.test.ts` (~130 lines) - handleReAuthenticate tests (lines 553-683)
- [ ] `tests/features/dashboard/handlers/dashboardHandlers-openDevConsole.test.ts` (~150 lines) - handleOpenDevConsole security tests (lines 680-792)

**File 2: installHandler.test.ts (1,198 lines → 7 files + utilities)**

- [ ] **SPLIT:** `tests/features/prerequisites/handlers/installHandler.test.ts` (DELETE after split)

**CREATE (8 files):**
- [ ] `tests/features/prerequisites/handlers/installHandler.testUtils.ts` - Shared prerequisite mocks, factories
- [ ] `tests/features/prerequisites/handlers/installHandler-happyPath.test.ts` (~180 lines) - Happy path tests (lines 236-416)
- [ ] `tests/features/prerequisites/handlers/installHandler-errorHandling.test.ts` (~145 lines) - Error handling tests (lines 417-561)
- [ ] `tests/features/prerequisites/handlers/installHandler-shellOptions.test.ts` (~107 lines) - Shell option tests for fnm (lines 562-668)
- [ ] `tests/features/prerequisites/handlers/installHandler-nodeVersions.test.ts` (~86 lines) - Node version parameter tests (lines 669-754)
- [ ] `tests/features/prerequisites/handlers/installHandler-versionSatisfaction.test.ts` (~83 lines) - Version satisfaction tests (lines 755-837)
- [ ] `tests/features/prerequisites/handlers/installHandler-edgeCases.test.ts` (~159 lines) - Edge cases (lines 907-1065)
- [ ] `tests/features/prerequisites/handlers/installHandler-adobeCLI.test.ts` (~132 lines) - Adobe I/O CLI unified progress (lines 1066-1198)

**File 3: PrerequisitesStep.test.tsx (1,067 lines → 6 files + utilities)**

- [ ] **SPLIT:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx` (DELETE after split)

**CREATE (7 files):**
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep.testUtils.tsx` - Shared React setup, mock factories
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-checking.test.tsx` (~152 lines) - Happy path checking (lines 39-190)
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-installation.test.tsx` (~146 lines) - Installation flow (lines 191-336)
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-recheck.test.tsx` (~77 lines) - Recheck functionality (lines 337-413)
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-optional.test.tsx` (~83 lines) - Optional prerequisites (lines 414-496)
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-progress.test.tsx` (~483 lines) - Unified progress display (lines 497-979)
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-edgeCases.test.tsx` (~87 lines) - Edge cases (lines 980-1067)

---

### Priority 2 Files to Split (4 files → ~19 new files):

**File 4: ComponentRegistryManager.test.ts (955 lines → 5 files + utilities)**

- [ ] **SPLIT:** `tests/features/components/services/ComponentRegistryManager.test.ts` (DELETE after split)

**CREATE (6 files):**
- [ ] `tests/features/components/services/ComponentRegistryManager.testUtils.ts` - Shared component mocks
- [ ] `tests/features/components/services/ComponentRegistryManager-initialization.test.ts` (~190 lines) - Initialization tests
- [ ] `tests/features/components/services/ComponentRegistryManager-registration.test.ts` (~192 lines) - Component registration
- [ ] `tests/features/components/services/ComponentRegistryManager-dependencies.test.ts` (~193 lines) - Dependency resolution
- [ ] `tests/features/components/services/ComponentRegistryManager-configuration.test.ts` (~190 lines) - Configuration management
- [ ] `tests/features/components/services/ComponentRegistryManager-validation.test.ts` (~190 lines) - Validation logic

**File 5: stalenessDetector.test.ts (925 lines → 5 files + utilities)**

- [ ] **SPLIT:** `tests/features/mesh/services/stalenessDetector.test.ts` (DELETE after split)

**CREATE (6 files):**
- [ ] `tests/features/mesh/services/stalenessDetector.testUtils.ts` - Shared mesh mocks, hash utilities
- [ ] `tests/features/mesh/services/stalenessDetector-frontend.test.ts` (~185 lines) - Frontend change detection
- [ ] `tests/features/mesh/services/stalenessDetector-meshConfig.test.ts` (~185 lines) - Mesh config detection
- [ ] `tests/features/mesh/services/stalenessDetector-sourceHash.test.ts` (~185 lines) - Source hash comparison
- [ ] `tests/features/mesh/services/stalenessDetector-envVars.test.ts` (~185 lines) - Environment variable changes
- [ ] `tests/features/mesh/services/stalenessDetector-integration.test.ts` (~185 lines) - Integration scenarios

**File 6: PrerequisitesManager.test.ts (802 lines → 5 files + utilities)**

- [ ] **SPLIT:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts` (DELETE after split)

**CREATE (6 files):**
- [ ] `tests/features/prerequisites/services/PrerequisitesManager.testUtils.ts` - Shared service mocks
- [ ] `tests/features/prerequisites/services/PrerequisitesManager-checking.test.ts` (~160 lines) - Check operations
- [ ] `tests/features/prerequisites/services/PrerequisitesManager-installation.test.ts` (~160 lines) - Install operations
- [ ] `tests/features/prerequisites/services/PrerequisitesManager-caching.test.ts` (~160 lines) - Cache management
- [ ] `tests/features/prerequisites/services/PrerequisitesManager-multiVersion.test.ts` (~160 lines) - Multi-version handling
- [ ] `tests/features/prerequisites/services/PrerequisitesManager-errors.test.ts` (~162 lines) - Error handling

**File 7: adobeEntityService-organizations.test.ts (793 lines → 4 files + utilities)**

- [ ] **SPLIT:** `tests/features/authentication/services/adobeEntityService-organizations.test.ts` (DELETE after split)

**CREATE (5 files):**
- [ ] `tests/features/authentication/services/adobeEntityService-organizations.testUtils.ts` - Shared Adobe API mocks
- [ ] `tests/features/authentication/services/adobeEntityService-organizations-fetch.test.ts` (~198 lines) - Fetch operations
- [ ] `tests/features/authentication/services/adobeEntityService-organizations-caching.test.ts` (~198 lines) - Cache logic
- [ ] `tests/features/authentication/services/adobeEntityService-organizations-selection.test.ts` (~198 lines) - Selection flow
- [ ] `tests/features/authentication/services/adobeEntityService-organizations-errors.test.ts` (~199 lines) - Error scenarios

---

**Total Files:**
- **Deleted:** 7 large test files
- **Created:** ~42 files (35 split test files + 7 .testUtils files)
- **Net change:** +35 files, 0 files >500 lines

---

## Implementation Details

### RED Phase: Write Failing Tests First

**Before splitting files, establish validation mechanism:**

#### 1. Create baseline coverage snapshot

**Capture current coverage for each Priority file:**

```bash
# Priority 1 - dashboardHandlers
npm test -- tests/features/dashboard/handlers/dashboardHandlers.test.ts --coverage --coverageReporters=json-summary
cp coverage/coverage-summary.json .rptc/plans/test-suite-reorganization-memory-optimization/baseline-dashboardHandlers.json

# Priority 1 - installHandler
npm test -- tests/features/prerequisites/handlers/installHandler.test.ts --coverage --coverageReporters=json-summary
cp coverage/coverage-summary.json .rptc/plans/test-suite-reorganization-memory-optimization/baseline-installHandler.json

# Priority 1 - PrerequisitesStep
npm test -- tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx --coverage --coverageReporters=json-summary
cp coverage/coverage-summary.json .rptc/plans/test-suite-reorganization-memory-optimization/baseline-PrerequisitesStep.json

# Repeat for Priority 2 files
# (ComponentRegistryManager, stalenessDetector, PrerequisitesManager, adobeEntityService-organizations)
```

**Why RED phase:** Baseline coverage establishes minimum acceptable coverage after split. If coverage drops, split failed and must be rolled back.

---

### GREEN Phase: Minimal Implementation to Pass Tests

**For EACH of 7 Priority files, follow this 4-phase process (from Step 2 playbook):**

#### Phase 1: Analysis (BEFORE splitting)

**For each file, identify:**
1. Natural test boundaries (describe blocks)
2. Shared mocks and fixtures
3. Target split structure (4-7 files, 100-200 lines each)

**Example: dashboardHandlers.test.ts analysis:**

```bash
# Identify describe blocks
grep -n "describe(" tests/features/dashboard/handlers/dashboardHandlers.test.ts

# Output shows 5 natural boundaries:
# Line 95: handleRequestStatus
# Line 226: unknownDeployedState handling
# Line 517: handleDeployMesh
# Line 553: handleReAuthenticate
# Line 680: handleOpenDevConsole

# Target: 5 split files (~120-160 lines each) + 1 utilities file
```

#### Phase 2: Extract Shared Utilities (FIRST - Critical!)

**Create .testUtils.ts BEFORE splitting (prevents duplication):**

**Example: dashboardHandlers.testUtils.ts**

```typescript
/**
 * Shared test utilities for dashboard handler tests
 */

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';

// Mock dependencies (extracted from original file lines 17-19)
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');
jest.mock('@/core/di');

// Exported constants
export const MOCK_PROJECT_PATH = '/path/to/project';
export const MOCK_ORG_ID = 'org123';

// Exported interfaces
export interface DashboardTestMocks {
    context: HandlerContext;
    project: Project;
}

// Factory function for mock project (extracted from lines 26-68)
export function createMockProject(overrides?: Partial<Project>): Project {
    return {
        name: 'test-project',
        path: MOCK_PROJECT_PATH,
        status: 'running',
        created: new Date('2025-01-26T10:00:00.000Z'),
        lastModified: new Date('2025-01-26T12:00:00.000Z'),
        adobe: {
            organization: MOCK_ORG_ID,
            projectName: 'Test Project',
            projectId: 'project123',
            workspace: 'workspace123',
            authenticated: true,
        },
        componentInstances: {
            'citisignal-nextjs': {
                id: 'citisignal-nextjs',
                name: 'CitiSignal Next.js',
                status: 'ready',
                path: '/path/to/frontend',
                port: 3000,
            },
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                status: 'deployed',
                path: '/path/to/mesh',
                endpoint: 'https://mesh.example.com/graphql',
            },
        },
        componentConfigs: {
            'commerce-mesh': {
                endpoint: 'https://commerce.example.com/graphql',
            },
        },
        meshState: {
            envVars: {
                MESH_ID: 'mesh123',
            },
            sourceHash: 'hash123',
            lastDeployed: '2025-01-26T12:00:00.000Z',
        },
        ...overrides,
    } as unknown as Project;
}

// Setup function (extracted from lines 70-88)
export function setupDashboardMocks(): DashboardTestMocks {
    jest.clearAllMocks();

    const project = createMockProject();

    const context: HandlerContext = {
        panel: {
            webview: {
                postMessage: jest.fn(),
            },
        } as any,
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as any,
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as any,
        sendMessage: jest.fn(),
    } as any;

    return { context, project };
}
```

**Test utilities in original file:**

1. Update original file to import from .testUtils.ts
2. Run tests to verify utilities work: `npm test -- dashboardHandlers.test.ts`
3. Commit utilities extraction separately: `git add dashboardHandlers.testUtils.ts && git commit -m "refactor(tests): extract dashboard handler test utilities"`

**Repeat Phase 2 for all 7 Priority files BEFORE proceeding to Phase 3.**

---

#### Phase 3: Split Test File

**For each Priority file, create split files:**

**Example: dashboardHandlers.test.ts split**

**Split file 1: dashboardHandlers-requestStatus.test.ts**

```typescript
/**
 * Tests for handleRequestStatus handler
 *
 * Extracted from dashboardHandlers.test.ts (lines 95-225)
 */

import { handleRequestStatus } from '@/features/dashboard/handlers/dashboardHandlers';
import { setupDashboardMocks, createMockProject } from './dashboardHandlers.testUtils';

describe('dashboardHandlers - handleRequestStatus', () => {
    let mocks: ReturnType<typeof setupDashboardMocks>;

    beforeEach(() => {
        mocks = setupDashboardMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return complete project status with mesh data (Pattern B)', async () => {
        // Copy test from lines 96-106 of original file
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const result = await handleRequestStatus(mocks.context, {});

        expect(result).toEqual({
            status: 'success',
            data: expect.objectContaining({
                project: mocks.project,
                meshDeploymentNeeded: false,
            }),
        });
    });

    // Continue with remaining tests from lines 107-225...
});
```

**Split file 2: dashboardHandlers-unknownDeployed.test.ts**

```typescript
/**
 * Tests for unknownDeployedState handling
 *
 * Extracted from dashboardHandlers.test.ts (lines 226-366)
 */

import { handleRequestStatus } from '@/features/dashboard/handlers/dashboardHandlers';
import { setupDashboardMocks, createMockProject } from './dashboardHandlers.testUtils';

describe('dashboardHandlers - unknownDeployedState handling', () => {
    let mocks: ReturnType<typeof setupDashboardMocks>;

    beforeEach(() => {
        mocks = setupDashboardMocks();
    });

    // Copy tests from lines 226-366...
});
```

**Continue for remaining 3 split files (deployMesh, reAuthenticate, openDevConsole).**

**Delete original file after all splits validated:**

```bash
# Validate all split files pass
npm test -- tests/features/dashboard/handlers/dashboardHandlers-

# If all pass, delete original
git rm tests/features/dashboard/handlers/dashboardHandlers.test.ts
git add tests/features/dashboard/handlers/dashboardHandlers-*.test.ts
git commit -m "refactor(tests): split dashboardHandlers tests into focused files

- Split 792-line file into 5 focused files (120-160 lines each)
- Extracted shared utilities to dashboardHandlers.testUtils.ts
- All tests passing, coverage maintained at 92%"
```

**Repeat Phase 3 for all 7 Priority files.**

---

#### Phase 4: Validation (AFTER each split)

**For each split file, validate:**

1. **Individual file tests pass:**
   ```bash
   npm test -- tests/path/to/new-file.test.ts
   ```

2. **All related tests pass:**
   ```bash
   npm test -- tests/path/to/component-
   ```

3. **Coverage maintained:**
   ```bash
   npm test -- tests/path/to/component- --coverage
   # Compare to baseline-[component].json from RED phase
   ```

4. **ESLint clean:**
   ```bash
   npm run lint:eslint tests/path/to/component-*.test.ts
   # Should show 0 max-lines warnings (all files <500 lines)
   ```

5. **Full suite validation:**
   ```bash
   npm test
   # Ensures split doesn't break other tests
   ```

**If ANY validation fails:** Rollback split via `git reset --hard HEAD~1`, analyze failure, fix utilities or split strategy, retry.

---

### REFACTOR Phase: Improve Quality and Documentation

#### 1. Optimize test utilities based on actual usage

**After all splits complete, review .testUtils files for:**

- Unused exports (remove)
- Duplicated logic across .testUtils files (extract to `tests/helpers/`)
- Opportunities for additional factory functions
- TypeScript type improvements

**Example refactor: Extract common mock setup**

If 3+ .testUtils files have similar mock setup patterns:

```typescript
// BEFORE (duplicated in dashboardHandlers.testUtils, installHandler.testUtils, etc.)
export function setupMocks() {
    jest.clearAllMocks();
    // Common setup...
}

// AFTER (extracted to tests/helpers/mockSetup.ts)
export function setupBaseMocks() {
    jest.clearAllMocks();
    // Common setup logic shared across all test utilities
}

// dashboardHandlers.testUtils.ts imports and extends:
import { setupBaseMocks } from '@/tests/helpers/mockSetup';

export function setupDashboardMocks() {
    setupBaseMocks();
    // Dashboard-specific setup...
}
```

#### 2. Document split metrics

**Update `docs/testing/baseline-metrics.md` with post-split results:**

```markdown
## Step 3: File Splitting Results (Priority 1 & 2)

### Priority 1 Results

#### dashboardHandlers.test.ts
- **Before:** 792 lines, 1 file
- **After:** 5 files (120-160 lines each) + 1 utilities file
- **Tests:** All 47 tests passing
- **Coverage:** 92% (unchanged from baseline)
- **Memory:** 18% reduction (validated via heap profiling)
- **ESLint:** 0 warnings

#### installHandler.test.ts
- **Before:** 1,198 lines, 1 file
- **After:** 7 files (83-180 lines each) + 1 utilities file
- **Tests:** All 89 tests passing
- **Coverage:** 95% (unchanged from baseline)
- **Memory:** 22% reduction
- **ESLint:** 0 warnings

#### PrerequisitesStep.test.tsx
- **Before:** 1,067 lines, 1 file
- **After:** 6 files (77-483 lines each) + 1 utilities file
- **Tests:** All 76 tests passing
- **Coverage:** 91% (unchanged from baseline)
- **Memory:** 19% reduction
- **ESLint:** 0 warnings (note: PrerequisitesStep-progress.test.tsx at 483 lines still acceptable for unified progress tests)

**Priority 1 Total Memory Reduction:** 19.7% average (59% reduction achieved across 3 files)

### Priority 2 Results

[Document Priority 2 results similarly...]

**Overall Memory Reduction:** 45% (exceeds 40-50% target)
**Total Files Split:** 7 → 42 files
**Largest File After Split:** 483 lines (PrerequisitesStep-progress.test.tsx - acceptable for comprehensive progress tests)
**ESLint Violations:** 0 (all new files <500 lines)
```

#### 3. Create split decision log

**File:** `.rptc/plans/test-suite-reorganization-memory-optimization/split-decisions.md`

```markdown
# File Splitting Decision Log

## Priority 1 Splits

### dashboardHandlers.test.ts

**Split Strategy:** By handler function (5 natural boundaries)

**Rationale:**
- Each describe block tests single handler function
- Clear separation of concerns
- Minimal shared setup required

**Alternatives Considered:**
- Split by happy path vs errors: Rejected (would scatter related tests across files)
- Split by feature area: Rejected (handlers already feature-focused)

**Result:** ✅ 5 files, 120-160 lines each, all tests passing

---

### installHandler.test.ts

**Split Strategy:** By test category (happy path, errors, edge cases, version handling)

**Rationale:**
- Existing describe blocks align with test categories
- Version-specific tests benefit from isolation
- Error handling tests logically grouped

**Alternatives Considered:**
- Split by prerequisite type (Node, PHP, Adobe CLI): Rejected (would duplicate error handling logic)
- Keep as monolithic file: Rejected (1,198 lines far exceeds threshold)

**Result:** ✅ 7 files, 83-180 lines each, all tests passing

---

[Continue for all 7 Priority files...]
```

---

## Expected Outcome

After completing this step:

- **7 Priority files split** (Priority 1: 3 files, Priority 2: 4 files)
- **~42 new files created** (35 split test files + 7 .testUtils files)
- **0 files >500 lines** (all split files focused and maintainable)
- **40-50% memory reduction** achieved (validated via baseline comparison)
- **Coverage maintained** (≥80% overall, 100% critical paths)
- **All tests passing** (0 failures across full test suite)

**Demonstrable functionality:**

```bash
# Validate all Priority 1 splits pass
npm test -- tests/features/dashboard/handlers/dashboardHandlers-
npm test -- tests/features/prerequisites/handlers/installHandler-
npm test -- tests/features/prerequisites/ui/steps/PrerequisitesStep-

# Validate all Priority 2 splits pass
npm test -- tests/features/components/services/ComponentRegistryManager-
npm test -- tests/features/mesh/services/stalenessDetector-
npm test -- tests/features/prerequisites/services/PrerequisitesManager-
npm test -- tests/features/authentication/services/adobeEntityService-organizations-

# Validate ESLint clean (no max-lines warnings)
npm run lint:eslint tests/

# Validate memory reduction
npm run metrics:baseline  # Compare to Step 1 baseline
```

**Memory reduction demonstrated:**
- Priority 1 files: 40-50% reduction (from 3,057 lines in 3 files to ~1,800 lines in 18 files)
- Priority 2 files: 35-45% reduction (from 3,475 lines in 4 files to ~1,900 lines in 24 files)
- Overall: 40-50% memory reduction target achieved

---

## Acceptance Criteria

### Priority 1 File Splits (3 files):

- [ ] dashboardHandlers.test.ts split into 5 files + utilities, all <500 lines
- [ ] All dashboardHandlers tests passing (47 tests, 92% coverage)
- [ ] installHandler.test.ts split into 7 files + utilities, all <500 lines
- [ ] All installHandler tests passing (89 tests, 95% coverage)
- [ ] PrerequisitesStep.test.tsx split into 6 files + utilities, largest 483 lines
- [ ] All PrerequisitesStep tests passing (76 tests, 91% coverage)

### Priority 2 File Splits (4 files):

- [ ] ComponentRegistryManager.test.ts split into 5 files + utilities, all <500 lines
- [ ] stalenessDetector.test.ts split into 5 files + utilities, all <500 lines
- [ ] PrerequisitesManager.test.ts split into 5 files + utilities, all <500 lines
- [ ] adobeEntityService-organizations.test.ts split into 4 files + utilities, all <500 lines
- [ ] All Priority 2 tests passing, coverage maintained

### Validation & Quality:

- [ ] Full test suite passing: `npm test` (0 failures across all 168 test files)
- [ ] ESLint clean: `npm run lint:eslint tests/` (0 max-lines warnings for split files)
- [ ] Coverage maintained: Overall ≥80%, critical paths 100% (no reduction from baseline)
- [ ] Memory reduction validated: 40-50% reduction in test execution memory (captured in baseline-metrics.md)
- [ ] All .testUtils files follow pattern from Step 2 playbook (mocks, factories, setup functions)
- [ ] No test duplication across split files (shared logic in .testUtils)

### Documentation:

- [ ] Split metrics documented in `docs/testing/baseline-metrics.md`
- [ ] Split decisions logged in `.rptc/plans/test-suite-reorganization-memory-optimization/split-decisions.md`
- [ ] Baseline coverage snapshots captured for all 7 files (for rollback if needed)

---

## Dependencies from Other Steps

**Depends on:**

- **Step 1:** Baseline metrics identify top 7 Priority files and provide memory reduction target
- **Step 2:** Playbook provides systematic 4-phase split process, .testUtils.ts pattern, decision criteria

**Steps that depend on this step:**

- **Step 4:** CI/CD checks validate split files maintain <500-line threshold established here
- **Efficiency Review:** Post-implementation review validates memory reduction achieved

---

## Estimated Time

**10-12 hours** (distributed work recommended)

**Breakdown:**

- **Priority 1 File 1 (dashboardHandlers):** 1.5 hours
  - Analysis: 15 min
  - Utilities extraction: 30 min
  - Split files creation: 30 min
  - Validation: 15 min

- **Priority 1 File 2 (installHandler):** 2 hours (largest file, 7 splits)
  - Analysis: 20 min
  - Utilities extraction: 45 min
  - Split files creation: 45 min
  - Validation: 10 min

- **Priority 1 File 3 (PrerequisitesStep):** 1.5 hours
  - Analysis: 15 min
  - Utilities extraction: 30 min
  - Split files creation: 30 min
  - Validation: 15 min

- **Priority 2 Files (4 files):** 5 hours total (1.25 hours each on average)
  - ComponentRegistryManager: 1.5 hours
  - stalenessDetector: 1.5 hours
  - PrerequisitesManager: 1 hour
  - adobeEntityService-organizations: 1 hour

- **Refactoring & Documentation:** 2 hours
  - Optimize test utilities: 45 min
  - Document metrics: 30 min
  - Create split decision log: 45 min

**Recommended approach:**
- Day 1: Priority 1 (5 hours) - Split dashboardHandlers, installHandler, PrerequisitesStep
- Day 2: Priority 2 (5 hours) - Split ComponentRegistryManager, stalenessDetector, PrerequisitesManager, adobeEntityService
- Day 3: Refactoring (2 hours) - Optimize utilities, document results

---

## Implementation Notes

**Add notes here during TDD execution:**

### Completed Splits

- [ ] Priority 1 File 1: dashboardHandlers.test.ts
- [ ] Priority 1 File 2: installHandler.test.ts
- [ ] Priority 1 File 3: PrerequisitesStep.test.tsx
- [ ] Priority 2 File 4: ComponentRegistryManager.test.ts
- [ ] Priority 2 File 5: stalenessDetector.test.ts
- [ ] Priority 2 File 6: PrerequisitesManager.test.ts
- [ ] Priority 2 File 7: adobeEntityService-organizations.test.ts

### Actual Results

_Fill in during execution:_

**Priority 1 Memory Reduction:** [X%] (target: 40-50%)
**Priority 2 Memory Reduction:** [X%] (target: 35-45%)
**Overall Memory Reduction:** [X%] (target: 40-50%)
**Total Files Created:** [X] (estimated: ~42)
**Largest Split File:** [X lines] (threshold: <500)
**ESLint Violations:** [X] (target: 0)

### Issues Encountered

_Document any blockers or unexpected findings:_

**Example:**
- Issue: PrerequisitesStep-progress.test.tsx at 483 lines (close to threshold)
- Resolution: Acceptable due to comprehensive unified progress tests (single responsibility, would be harder to split further)
- Decision: Keep as-is, monitor if grows beyond 500 lines

---

_Step 3 created by Master Feature Planner (Step Generator Sub-Agent)_
_Status: Ready for TDD Implementation_
