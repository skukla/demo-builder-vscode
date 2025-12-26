# Step 4: Audit testUtils Files for Mock Drift

## Purpose

Review all 36 testUtils files to identify which contain JSON-derived mocks that may have drifted from the current canonical implementation. This audit classifies files by risk level to prioritize remediation work in Step 5.

**Note:** This is a DISCOVERY & DOCUMENTATION step, not a TDD step. You will not write tests in this step—instead you will systematically review existing testUtils files, categorize them by risk, and document findings. The documentation becomes input to Step 5.

## Prerequisites

- [ ] Step 3 complete (type alignment tests for logging.json) - **NOTE: Steps 1-4 are NOT strictly sequential. Steps 2, 3, and 4 can be done in parallel. Only Step 5 depends on Step 4.**
- [ ] Understanding of JSON configuration files: `templates/prerequisites.json`, `templates/components.json`, `templates/logging.json`
- [ ] Familiarity with TypeScript types derived from JSON schemas
- [ ] Access to codebase for systematic file review (grep/search tools available)

## Audit Methodology

### What Are JSON-Derived Mocks?

JSON-derived mocks are test fixtures that mirror the structure of JSON configuration files. They can drift when:

1. **Direct Schema Mocks**: Mock objects that replicate JSON file structure (e.g., `mockRawRegistry` mirrors `components.json`)
2. **Type-Based Mocks**: Mock objects based on TypeScript types that are derived from JSON schemas
3. **Inline JSON Strings**: `jest.mock` calls that return hardcoded JSON strings

### Identification Criteria

For each testUtils file, check for:

1. **Direct JSON structure references**:
   - Variables named `mock*Config`, `mock*Registry`, `mockRaw*`
   - Objects with fields like `prerequisites`, `components`, `frontends`, `backends`, `envVars`

2. **Type imports from JSON-related files**:
   - `import type { RawComponentRegistry }` from types
   - `import type { PrerequisiteDefinition }` from prerequisite types
   - `import type { LoggingConfig }` from logging types

3. **fs.readFileSync mocks returning JSON**:
   - `jest.mock('fs', () => ({ readFileSync: jest.fn().mockReturnValue(JSON.stringify({...})) }))`

4. **Factory functions creating JSON-like structures**:
   - `createMockPrerequisite()`, `createMockComponent()`, etc.

### Risk Classification

**HIGH-RISK**: Files with mocks that directly replicate JSON schema structure
- Highest probability of drift when JSON files change
- Require type alignment tests to catch drift

**MEDIUM-RISK**: Files with mocks based on types derived from JSON
- May drift if underlying types change
- Less direct but still coupled to JSON schemas

**LOW-RISK**: Files with pure infrastructure mocks (VS Code, Node.js APIs)
- No JSON coupling
- Drift unlikely unless API changes

## Files to Review (36 Total)

### Core Infrastructure (7 files)

| File | Path |
|------|------|
| webviewCommunicationManager | `tests/core/communication/webviewCommunicationManager.testUtils.ts` |
| debugLogger | `tests/core/logging/debugLogger.testUtils.ts` |
| commandExecutor | `tests/core/shell/commandExecutor.testUtils.ts` |
| environmentSetup | `tests/core/shell/environmentSetup.testUtils.ts` |
| stateManager | `tests/core/state/stateManager.testUtils.ts` |
| transientStateManager | `tests/core/state/transientStateManager.testUtils.ts` |
| envFileWatcherService | `tests/core/vscode/envFileWatcherService.testUtils.ts` |

### Authentication Feature (8 files)

| File | Path |
|------|------|
| authenticationHandlers-authenticate | `tests/features/authentication/handlers/authenticationHandlers-authenticate.testUtils.ts` |
| projectHandlers | `tests/features/authentication/handlers/projectHandlers.testUtils.ts` |
| adobeEntityService | `tests/features/authentication/services/adobeEntityService.testUtils.ts` |
| authCacheManager | `tests/features/authentication/services/authCacheManager.testUtils.ts` |
| authenticationService | `tests/features/authentication/services/authenticationService.testUtils.ts` |
| organizationValidator | `tests/features/authentication/services/organizationValidator.testUtils.ts` |
| useAuthStatus | `tests/features/authentication/ui/hooks/useAuthStatus.testUtils.ts` |
| useSelectionStep | `tests/features/authentication/ui/hooks/useSelectionStep.testUtils.ts` |

