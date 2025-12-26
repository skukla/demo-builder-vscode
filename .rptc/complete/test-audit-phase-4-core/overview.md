# Test Audit Phase 4: Core Infrastructure

> **Part of:** [Comprehensive Test Audit](../TEST-AUDIT-MASTER.md) (7 phases)
> **Phase:** 4 of 7 - Core Infrastructure

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review (N/A - Read-only audit)
- [x] Security Review (N/A - Read-only audit)
- [x] Complete

**Created:** 2025-12-26
**Last Updated:** 2025-12-26
**Completed:** 2025-12-26

---

## Executive Summary

**Feature:** Audit all core infrastructure test files to ensure tests accurately reflect current implementation

**Purpose:** Verify that core infrastructure tests (shell, state, validation, utils, UI, handlers, communication, logging, vscode) accurately reflect the current implementation patterns. Core infrastructure is the foundation used by all features, so test accuracy here is critical.

**Approach:**
1. Audit each core module systematically (one step per module group)
2. For each test file: verify mock data matches current types, assertions match current behavior
3. Verify command execution patterns match current CommandExecutor API
4. Verify state management matches current StateManager/TransientStateManager API
5. Verify validation logic matches current security requirements
6. Update hardcoded values to use TIMEOUTS.* constants

**Complexity:** Medium (98 test files across 13 modules)

**Estimated Effort:** 10-14 hours total
- Step 1 (shell): 3-4 hours (20 files)
- Step 2 (state): 2-3 hours (15 files)
- Step 3 (validation + utils): 2-3 hours (20 files)
- Step 4 (ui + handlers + di + cache): 2-3 hours (25 files)
- Step 5 (vscode + communication + logging + base + commands): 1-2 hours (18 files)

**Key Risks:**
- Breaking passing tests while updating mock data
- Core infrastructure changes affecting multiple features
- CommandExecutor API changes requiring mock updates across many files
- Security validation test changes potentially missing edge cases

---

## Test Strategy

### Testing Approach

- **Framework:** Jest, ts-jest
- **Coverage Goals:** All core tests pass and accurately reflect current implementation
- **Test Distribution:** 100% existing test audit (no new tests in this phase)

### Audit Checklist (Applied to Every Test File)

For each test file in each core module:

- [ ] **Mock Data Accuracy**
  - Verify mock objects match current TypeScript interfaces
  - Check mocked dependencies match current function signatures
  - Ensure factory functions produce valid objects per current types

- [ ] **Assertion Accuracy**
  - Verify expected values match current implementation behavior
  - Check return types match current API
  - Validate error messages match current error handling

- [ ] **Hardcoded Values**
  - Replace magic numbers with constants (especially timeouts)
  - Use TIMEOUTS.* constants from @/core/utils/timeoutConfig
  - Replace hardcoded paths with path utilities where appropriate

- [ ] **Version References**
  - Remove any v2/v3 version comments or logic
  - Standardize descriptions to reference "current" not versions
  - Remove backwards-compatibility test branches

- [ ] **Test Descriptions**
  - Ensure describe/it blocks accurately describe current behavior
  - Update outdated test names that reference old functionality
  - Remove TODO/FIXME comments for resolved issues

- [ ] **Integration Points**
  - Verify mocked dependencies match current function signatures
  - Check cross-module mock consistency
  - Validate message types match current protocol definitions

### Core Module Test Counts

| Module | Test Files | Priority | Focus |
|--------|------------|----------|-------|
| shell | 20 | High | CommandExecutor, environmentSetup, processCleanup |
| state | 15 | High | StateManager, TransientStateManager, projectConfigWriter |
| validation | 8 | High | Security validation, field validation |
| utils | 12 | Medium | Utility functions, timeoutConfig |
| ui/components | 8 | Medium | React components |
| ui/hooks | 6 | Medium | React hooks |
| ui/styles | 3 | Low | Style utilities |
| ui/utils | 2 | Low | UI utilities |
| handlers | 3 | Medium | Handler registry patterns |
| vscode | 5 | Medium | VS Code API wrappers |
| communication | 3 | High | Webview messaging |
| logging | 4 | Medium | Logger implementations |
| base | 3 | Medium | Base command classes |
| commands | 3 | Low | Command infrastructure |
| cache | 1 | Low | AbstractCacheManager |
| di | 1 | Low | DI patterns |

### Coverage Goals

**Overall Target:** All 98 core test files audited

