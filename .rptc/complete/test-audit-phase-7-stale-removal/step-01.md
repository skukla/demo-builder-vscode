# Step 1: Identify Stale Tests (Dead Imports, Orphaned Mocks)

## Purpose

Systematically scan the test infrastructure to identify all stale tests using multiple detection methods. This step creates a comprehensive inventory before any removal occurs.

## Prerequisites

- [ ] Git working tree is clean (commit or stash pending changes)
- [ ] Full test suite runs successfully (baseline validation)
- [ ] Coverage report generated for baseline comparison

## Tests to Write First

Since this is an audit/cleanup phase, "tests" are verification scripts rather than traditional unit tests.

- [ ] **Script:** Verify test suite baseline passes
  - **Given:** Current test infrastructure exists
  - **When:** `npm test` is executed
  - **Then:** All tests pass, coverage baseline is recorded
  - **File:** Manual verification (record in notes)

## Files to Analyze

### Detection Method 1: Dead Import Analysis

Run TypeScript compiler to detect imports from non-existent modules:

```bash
# Check for TypeScript errors in tests
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "tests/.*Cannot find module"
```

**Files to Investigate:**
- [ ] Any test files with unresolved imports
- [ ] Any test files importing from moved/deleted modules

### Detection Method 2: Orphaned testUtils Files

Cross-reference all `*.testUtils.ts` files against their importers:

**Known testUtils Locations:**

Core testUtils:
- [ ] `tests/core/communication/webviewCommunicationManager.testUtils.ts`
- [ ] `tests/core/logging/debugLogger.testUtils.ts`
- [ ] `tests/core/shell/commandExecutor.testUtils.ts`
- [ ] `tests/core/shell/environmentSetup.testUtils.ts`
- [ ] `tests/core/state/stateManager.testUtils.ts`
- [ ] `tests/core/state/transientStateManager.testUtils.ts`
- [ ] `tests/core/vscode/envFileWatcherService.testUtils.ts`

Feature testUtils:
- [ ] `tests/features/authentication/handlers/authenticationHandlers-authenticate.testUtils.ts`
- [ ] `tests/features/authentication/handlers/projectHandlers.testUtils.ts`
- [ ] `tests/features/authentication/handlers/testUtils.ts`
- [ ] `tests/features/authentication/services/adobeEntityService.testUtils.ts`
- [ ] `tests/features/authentication/services/authCacheManager.testUtils.ts`
- [ ] `tests/features/authentication/services/authenticationService.testUtils.ts`
- [ ] `tests/features/authentication/services/organizationValidator.testUtils.ts`
- [ ] `tests/features/authentication/ui/hooks/useAuthStatus.testUtils.ts`
- [ ] `tests/features/authentication/ui/hooks/useSelectionStep.testUtils.ts`
- [ ] `tests/features/components/ui/hooks/useConfigNavigation.testUtils.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager.testUtils.ts`
- [ ] `tests/features/dashboard/handlers/dashboardHandlers.testUtils.ts`
- [ ] `tests/features/dashboard/ui/configure/ConfigureScreen.testUtils.ts`
- [ ] `tests/features/lifecycle/handlers/lifecycleHandlers.testUtils.ts`
- [ ] `tests/features/mesh/services/meshDeployment.testUtils.ts`
- [ ] `tests/features/mesh/services/meshDeploymentVerifier.testUtils.ts`
- [ ] `tests/features/mesh/services/stalenessDetector.testUtils.ts`
- [ ] `tests/features/mesh/ui/hooks/useMeshOperations.testUtils.ts`
- [ ] `tests/features/prerequisites/handlers/checkHandler.testUtils.ts`
- [ ] `tests/features/prerequisites/handlers/continueHandler.testUtils.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler.testUtils.ts`
- [ ] `tests/features/prerequisites/services/PrerequisitesManager.testUtils.ts`
- [ ] `tests/features/prerequisites/services/prerequisitesCacheManager.testUtils.ts`
- [ ] `tests/features/project-creation/handlers/createHandler.testUtils.ts`
- [ ] `tests/features/project-creation/helpers/envFileGenerator.testUtils.ts`
- [ ] `tests/features/projects-dashboard/testUtils.ts`
- [ ] `tests/features/sidebar/testUtils.ts`
- [ ] `tests/features/updates/services/updateManager.testUtils.ts`

Unit testUtils (potential structural drift):
- [ ] `tests/unit/prerequisites/cacheManager.testUtils.ts`
- [ ] `tests/unit/utils/progressUnifier.testUtils.ts`

Webview testUtils:
- [ ] `tests/webview-ui/shared/hooks/useAutoScroll.testUtils.ts`
- [ ] `tests/webview-ui/shared/hooks/useFocusTrap.testUtils.ts`

