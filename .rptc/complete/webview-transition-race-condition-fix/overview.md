# Implementation Plan: Webview Transition Race Condition Fix

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-01-10
**Last Updated:** 2025-01-10
**Steps:** 3 total steps

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: enabled

**Note**: Quality gates are optional. Set to "enabled" to run automated reviews after TDD implementation, or "disabled" to skip. Default is "enabled" for both if not specified.

---

## Executive Summary

**Feature:** Complete timeout safety for webview transition tracking to prevent Welcome screen from auto-reopening during "Create New Project" flow

**Purpose:** Fix race condition where Welcome screen incorrectly reopens when user clicks "Create New Project" due to missing timeout safety on transition flag

**Approach:** Extend existing timeoutConfig.ts pattern with WEBVIEW_TRANSITION timeout (3000ms), add automatic flag reset after timeout, ensure idempotent flag management

**Estimated Complexity:** Simple

**Estimated Timeline:** 2-3 hours

**Key Risks:**
1. Timeout value too short (legitimate transitions interrupted)
2. Timeout value too long (stuck flag delays Welcome reopen)
3. Race conditions between competing webview commands

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node environment)
- **Coverage Goal:** 85% overall, 100% critical paths
- **Test Distribution:** Unit (70%), Integration (30%)

### Test Scenarios Summary

**Happy Path:**
- startWebviewTransition() sets flag, creates timeout, endWebviewTransition() clears both
- Timeout automatically resets flag after 3000ms if not manually cleared
- Multiple transitions handled correctly (new timeout replaces old)

**Edge Cases:**
- Rapid start/end calls (timeout cleanup)
- Timeout fires during active transition
- Multiple concurrent transition attempts
- Very long-running transitions (>3s)

**Error Conditions:**
- Timeout handle becomes invalid
- clearTimeout called with undefined
- Race between timeout fire and manual endWebviewTransition()

**Detailed test scenarios are in each step file** (step-01.md, step-02.md, etc.)

### Coverage Goals

**Overall Target:** 85%

**Component Breakdown:**

- `BaseWebviewCommand` (transition methods): 100% (critical race condition fix)
- `timeoutConfig.ts`: 90% (configuration module)
- Integration tests: 85% (cross-component interactions)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** Transition tracking works correctly with timeout safety
- [ ] **Testing:** All tests passing (unit + integration)
- [ ] **Coverage:** Overall coverage ≥ 85%, critical paths 100%
- [ ] **Code Quality:** Passes linter, no debug code, follows style guide
- [ ] **Documentation:** Inline comments explain timeout logic
- [ ] **Security:** No security vulnerabilities identified
- [ ] **Performance:** Timeout overhead negligible (<1ms)
- [ ] **Error Handling:** All edge cases handled gracefully

**Feature-Specific Criteria:**

- [ ] Welcome screen does NOT auto-reopen during "Create New Project" flow
- [ ] Welcome screen DOES auto-reopen after 3 seconds if transition stuck
- [ ] Timeout value (3000ms) documented in timeoutConfig.ts with rationale
- [ ] Existing startWebviewTransition() call in showWelcome.ts works unchanged
- [ ] No re-engineering of existing timeout infrastructure

---

## Risk Assessment

### Risk 1: Timeout Value Too Short

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** If WEBVIEW_TRANSITION timeout (3000ms) is too short, legitimate slow transitions will be interrupted, causing Welcome screen to reopen prematurely
- **Mitigation:**
  1. Use 3000ms (3 seconds) as conservative default based on existing patterns
  2. Add comprehensive integration tests with timing assertions
  3. Document timeout rationale in timeoutConfig.ts
- **Contingency Plan:** Increase timeout to 5000ms if issues observed in production

### Risk 2: Timeout Value Too Long

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Medium
- **Description:** If timeout too long (>5s), stuck transition flag delays Welcome screen reopen unnecessarily
- **Mitigation:**
  1. 3000ms balances safety vs responsiveness
  2. Manual endWebviewTransition() clears timeout immediately (happy path)
- **Contingency Plan:** Decrease timeout to 2000ms if user feedback indicates delay

### Risk 3: Race Conditions Between Webview Commands

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Multiple webview commands executing simultaneously could interfere with transition flag
- **Mitigation:**
  1. Use idempotent flag operations (multiple starts safe)
  2. Store single timeout handle (new timeout replaces old)
  3. Integration tests verify concurrent scenarios
- **Contingency Plan:** Add mutex lock if race conditions observed

---

## Dependencies

### New Packages to Install

None required - uses existing Node.js timer APIs

### Configuration Changes

- [ ] **Config:** `src/core/utils/timeoutConfig.ts`
  - **Changes:** Add WEBVIEW_TRANSITION: 3000 constant
  - **Environment:** All environments

### External Service Integrations

None required - internal extension logic only

---

## File Reference Map

### Existing Files (To Modify)

- `src/core/utils/timeoutConfig.ts` - Add WEBVIEW_TRANSITION timeout constant (3000ms)
- `src/core/base/baseWebviewCommand.ts` - Add timeout handle, modify startWebviewTransition() to create timeout, modify endWebviewTransition() to clear timeout

### New Files (To Create)

- `tests/core/base/baseWebviewCommand.transition.test.ts` - Unit tests for transition tracking with timeout
- `tests/integration/webview-transition.test.ts` - Integration tests for Welcome screen auto-reopen scenarios

**Total Files:** 2 modified, 2 created

---

## Coordination Notes

**Step Dependencies:**

- Step 2 depends on Step 1: Timeout constant must exist before using in BaseWebviewCommand
- Step 3 tests Step 1 + Step 2: Comprehensive test suite validates complete implementation

**Integration Points:**

- timeoutConfig.ts provides WEBVIEW_TRANSITION constant consumed by BaseWebviewCommand
- BaseWebviewCommand.startWebviewTransition() called by showWelcome.ts (existing integration preserved)
- extension.ts disposal callback checks isWebviewTransitionInProgress() (existing behavior preserved)

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@webview-transition-race-condition-fix"`
3. **Quality Gates:** Efficiency Agent → Security Agent (after all steps complete)
4. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@webview-transition-race-condition-fix"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md, step-02.md, step-03.md_
