# Implementation Plan: Fix Dashboard Status Display Issues

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-11-17
**Last Updated:** 2025-11-17
**Steps:** 2 total steps

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: enabled

**Note**: Quality gates are optional. Set to "enabled" to run automated reviews after TDD implementation, or "disabled" to skip. Default is "enabled" for both if not specified.

---

## Executive Summary

**Feature:** Fix two dashboard status display bugs - StatusCard layout issue and incorrect mesh "Not Deployed" status on fetch timeout

**Purpose:** Improve dashboard UX by ensuring consistent status display layout and accurate mesh deployment status reporting even when fetches timeout

**Approach:** (1) Fix mesh status fallback logic to distinguish between "unknown" (timeout/error) vs "not deployed" (confirmed no mesh), (2) Verify StatusCard layout remains inline under all conditions

**Estimated Complexity:** Simple

**Estimated Timeline:** 2-4 hours

**Key Risks:** Mesh status logic changes could affect other dashboard features that rely on staleness detection; StatusCard layout issue requires investigation to reproduce

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node), @testing-library/react (React components)
- **Coverage Goal:** 85% overall, 100% critical paths
- **Test Distribution:** Unit (90%), Integration (10%)

### Test Scenarios Summary

**Happy Path:**
- Mesh status correctly shows "deployed" when envVars populated and fetch succeeds
- StatusCard displays inline (dot + text) with proper spacing
- Fallback to "checking" state when fetch is in progress

**Edge Cases:**
- Network timeout during mesh config fetch (should show "checking" not "not-deployed")
- Empty meshState.envVars (legitimately not deployed)
- Missing authentication (should prompt for auth)
- StatusCard with long status text (verify no wrapping/stacking)

**Error Conditions:**
- Fetch error returns unknownDeployedState=true (should show appropriate message)
- Invalid mesh data response (graceful error handling)
- Missing panel/project context (handler fails gracefully)

**Detailed test scenarios are in each step file** (step-01.md, step-02.md, etc.)

### Coverage Goals

**Overall Target:** 85%

**Component Breakdown:**

- `dashboardHandlers.ts`: 90% (critical status logic)
- `stalenessDetector.ts`: 90% (mesh change detection)
- `StatusCard.tsx`: 95% (UI component)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** Mesh status shows accurate state (deployed/checking/not-deployed/error)
- [ ] **Testing:** All tests passing (unit tests for handlers and StatusCard)
- [ ] **Coverage:** Overall coverage ≥ 85%, critical paths 100%
- [ ] **Code Quality:** Passes linter, no debug code, follows style guide
- [ ] **Documentation:** Code comments explain fallback logic
- [ ] **Error Handling:** Timeout/error cases handled gracefully
- [ ] **Performance:** Mesh status check remains non-blocking (async)

**Feature-Specific Criteria:**

- [ ] Mesh status distinguishes "checking" (fetch in progress/timeout) from "not-deployed" (confirmed no deployment)
- [ ] StatusCard maintains inline layout (dot + text) in all scenarios
- [ ] Dashboard shows appropriate user-facing messages for each status state
- [ ] No false "Not Deployed" messages when mesh is actually deployed but fetch times out

---

## Risk Assessment

### Risk 1: Mesh Status Logic Regression

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Changes to mesh status fallback logic could break other features that depend on staleness detection (e.g., deploy mesh button state, mesh config-changed indicator)
- **Mitigation:**
  1. Review all call sites of detectMeshChanges() before modifying
  2. Add comprehensive unit tests for new status states
  3. Manual testing of all mesh status scenarios (deployed, changed, not-deployed, checking, error)
- **Contingency Plan:** If regression detected, revert changes and add integration tests before re-implementing

### Risk 2: StatusCard Layout Issue Not Reproducible

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low
- **Priority:** Medium
- **Description:** Research indicates "StatusCard stale bundle shows stacked layout" but issue may be transient or already fixed
- **Mitigation:**
  1. Add visual regression test or screenshot test for StatusCard
  2. Test StatusCard with various text lengths and container widths
  3. Verify flexbox styling remains consistent across Spectrum versions
- **Contingency Plan:** If not reproducible, document investigation findings and close with "unable to reproduce" note

### Risk 3: Async Mesh Check Timing

- **Category:** Performance
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Changing when "checking" state is shown could affect user perception of responsiveness
- **Mitigation:**
  1. Keep async mesh check pattern (non-blocking)
  2. Show "checking" immediately while fetch in progress
  3. Timeout after reasonable period (existing 30s timeout in meshVerifier is sufficient)
- **Contingency Plan:** Adjust timeout values based on user feedback

---

## Dependencies

### New Packages to Install

_None - uses existing test infrastructure_

### Configuration Changes

_None - changes are code-only_

### External Service Integrations

_None - uses existing Adobe I/O mesh API integration_

---

## File Reference Map

### Existing Files (To Modify)

- `src/features/dashboard/handlers/dashboardHandlers.ts` - Fix mesh status fallback logic in checkMeshStatusAsync() and handleRequestStatus()
- `src/features/mesh/services/stalenessDetector.ts` - May need to adjust unknownDeployedState logic or return additional state
- `src/core/ui/components/feedback/StatusCard.tsx` - Verify and fix inline layout if issue reproduced

### New Files (To Create)

- `tests/unit/features/dashboard/handlers/dashboardHandlers.test.ts` - Unit tests for mesh status logic
- `tests/unit/features/mesh/services/stalenessDetector.test.ts` - Unit tests for staleness detection
- `tests/integration/core/ui/components/feedback/StatusCard.test.tsx` - Integration tests for StatusCard layout

**Total Files:** 3 modified, 3 created (tests)

---

## Coordination Notes

**Step Dependencies:**

- Step 2 (verification) depends on Step 1 (mesh status fix) completing successfully
- Both issues are independent but tested together in Step 2

**Integration Points:**

- `dashboardHandlers.ts` calls `detectMeshChanges()` from stalenessDetector.ts
- Mesh status updates sent to Dashboard UI via webview messages (type: 'statusUpdate')
- StatusCard component used in Dashboard to display mesh status

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@fix-dashboard-status-display-issues"`
3. **Quality Gates:** Efficiency Agent → Security Agent (after all steps complete)
4. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@fix-dashboard-status-display-issues"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md, step-02.md_