### Components Feature (2 files)

| File | Path |
|------|------|
| ComponentRegistryManager | `tests/features/components/services/ComponentRegistryManager.testUtils.ts` |
| useConfigNavigation | `tests/features/components/ui/hooks/useConfigNavigation.testUtils.ts` |

### Dashboard Feature (2 files)

| File | Path |
|------|------|
| dashboardHandlers | `tests/features/dashboard/handlers/dashboardHandlers.testUtils.ts` |
| ConfigureScreen | `tests/features/dashboard/ui/configure/ConfigureScreen.testUtils.ts` |

### Lifecycle Feature (1 file)

| File | Path |
|------|------|
| lifecycleHandlers | `tests/features/lifecycle/handlers/lifecycleHandlers.testUtils.ts` |

### Mesh Feature (4 files)

| File | Path |
|------|------|
| meshDeployment | `tests/features/mesh/services/meshDeployment.testUtils.ts` |
| meshDeploymentVerifier | `tests/features/mesh/services/meshDeploymentVerifier.testUtils.ts` |
| stalenessDetector | `tests/features/mesh/services/stalenessDetector.testUtils.ts` |
| useMeshOperations | `tests/features/mesh/ui/hooks/useMeshOperations.testUtils.ts` |

### Prerequisites Feature (5 files)

| File | Path |
|------|------|
| checkHandler | `tests/features/prerequisites/handlers/checkHandler.testUtils.ts` |
| continueHandler | `tests/features/prerequisites/handlers/continueHandler.testUtils.ts` |
| installHandler | `tests/features/prerequisites/handlers/installHandler.testUtils.ts` |
| PrerequisitesManager | `tests/features/prerequisites/services/PrerequisitesManager.testUtils.ts` |
| prerequisitesCacheManager | `tests/features/prerequisites/services/prerequisitesCacheManager.testUtils.ts` |

### Project Creation Feature (2 files)

| File | Path |
|------|------|
| createHandler | `tests/features/project-creation/handlers/createHandler.testUtils.ts` |
| envFileGenerator | `tests/features/project-creation/helpers/envFileGenerator.testUtils.ts` |

### Updates Feature (1 file)

| File | Path |
|------|------|
| updateManager | `tests/features/updates/services/updateManager.testUtils.ts` |

### Unit Tests (2 files)

| File | Path |
|------|------|
| cacheManager | `tests/unit/prerequisites/cacheManager.testUtils.ts` |
| progressUnifier | `tests/unit/utils/progressUnifier.testUtils.ts` |

### Webview UI (2 files)

| File | Path |
|------|------|
| useAutoScroll | `tests/webview-ui/shared/hooks/useAutoScroll.testUtils.ts` |
| useFocusTrap | `tests/webview-ui/shared/hooks/useFocusTrap.testUtils.ts` |

## Expected Outcome: Categorized List

### HIGH-RISK Files (Direct JSON Schema Mocks)

These files contain mocks that directly replicate JSON configuration structures:

| File | JSON Source | Mock Objects | Notes |
|------|-------------|--------------|-------|
| `ComponentRegistryManager.testUtils.ts` | `components.json` | `mockRawRegistry`, `mockRawRegistryV3` | **EXEMPLARY** - Has versioned mocks and documentation |
| `checkHandler.testUtils.ts` | `prerequisites.json` | `mockConfig`, `mockAdobeCliPrereq` | Contains `PrerequisiteDefinition` structure |
| `PrerequisitesManager.testUtils.ts` | `prerequisites.json`, `components.json` | `mockConfig`, fs mock | Has fs.readFileSync mock returning JSON |

### MEDIUM-RISK Files (Type-Based Mocks)

These files contain mocks based on types that derive from JSON schemas:

