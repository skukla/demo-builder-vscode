# Implementation Plan: Fix Authentication Flow UX and Zero-Org Handling

## Status Tracking

- [x] Planned
- [x] Step 1: Fix UX Message Flash
- [x] Step 2: Add Token Expiry Detection
- [x] Step 3: Implement CLI Context Clearing
- [x] Step 4: Rename Misleading Method
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2025-01-14
**Last Updated:** 2025-11-15
**Completed:** 2025-11-15
**Steps:** 4 total steps

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: enabled

---

## Executive Summary

**Feature:** Fix authentication flow UX message flash and handle tokens with no organization access

**Purpose:** Eliminate confusing "Opening Browser" message flash when user is already authenticated, and provide clear error messages distinguishing "session expired" from "no organization access" scenarios

**Approach:** Defer frontend auth messages until backend determines auth path, add robust validation to distinguish token expiry from zero-org scenarios, clear CLI context (org/project/workspace) while preserving token, rename misleading "Quick" method for clarity

**Estimated Complexity:** Simple

**Estimated Timeline:** 4-6 hours

**Key Risks:** Breaking cached token behavior, race conditions in message updates, CLI context clearing side effects

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest, @testing-library/react for React components
- **Coverage Goal:** 85% overall, 100% critical auth flow paths
- **Test Distribution:** Unit (70%), Integration (30%)

### Test Scenarios Summary

**Happy Path:** Valid token with orgs, auth check succeeds without browser launch, proper message display after backend response

**Edge Cases:** Valid token with zero orgs, expired token, 2-3s auth check delay

**Error Conditions:** Invalid token, Adobe CLI failures, network errors during org listing

**Future Coverage (not in current plan):** Concurrent auth checks, wizard state preservation during recovery, SDK timeout (currently only CLI timeout tested)

**Detailed test scenarios are in each step file** (step-01.md, step-02.md, step-03.md, step-04.md)

### Coverage Goals

**Overall Target:** 85%

**Component Breakdown:**

- `authenticationHandlers`: 95% (critical message timing logic)
- `authenticationService`: 95% (token validation and org detection)
- `CLI context clearing`: 90% (state management)
- `Error formatting`: 85% (standard coverage)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All user stories/requirements implemented
- [ ] **Testing:** All tests passing (unit, integration)
- [ ] **Coverage:** Overall coverage ≥ 85%, critical paths 100%
- [ ] **Code Quality:** Passes linter, no debug code, follows style guide
- [ ] **Documentation:** Code comments, inline docs updated
- [ ] **Error Handling:** All error conditions handled gracefully

**Feature-Specific Criteria:**

- [ ] No "Opening Browser" message flash when user already has valid token
- [ ] Clear error message for "no organization access" (valid token, 0 orgs)
- [ ] Clear error message for "session expired" (invalid token)
- [ ] CLI context (org/project/workspace) cleared on auth recovery, token preserved
- [ ] Method renamed from misleading "Quick" to accurate name
- [ ] Wizard state preserved during authentication recovery
- [ ] All existing authentication flows continue to work (no regressions)

---

## Risk Assessment

### Risk 1: Breaking Cached Token Behavior

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** High
- **Description:** New validation logic might invalidate previously cached tokens, forcing unnecessary re-authentication for users
- **Mitigation:**
  1. Preserve existing token caching logic unchanged
  2. Add separate org validation step that doesn't affect token validity
  3. Comprehensive integration tests for cached token scenarios
  4. Feature flag for gradual rollout
- **Contingency Plan:** Rollback changes, force single re-auth for affected users, restore previous validation logic

### Risk 2: Race Conditions in Message Updates

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Frontend might update message before backend auth check completes, causing brief incorrect message display
- **Mitigation:**
  1. Use WebviewCommunicationManager message queuing (already in place)
  2. Await backend response before showing any auth-related UI messages
  3. Add integration tests for message timing
- **Contingency Plan:** Add retry logic, increase message queue timeout, add loading state while waiting

### Risk 3: CLI Context Clearing Side Effects

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** High
- **Priority:** High
- **Description:** Clearing Adobe CLI context might inadvertently affect other CLI operations or corrupt state
- **Mitigation:**
  1. Target only org/project/workspace config, explicitly preserve token
  2. Use Adobe CLI's built-in context clearing commands
  3. Add validation to verify token remains after context clear
  4. Integration tests for CLI state before/after clearing
- **Contingency Plan:** Restore CLI config from backup, add pre-clear state snapshot, validate state integrity after clear

---

## Dependencies

### New Packages to Install

None - all required dependencies already in place

### Configuration Changes

None - no configuration file changes required

### External Service Integrations

- **Service:** Adobe CLI (existing dependency)
  - **Purpose:** Organization listing, context management
  - **Setup Required:** None (already integrated)
  - **Error Handling:** Existing timeout and error handling patterns apply

---

## File Reference Map

### Existing Files (To Modify)

- `src/features/authentication/handlers/authenticationHandlers.ts` - Add message deferral logic, await backend before frontend updates
- `src/features/authentication/services/authenticationService.ts` - Add zero-org detection, distinguish token expiry, rename "Quick" method
- `src/features/authentication/services/authenticationErrorFormatter.ts` - Add error messages for "no org access" scenario
- Corresponding test files for above components

### New Files (To Create)

**Test Files:**

- `tests/features/authentication/integration/authFlow.test.ts` - Integration tests for expired token and zero-org scenarios (Step 2)
- `tests/features/authentication/authenticationFlow-zeroOrgs.integration.test.ts` - Integration tests for CLI context clearing after zero-org detection (Step 3)

**Total Files:** 3-4 modified, 2 created (test files)

---

## Coordination Notes

**Step Dependencies:**

- Steps 1-4 are mostly independent but work together to solve auth flow issues
- Step 1 (UX fix) + Step 2 (validation) address core authentication flow problems
- Step 3 (CLI clearing) ensures clean state recovery after auth issues
- Step 4 (renaming) improves code clarity and maintainability
- All steps can be implemented and tested separately, integrated at the end

**Integration Points:**

- **Step 1 ↔ Step 2 Integration:** Frontend (AdobeAuthStep) clears message state, backend (authenticationHandlers) sends `auth-status` messages via WebviewCommunicationManager. Message schema: `{ isChecking: boolean, isAuthenticated: boolean, message: string, subMessage: string, requiresOrgSelection: boolean, orgLacksAccess: boolean }`. Frontend defers all messaging to backend after user action.
- **Step 2 ↔ Step 3 Integration:** Step 2's token expiry detection enables Step 3's CLI context clearing. When `getOrganizations()` returns empty array (0 orgs), Step 3's `clearConsoleContext()` executes. The empty array is the trigger condition.
- authenticationHandlers interfaces with webview messaging layer via WebviewCommunicationManager
- authenticationService consumes Adobe SDK and Adobe CLI for validation
- Error formatter provides consistent messages across all auth scenarios

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@fix-auth-flow-ux-and-zero-orgs"`
3. **Quality Gates:** Efficiency Agent → Security Agent (after all steps complete)
4. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@fix-auth-flow-ux-and-zero-orgs"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md, step-02.md, step-03.md, step-04.md_