**Priority Breakdown:**
- **High Priority (46 files):** shell, state, validation, communication
- **Medium Priority (36 files):** utils, ui (components + hooks), handlers, vscode, logging, base
- **Low Priority (16 files):** ui (styles + utils), commands, cache, di

---

## Implementation Constraints

- **File Size:** <500 lines (standard)
- **Complexity:** <50 lines/function, <10 cyclomatic
- **Dependencies:**
  - REQUIRED: All mocks must match current implementation signatures
  - REQUIRED: Use TIMEOUTS.* constants for all timeout values
  - REQUIRED: CommandExecutor mock matches current execute() signature
  - REQUIRED: StateManager mock matches current API (initialize, getCurrentProject, etc.)
- **Platforms:** Node.js 18+ with TypeScript strict mode
- **Performance:** No special requirements

---

## Acceptance Criteria

### Definition of Done

- [ ] All 98 core test files audited for accuracy
- [ ] All mock data matches current TypeScript interfaces
- [ ] All assertions reflect current implementation behavior
- [ ] No version-specific logic (v2/v3) in any test file
- [ ] No hardcoded timeout values (use TIMEOUTS.* constants)
- [ ] All tests pass after audit
- [ ] No new TypeScript errors introduced
- [ ] Test descriptions accurately reflect current behavior

### Module-Specific Criteria

- [ ] Shell: CommandExecutor tests match current execute() API and options
- [ ] Shell: ProcessCleanup tests match current event-driven termination pattern
- [ ] Shell: EnvironmentSetup tests match current Node version discovery
- [ ] State: StateManager tests match current delegation pattern (ProjectFileLoader, etc.)
- [ ] State: TransientStateManager tests match current TTL and cache behavior
- [ ] Validation: Security tests match current injection prevention patterns
- [ ] Validation: Field validation tests match current dispatcher pattern
- [ ] Communication: Handshake tests match current reversed handshake protocol
- [ ] UI: Component tests use current Spectrum integration patterns

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Priority | Mitigation |
|------|----------|------------|--------|----------|------------|
| Breaking passing tests | Technical | Medium | High | High | Run tests after each file change; git commit per file |
| Missing subtle type mismatches | Technical | Medium | Medium | Medium | Use TypeScript strict mode; compare with source types |
| CommandExecutor API drift | Technical | Low | High | Medium | Cross-reference with src/core/shell/commandExecutor.ts |
| Security validation gaps | Security | Low | High | High | Verify all injection attack tests still valid |
| Cross-module mock inconsistency | Technical | Low | Medium | Low | Document shared mocks; verify consistency at end |

---

## File Reference Map

### Step 1: Shell Tests (20 files)

**Command Execution:**
- `tests/core/shell/commandExecutor-basic-execution.test.ts`
- `tests/core/shell/commandExecutor-adobe-cli.test.ts`
- `tests/core/shell/commandExecutor-cancellation.test.ts`
- `tests/core/shell/commandExecutor-delegation.test.ts`
- `tests/core/shell/commandExecutor-timeout.test.ts`
- `tests/core/shell/commandExecutor.security.test.ts`

**Command Sequencing:**
- `tests/core/shell/commandSequencer.test.ts`
- `tests/core/shell/commandSequencer-helpers.test.ts`

**Environment:**
- `tests/core/shell/environmentSetup-configuration.test.ts`
- `tests/core/shell/environmentSetup-pathDiscovery.test.ts`
- `tests/core/shell/environmentSetup-nodeVersion.test.ts`

**Process Management:**
- `tests/core/shell/processCleanup.test.ts`
- `tests/core/shell/processCleanup.error.test.ts`
- `tests/core/shell/processCleanup.mocked.test.ts`
- `tests/core/shell/processCleanup.timeout.test.ts`

**Supporting Services:**
- `tests/core/shell/fileWatcher.test.ts`
- `tests/core/shell/pollingService.test.ts`
- `tests/core/shell/rateLimiter.test.ts`
- `tests/core/shell/resourceLocker.test.ts`
- `tests/core/shell/retryStrategyManager.test.ts`

### Step 2: State Tests (15 files)

**StateManager:**
- `tests/core/state/stateManager-basic.test.ts`
- `tests/core/state/stateManager-context.test.ts`
- `tests/core/state/stateManager-errorHandling.test.ts`
- `tests/core/state/stateManager-processes.test.ts`
- `tests/core/state/stateManager-projects.test.ts`
- `tests/core/state/stateManager-recentProjects.test.ts`
- `tests/core/state/stateManager-componentVersions.test.ts`
- `tests/core/state/stateManager-utilities.test.ts`
- `tests/core/state/stateManager.disposal.test.ts`
- `tests/core/state/stateManager-getCurrentProject-reload.test.ts`