| File | Related Types | Mock Objects | Notes |
|------|--------------|--------------|-------|
| `stateManager.testUtils.ts` | `Project` | `createMockProject()` | Project type may include component refs |
| `dashboardHandlers.testUtils.ts` | `Project` | `createMockProject()` | Has `componentInstances`, `meshState` |
| `stalenessDetector.testUtils.ts` | `Project` | `createMockProject*()` | Multiple project factory functions |
| `updateManager.testUtils.ts` | Component types | `createMockProject()`, `createMockRelease()` | Component version tracking |
| `cacheManager.testUtils.ts` | `PrerequisiteStatus` | `createMockPrerequisiteStatus()` | Type alignment needed |
| `prerequisitesCacheManager.testUtils.ts` | `PrerequisiteStatus` | Factory functions | Similar to cacheManager |
| `authenticationService.testUtils.ts` | `AdobeOrg`, `AdobeProject` | `mockOrg`, `mockProject` | Adobe entity types |

### LOW-RISK Files (Infrastructure Mocks Only)

These files contain only VS Code API mocks or Node.js infrastructure mocks with no JSON coupling:

| File | Mock Type | Notes |
|------|-----------|-------|
| `webviewCommunicationManager.testUtils.ts` | VS Code webview | No JSON |
| `debugLogger.testUtils.ts` | VS Code OutputChannel | No JSON |
| `commandExecutor.testUtils.ts` | CommandExecutor interface | No JSON |
| `environmentSetup.testUtils.ts` | Environment setup | No JSON |
| `transientStateManager.testUtils.ts` | Transient state | No JSON |
| `envFileWatcherService.testUtils.ts` | File watcher | No JSON |
| `authenticationHandlers-authenticate.testUtils.ts` | Auth handlers | No JSON |
| `projectHandlers.testUtils.ts` | Project handlers | No JSON |
| `adobeEntityService.testUtils.ts` | Adobe SDK | No JSON |
| `authCacheManager.testUtils.ts` | Auth cache | No JSON |
| `organizationValidator.testUtils.ts` | Validation | No JSON |
| `useAuthStatus.testUtils.ts` | React hook | No JSON |
| `useSelectionStep.testUtils.ts` | React hook | No JSON |
| `useConfigNavigation.testUtils.ts` | React hook | No JSON |
| `ConfigureScreen.testUtils.ts` | React component | No JSON |
| `lifecycleHandlers.testUtils.ts` | Lifecycle | No JSON |
| `meshDeployment.testUtils.ts` | Mesh deployment | No JSON |
| `meshDeploymentVerifier.testUtils.ts` | Mesh verifier | No JSON |
| `useMeshOperations.testUtils.ts` | React hook | No JSON |
| `continueHandler.testUtils.ts` | Handler | No JSON |
| `installHandler.testUtils.ts` | Handler | No JSON |
| `createHandler.testUtils.ts` | Handler | No JSON |
| `envFileGenerator.testUtils.ts` | Env file | No JSON |
| `progressUnifier.testUtils.ts` | Progress UI | No JSON |
| `useAutoScroll.testUtils.ts` | React hook | No JSON |
| `useFocusTrap.testUtils.ts` | React hook | No JSON |

## Audit Checklist

For each HIGH-RISK and MEDIUM-RISK file, verify:

- [ ] Mock structure matches current JSON schema
- [ ] All required fields are present
- [ ] Field types are correct (string, number, array, etc.)
- [ ] Nested objects match current nesting
- [ ] Optional vs required fields are correctly represented
- [ ] No deprecated fields are used
- [ ] Documentation indicates JSON source (if applicable)

## Acceptance Criteria

- [x] All 39 testUtils files reviewed (3 more than originally estimated)
- [x] Each file classified as HIGH, MEDIUM, or LOW risk
- [x] HIGH-RISK files have specific mock objects identified (6 files)
- [x] MEDIUM-RISK files have related types documented (9 files)
- [x] LOW-RISK files confirmed to have no JSON coupling (24 files)
- [x] Audit findings documented in this step file
- [x] Step 5 can use this classification to prioritize remediation

## ✅ AUDIT RESULTS (Completed 2025-01-XX)

**Total Files Audited:** 39 testUtils files

**HIGH-RISK Count:** 6 files
**MEDIUM-RISK Count:** 9 files
**LOW-RISK Count:** 24 files

### HIGH-RISK Files (Direct JSON Schema Mocks)