Global Helpers:
- [ ] `tests/helpers/handlerContextTestHelpers.ts`
- [ ] `tests/helpers/progressUnifierTestHelpers.ts`
- [ ] `tests/helpers/react-test-utils.tsx`
- [ ] `tests/testUtils/async.ts`

**Verification Command for Each:**
```bash
# For each testUtils file, check if it's imported anywhere
grep -r "from.*[filename]" tests/ --include="*.ts" --include="*.tsx"
```

### Detection Method 3: TODO/FIXME Analysis

Scan for placeholder tests that may need removal:

```bash
grep -rn "TODO\|FIXME" tests/ --include="*.ts" --include="*.tsx"
```

**Known TODO/FIXME Tests:**

- [ ] `tests/features/prerequisites/npmFallback.test.ts`
  - Line 162: TODO about installPrerequisite implementation
  - Line 188: TODO about verifying fallback command
  - Line 228: TODO about logger verification
  - **Decision Required:** Remove placeholder tests or implement feature?

### Detection Method 4: Empty Directory Detection

Identify directories with no test files:

```bash
find tests -type d -empty
find tests -type d ! -name '__mocks__' ! -name 'setup' -exec sh -c 'ls -1 "$1"/*.test.ts 2>/dev/null | wc -l | grep -q "^0$" && echo "$1"' _ {} \;
```

**Known Empty/Near-Empty Directories:**

- [ ] `tests/unit/features/eds/ui/steps/` - Completely empty
- [ ] `tests/unit/templates/` - May be empty (verify)

## Implementation Details

### RED Phase (Verification Scripts)

Create checklist document for each detection method:

```markdown
## Dead Import Analysis Results
- Date: YYYY-MM-DD
- Files with dead imports:
  - [ ] File 1: [path] - Import: [module]
  - [ ] File 2: [path] - Import: [module]

## Orphaned testUtils Results
- Date: YYYY-MM-DD
- Orphaned files:
  - [ ] File 1: [path] - Last used by: [none found]

## TODO/FIXME Analysis Results
- Date: YYYY-MM-DD
- Files with TODOs:
  - [ ] File 1: [path] - Decision: [remove/implement/keep]

## Empty Directory Results
- Date: YYYY-MM-DD
- Empty directories:
  - [ ] Dir 1: [path]
```

### GREEN Phase (Execute Analysis)

1. Run TypeScript compiler check
2. For each testUtils file, run grep search
3. Document all findings in checklist format
4. Categorize findings by action needed

### REFACTOR Phase (Consolidate)

1. Create single inventory document with all findings
2. Prioritize by confidence level (high/medium/low)
3. Document dependencies for each finding
4. Prepare for Step 2 (removal)

## Expected Outcome

- Complete inventory of all stale test candidates
- Each candidate categorized by detection method
- Each candidate has recommended action (remove/keep/investigate)
- No code changes made in this step (analysis only)

## Acceptance Criteria

- [ ] TypeScript dead import analysis completed
- [ ] All testUtils files cross-referenced for usage
- [ ] All TODO/FIXME comments catalogued
- [ ] All empty directories identified
- [ ] Inventory document created with findings
- [ ] Each finding has recommended action
- [ ] Test suite still passes (no changes made)

## Estimated Time

1-2 hours

---

## Inventory Document Template

Create file: `.rptc/plans/test-audit-phase-7-stale-removal/inventory.md`

```markdown
# Stale Test Inventory

Generated: YYYY-MM-DD

## Summary

| Category | Count | Action Required |
|----------|-------|-----------------|
| Dead Imports | X | Remove |
| Orphaned testUtils | X | Remove |
| TODO/FIXME Tests | X | Review |
| Empty Directories | X | Remove |

## Dead Imports

(List each file with dead import)

## Orphaned testUtils

(List each orphaned file)

## TODO/FIXME Tests

### File: tests/features/prerequisites/npmFallback.test.ts

**TODOs Found:**
- Line 162: `// TODO: Implement installPrerequisite method`
- Line 188: `// TODO: Verify fallback command contains`
- Line 228: `// TODO: Verify logger.warn or logger.info`

**Recommendation:** [Remove/Implement/Keep with documentation]

**Rationale:** [Why this recommendation]

## Empty Directories

(List each empty directory)

## Files Confirmed In-Use (Do Not Touch)

### tests/helpers/
- handlerContextTestHelpers.ts - Used by 22 test files
- progressUnifierTestHelpers.ts - Used by 22 test files
- react-test-utils.tsx - Used by 22 test files

### tests/testUtils/
- async.ts - Used by 1 test file

(Continue with other confirmed in-use files)
```

---

## Notes

This step is intentionally analysis-only. No files are modified or deleted. The goal is to create a comprehensive, verified inventory that Step 2 can safely act upon.

Key principle: **Verify before delete.** Every file identified for removal must have documented evidence that it is truly stale.