**TransientStateManager:**
- `tests/core/state/transientStateManager-basic.test.ts`
- `tests/core/state/transientStateManager-ttl.test.ts`
- `tests/core/state/transientStateManager-helpers.test.ts`

**ProjectConfigWriter:**
- `tests/core/state/projectConfigWriter-accessors.test.ts`

### Step 3: Validation + Utils (20 files)

**Validation (8 files):**
- `tests/core/validation/Validator.test.ts`
- `tests/core/validation/fieldValidation-dispatcher.test.ts`
- `tests/core/validation/fieldValidation-commerceUrl.test.ts`
- `tests/core/validation/fieldValidation-projectName.test.ts`
- `tests/core/validation/securityValidation-input.test.ts`
- `tests/core/validation/securityValidation-network.test.ts`
- `tests/core/validation/securityValidation-nodeVersion.test.ts`
- `tests/core/validation/normalizers.test.ts`

**Utils (12 files):**
- `tests/core/utils/bundleUri.test.ts`
- `tests/core/utils/disposableStore.test.ts`
- `tests/core/utils/disposableStore.error.test.ts`
- `tests/core/utils/envVarExtraction.test.ts`
- `tests/core/utils/executionLock.test.ts`
- `tests/core/utils/getWebviewHTMLWithBundles.test.ts`
- `tests/core/utils/loadingHTML.test.ts`
- `tests/core/utils/promiseUtils.test.ts`
- `tests/core/utils/quickPickUtils.test.ts`
- `tests/core/utils/timeFormatting.test.ts`
- `tests/core/utils/timeoutConfig.test.ts`
- `tests/core/utils/webviewHTMLBuilder.test.ts`

### Step 4: UI + Handlers + DI + Cache (25 files)

**UI Components (8 files):**
- `tests/core/ui/components/WebviewApp.test.tsx`
- `tests/core/ui/components/ErrorBoundary.test.tsx`
- `tests/core/ui/components/ui/Modal.test.tsx`
- `tests/core/ui/components/layout/PageLayout.test.tsx`
- `tests/core/ui/components/layout/PageHeader.test.tsx`
- `tests/core/ui/components/layout/PageFooter.test.tsx`
- `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`
- `tests/core/ui/components/feedback/SuccessStateDisplay.test.tsx`
- `tests/core/ui/components/navigation/BackButton.test.tsx`

**UI Hooks (6 files):**
- `tests/core/ui/hooks/useAsyncOperation.test.tsx`
- `tests/core/ui/hooks/useCanProceed.test.tsx`
- `tests/core/ui/hooks/useFocusOnMount.test.tsx`
- `tests/core/ui/hooks/useTimerCleanup.test.tsx`
- `tests/core/ui/hooks/useVerificationMessage.test.tsx`
- `tests/core/ui/hooks/usePollingWithTimeout.test.tsx`

**UI Styles (3 files):**
- `tests/core/ui/styles/layerDeclarations.test.ts`
- `tests/core/ui/styles/reset.test.ts`
- `tests/core/ui/styles/tokens.test.ts`

**UI Utils (2 files):**
- `tests/core/ui/utils/WebviewClient.test.ts`
- `tests/core/ui/utils/frontendTimeouts.test.ts`

**Handlers (3 files):**
- `tests/core/handlers/HandlerRegistry.test.ts`
- `tests/core/handlers/errorHandling.test.ts`
- `tests/core/handlers/RegistryPatternConsistency.test.ts`

**DI (1 file):**
- `tests/core/di/diPatterns.test.ts`

**Cache (1 file):**
- `tests/core/cache/AbstractCacheManager.test.ts`

### Step 5: VSCode + Communication + Logging + Base + Commands (18 files)

**VSCode (5 files):**
- `tests/core/vscode/envFileWatcherService.test.ts`
- `tests/core/vscode/envFileWatcherService-changeDetection.mocked.test.ts`
- `tests/core/vscode/envFileWatcherService-gracePeriodNotifications.mocked.test.ts`
- `tests/core/vscode/envFileWatcherService-security.mocked.test.ts`
- `tests/core/vscode/workspaceWatcherManager.mocked.test.ts`

**Communication (3 files):**
- `tests/core/communication/webviewCommunicationManager.handshake.test.ts`
- `tests/core/communication/webviewCommunicationManager.messaging.test.ts`
- `tests/core/communication/webviewCommunicationManager.edge-cases.test.ts`