| File | JSON Source | Mock Objects | Status |
|------|-------------|--------------|--------|
| `ComponentRegistryManager.testUtils.ts` | `components.json` | `mockRawRegistry` | ✅ EXEMPLARY - Already migrated in Step 1 |
| `checkHandler.testUtils.ts` | `prerequisites.json` | `mockConfig`, `mockAdobeCliPrereq` | Needs Step 5 validation |
| `continueHandler.testUtils.ts` | `prerequisites.json` | `mockConfig` | Needs Step 5 validation |
| `installHandler.testUtils.ts` | `prerequisites.json` | `mockConfig` | Needs Step 5 validation |
| `PrerequisitesManager.testUtils.ts` | `prerequisites.json` | `mockConfig`, fs.readFileSync mock | Needs Step 5 validation |
| `createHandler.testUtils.ts` | `prerequisites.json` | `mockConfig` | Needs Step 5 validation |

### MEDIUM-RISK Files (Type-Based Mocks)

| File | Related Types | Mock Objects | Status |
|------|--------------|--------------|--------|
| `stateManager.testUtils.ts` | `Project` | `createMockProject()` | May need component refs check |
| `authCacheManager.testUtils.ts` | `Project` | `createMockProject()` | May need component refs check |
| `dashboardHandlers.testUtils.ts` | `Project` | `createMockProject()` | Has `componentInstances`, `meshState` |
| `stalenessDetector.testUtils.ts` | `Project` | `createMockProject*()` | Multiple factory functions |
| `projects-dashboard/testUtils.ts` | `Project` | `createMockProject()` | NEW - Not in original plan |
| `sidebar/testUtils.ts` | `Project` | `createMockProject()` | NEW - Not in original plan |
| `updateManager.testUtils.ts` | Component types | `createMockProject()`, `createMockRelease()` | Component version tracking |
| `prerequisitesCacheManager.testUtils.ts` | `PrerequisiteStatus` | Factory functions | Type alignment needed |
| `cacheManager.testUtils.ts` | `PrerequisiteStatus` | `createMockPrerequisiteStatus()` | Type alignment needed |

### LOW-RISK Files (24 files - Infrastructure Mocks Only)

All remaining 24 files contain only VS Code API mocks or Node.js infrastructure mocks with no JSON coupling:
- `webviewCommunicationManager.testUtils.ts`, `debugLogger.testUtils.ts`, `commandExecutor.testUtils.ts`
- `environmentSetup.testUtils.ts`, `transientStateManager.testUtils.ts`, `envFileWatcherService.testUtils.ts`
- `authenticationHandlers-authenticate.testUtils.ts`, `projectHandlers.testUtils.ts`, `testUtils.ts` (auth handlers)
- `adobeEntityService.testUtils.ts`, `authenticationService.testUtils.ts`, `organizationValidator.testUtils.ts`
- `useAuthStatus.testUtils.ts`, `useSelectionStep.testUtils.ts`, `useConfigNavigation.testUtils.ts`
- `ConfigureScreen.testUtils.ts`, `lifecycleHandlers.testUtils.ts`, `meshDeployment.testUtils.ts`
- `meshDeploymentVerifier.testUtils.ts`, `useMeshOperations.testUtils.ts`, `envFileGenerator.testUtils.ts`
- `progressUnifier.testUtils.ts`, `useAutoScroll.testUtils.ts`, `useFocusTrap.testUtils.ts`

### Recommended Actions

1. **HIGH-RISK files (5 remaining)**: Create mock validation tests in Step 5 for checkHandler, continueHandler, installHandler, PrerequisitesManager, createHandler
2. **MEDIUM-RISK files (9)**: Review Project type factories for consistency; lower priority unless drift detected
3. **LOW-RISK files (24)**: No action needed - no JSON coupling

## Notes

### Exemplary Pattern: ComponentRegistryManager.testUtils.ts

This file demonstrates best practices for JSON-derived mocks:

1. **Version Documentation**: Clear comments indicating which JSON version each mock represents
2. **Multiple Versions**: Separate mocks for v2.0 and v3.0.0 structures
3. **Schema Reference**: Comments reference `type-json-alignment.test.ts` for validation
4. **Update Instructions**: Header comment explains how to update when schema changes

Other testUtils files should follow this pattern for JSON-derived mocks.

## Estimated Time

3-4 hours for complete audit (approximately 5-7 minutes per file for detailed review)