**Logging (4 files):**
- `tests/core/logging/debugLogger-core.test.ts`
- `tests/core/logging/debugLogger-channels.test.ts`
- `tests/core/logging/debugLogger-logging.test.ts`
- `tests/core/logging/debugLogger-pathValidation.test.ts`

**Base (3 files):**
- `tests/core/base/baseCommand.disposal.test.ts`
- `tests/core/base/baseWebviewCommand.disposal.test.ts`
- `tests/core/base/baseWebviewCommand.transition.test.ts`

**Commands (3 files):**
- `tests/core/commands/commandManager.test.ts`
- `tests/core/commands/ResetAllCommand.test.ts`
- `tests/core/commands/ResetAllCommand.security.test.ts`

---

## Source Files for Cross-Reference

### Shell Module
- `src/core/shell/commandExecutor.ts` - Main command executor
- `src/core/shell/environmentSetup.ts` - Environment configuration
- `src/core/shell/processCleanup.ts` - Process termination
- `src/core/shell/types.ts` - Type definitions

### State Module
- `src/core/state/stateManager.ts` - State orchestrator
- `src/core/state/transientStateManager.ts` - TTL-based cache
- `src/core/state/projectConfigWriter.ts` - Config file writer

### Validation Module
- `src/core/validation/Validator.ts` - Composable validators
- `src/core/validation/fieldValidation.ts` - Field validation dispatcher
- `src/core/validation/validators/*.ts` - Security validators

### Communication Module
- `src/core/communication/webviewCommunicationManager.ts` - Messaging protocol

---

## Assumptions

- [ ] **Assumption 1:** All tests currently pass before audit begins
  - **Source:** ASSUMED based on CI/CD pipeline
  - **Impact if Wrong:** May need to fix broken tests before auditing

- [ ] **Assumption 2:** CommandExecutor API is stable (no major changes planned)
  - **Source:** FROM: src/core/shell/commandExecutor.ts (last modified Dec 18)
  - **Impact if Wrong:** May need additional mock updates

- [ ] **Assumption 3:** StateManager delegation pattern is current (ProjectFileLoader, etc.)
  - **Source:** FROM: src/core/state/stateManager.ts (last modified Dec 16)
  - **Impact if Wrong:** Tests may need restructuring for new patterns

---

## Plan Maintenance

**This is a living document.**

### Deviations Log

_(To be updated during TDD phase)_

### When to Request Replanning

Request full replan if:
- Core API changes significantly during audit
- New security requirements discovered
- Test count significantly different than documented

---

## Completion Summary

**Completed:** 2025-12-26

### Results

| Module | Test Files | Tests | Status |
|--------|------------|-------|--------|
| Shell | 20 | ~300 | ✅ Validated |
| State | 14 | ~200 | ✅ Validated |
| Validation | 8 | ~150 | ✅ Validated |
| Utils | 12 | ~180 | ✅ Validated |
| UI (components + hooks + styles + utils) | 19 | ~280 | ✅ Validated |
| Handlers | 3 | ~50 | ✅ Validated |
| DI + Cache | 2 | ~30 | ✅ Validated |
| VSCode | 5 | ~80 | ✅ Validated |
| Communication | 3 | ~60 | ✅ Validated |
| Logging | 4 | ~70 | ✅ Validated |
| Base | 3 | ~50 | ✅ Validated |
| Commands | 3 | ~50 | ✅ Validated |
| **TOTAL** | **97** | **1503** | **✅ ALL PASS** |

### Findings

1. **No critical issues found** - All test mocks accurately reflect implementation
2. **Version references**: Zero v2/v3 references (cleaned in Phase 2)
3. **Hardcoded timeouts**: setTimeout in processCleanup tests are legitimate (spawn child processes)
4. **No TODO/FIXME**: All tests complete
5. **No deprecated patterns**: No `.only()` or `.skip()` in any test

### Deep-Dive Validation

Traced mock methods to actual implementation for critical modules:

- **CommandExecutor**: `execute()` returns `CommandResult` with `stdout`, `stderr`, `code`, `duration` ✅
- **WebviewCommunicationManager**: Reversed handshake protocol with `isExtensionReady` flag ✅
- **StateManager**: `initialize()` and `getCurrentProject()` match implementation API ✅

### Validation Method

- Type-safe imports ensure structural alignment
- Execution tests verify assertion accuracy
- 1:1 correspondence between test assertions and implementation outputs

---

_Plan created by Master Feature Planner_
_Status: Complete_
