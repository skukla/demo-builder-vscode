# Implementation Plan: Fix Webview Handshake Race Condition

## Status Tracking
- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2025-01-10
**Last Updated:** 2025-11-10
**Steps:** 9 steps (all completed)

---

## Configuration

### Quality Gates
**Efficiency Review**: enabled
**Security Review**: enabled

---

## Executive Summary

**Feature:** Fix webview handshake race condition by correcting bundle loading and reversing handshake protocol

**Purpose:** Eliminate production timeout errors in wizard webview (currently timing out after 15 seconds) and prevent similar failures across all 4 webviews (welcome, wizard, dashboard, configure)

**Approach:** Two-phase fix: (1) Correct bundle loading pattern - extract Welcome's 4-bundle pattern into reusable helper and apply to all webviews, (2) Reverse handshake direction - change from extension-initiated (race-prone) to webview-initiated (self-synchronizing) following VS Code Issue #125546 best practice

**Estimated Complexity:** Medium

**Estimated Timeline:** 6-8 hours (research estimate: 6 hours; adding buffer for comprehensive testing)

**Key Risks:**
- Breaking changes to handshake protocol require updating all 4 webviews simultaneously
- Bundle loading changes affect webpack configuration and may expose CSP issues
- Flakiness testing required to verify race condition truly eliminated (50 cycle minimum)

---

## Test Strategy

### Testing Approach
- **Framework:** Jest + @testing-library/react + VS Code Test API
- **Coverage Goal:** 90%+ overall, 100% critical paths (higher due to production bug severity)
- **Test Distribution:** Unit (60%), Integration (30%), E2E Flakiness (10%)

### Test Scenarios Summary

**Happy Path:**
- All 4 webviews (wizard, welcome, dashboard, configure) open without timeout
- Bundle loading succeeds with all 4 bundles in correct order (runtime → vendors → common → feature)
- Handshake completes successfully with webview sending ready first
- Messages queued during handshake are delivered after completion

**Edge Cases:**
- Slow bundle loading (artificial 5-second delay)
- Rapid webview create/dispose cycles (50 iterations for flakiness detection)
- Webview visibility toggling during handshake
- Concurrent webview creation (multiple panels opening simultaneously)
- Bundle loading failure (missing runtime/vendors/common bundles)

**Error Conditions:**
- Webview never sends ready signal (timeout after 10 seconds)
- Invalid bundle URIs (CSP violations)
- Message handler errors during handshake
- Extension disposed before handshake complete

**Detailed test scenarios are in each step file** (step-01.md through step-09.md)

### Coverage Goals

**Overall Target:** 90%

**Component Breakdown:**
- `getWebviewHTMLWithBundles` helper: 100% (critical - must generate correct HTML)
- `WebviewCommunicationManager.initialize()`: 100% (critical - handshake logic)
- `WebviewClient.initialize()`: 100% (critical - sends ready signal)
- Command webview content methods: 95% (4 webviews must use new pattern)
- Integration/flakiness tests: N/A (coverage not applicable to E2E tests)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All 4 webviews open without timeout in <3 seconds
- [ ] **Testing:** All tests passing (unit, integration, flakiness)
- [ ] **Coverage:** 90%+ overall, 100% critical paths (handshake, bundle generation)
- [ ] **Code Quality:** Passes linter, no debug code, follows style guide
- [ ] **Documentation:** WebviewCommunicationManager comments updated, handshake sequence diagram revised
- [ ] **Security:** CSP compliance verified (nonces on all script tags), no eval() or inline scripts
- [ ] **Performance:** Webview initialization <3 seconds (current: 15+ second timeout)

**Feature-Specific Criteria:**

- [ ] All 4 webviews (wizard, welcome, dashboard, configure) open successfully without timeout
- [ ] Deprecated `generateWebviewHTML()` function completely removed (not just marked deprecated)
- [ ] All webviews use identical bundle loading pattern via `getWebviewHTMLWithBundles()` helper
- [ ] Handshake protocol reversed: webview sends `__webview_ready__` first, extension waits and responds
- [ ] Flakiness test passes: 50 consecutive webview create/dispose cycles with 0 failures
- [ ] CSP compliance: All script tags have unique nonces, no CSP violations in DevTools console
- [ ] Webpack bundles verified: 4 bundles present in dist/ (runtime, vendors, common, feature × 4)
- [ ] Manual DevTools inspection confirms all 4 bundles loaded in correct order
- [ ] No race condition in handshake: artificial 5-second bundle load delay still succeeds

---

## Risk Assessment

### Risk 1: Breaking Changes Across All Webviews

- **Category:** Technical
- **Likelihood:** High
- **Impact:** High
- **Priority:** Critical
- **Description:** Changing handshake protocol requires simultaneous updates to WebviewCommunicationManager (extension) and WebviewClient (webview). If either side is out of sync, all webviews fail. No incremental rollout possible.
- **Mitigation:**
  1. Complete both handshake changes in single atomic commit (Steps 7-8)
  2. Test all 4 webviews together before committing (Step 9)
  3. Add explicit version check to handshake protocol (future-proofing)
- **Contingency Plan:** Revert entire commit if any webview fails post-deployment; research document provides rollback procedure

### Risk 2: Bundle Loading CSP Violations

- **Category:** Security
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Manually constructing HTML with 4 script tags may violate Content Security Policy if nonces are not unique or properly applied. Current `generateWebviewHTML()` handles CSP correctly; new helper must match.
- **Mitigation:**
  1. Reuse existing `getNonce()` utility from BaseWebviewCommand
  2. Reference Welcome's working implementation (showWelcome.ts:72-88)
  3. Add explicit CSP validation tests (verify nonce uniqueness, no inline scripts)
  4. Manual DevTools inspection in Step 9 (check for CSP violations in console)
- **Contingency Plan:** If CSP issues found, reference VS Code webview API documentation and existing Welcome implementation

### Risk 3: Flakiness Not Eliminated

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** High
- **Priority:** Critical
- **Description:** Research indicates race condition should be eliminated by webview-initiated handshake, but timing issues may remain due to VS Code API quirks or webpack bundle loading delays.
- **Mitigation:**
  1. Comprehensive flakiness testing: 50 consecutive create/dispose cycles (Step 9)
  2. Artificial delay testing: 5-second bundle load delay to simulate slow machines
  3. Timeout tuning: Increase handshake timeout from 15s to 30s if needed (safety margin)
  4. Add extensive logging: Timestamp every handshake event for debugging
- **Contingency Plan:** If flakiness persists, investigate VS Code API alternatives (vscode-messenger library) or increase timeout as temporary fix

### Risk 4: Webpack Bundle Dependencies

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Current webpack configuration uses code splitting (4 bundles). Changes to bundle loading order or missing bundles cause JavaScript execution failures. Bundle names/paths must match webpack output exactly.
- **Mitigation:**
  1. Verify webpack config unchanged (webpack.config.js:20-44)
  2. Add test to verify all 4 bundle files exist in dist/ before building HTML
  3. Reference existing Welcome implementation for correct bundle paths
  4. Manual verification in Step 9 (inspect dist/ directory for bundle files)
- **Contingency Plan:** If bundle paths wrong, review webpack.config.js and update helper accordingly

### Risk 5: Backward Compatibility Break

- **Category:** Schedule
- **Likelihood:** Medium
- **Impact:** Low
- **Priority:** Low
- **Description:** PM approved clean break (no backward compatibility), but users on older extension versions may have cached webview state causing issues on update.
- **Mitigation:**
  1. Document breaking change in CHANGELOG
  2. Recommend full extension reload after update (close all webviews)
  3. Add version check to state management (clear cache if version mismatch)
- **Contingency Plan:** If user reports issues post-update, provide manual reset instructions (close VS Code, delete workspace state)

---

## Dependencies

### New Packages to Install
- [ ] None (using existing Jest, @testing-library/react, VS Code Test API)

### Configuration Changes
- [ ] None required (webpack config unchanged)

### External Service Integrations
- [ ] None

---

## File Reference Map

### Existing Files (To Modify)

**Core Files:**
- `src/shared/communication/webviewCommunicationManager.ts` - Remove `__extension_ready__` send, wait for `__webview_ready__` signal
- `src/shared/ui/utils/WebviewClient.ts` - Remove `__extension_ready__` listener, send `__webview_ready__` immediately after initialization
- `src/shared/base/baseWebviewCommand.ts` - May need small updates if helper integrated into base class

**Command Files (Bundle Loading):**
- `src/features/project-creation/commands/createProject.ts` - Replace `generateWebviewHTML()` with `getWebviewHTMLWithBundles()`
- `src/features/dashboard/commands/showDashboard.ts` - Replace `generateWebviewHTML()` with `getWebviewHTMLWithBundles()`
- `src/features/dashboard/commands/configure.ts` - Replace `generateWebviewHTML()` with `getWebviewHTMLWithBundles()`
- `src/features/welcome/commands/showWelcome.ts` - Refactor to use `getWebviewHTMLWithBundles()` (consistency)

**Deprecated Code (To Delete):**
- `src/shared/utils/webviewHTMLBuilder.ts` - DELETE `generateWebviewHTML()` function entirely (lines 21-61)

### New Files (To Create)

**Implementation Files:**
- `src/shared/utils/getWebviewHTMLWithBundles.ts` - Helper function supporting 4-bundle pattern (extract from showWelcome.ts:72-88)

**Test Files:**
- `tests/shared/utils/getWebviewHTMLWithBundles.test.ts` - Unit tests for HTML generation (CSP, nonces, bundle order)
- `tests/shared/communication/handshake-reversed.test.ts` - Integration tests for reversed handshake protocol
- `tests/integration/webview-lifecycle-flakiness.test.ts` - E2E flakiness test (50 cycle create/dispose)

**Total Files:** 9 modified, 3 created, 1 deleted (13 files touched)

---

## Coordination Notes

**Step Dependencies:**

- **Steps 1-6 (Bundle Loading):** Sequential execution required
  - Step 1 must complete first (creates helper function)
  - Steps 2-5 depend on Step 1 (commands use helper)
  - Step 6 depends on Steps 2-5 complete (safe to delete deprecated code after all usages removed)

- **Steps 7-8 (Handshake Reversal):** Tightly coupled, must complete together
  - Step 7 (WebviewClient changes) and Step 8 (Extension changes) are atomic
  - Cannot deploy Step 7 without Step 8 (handshake protocol must match both sides)
  - Consider single combined step for safety

- **Step 9 (Verification):** Depends on all previous steps complete

**Integration Points:**

- **Bundle Loading → Handshake:** Steps 1-6 fix bundle loading, enabling JavaScript execution. Step 7-8 fix handshake timing. Both required for complete fix.
- **Test Strategy:** Unit tests (Steps 1, 7, 8) validate individual components. Integration test (Step 8) validates protocol. E2E test (Step 9) validates entire flow.
- **Manual Verification:** Step 9 includes manual DevTools inspection to catch issues automated tests might miss (CSP violations, bundle load order)

**Communication Pattern:**

Current (Extension-Initiated - BROKEN):
```
Extension: Send __extension_ready__ (too early)
Webview:   [bundles loading... no listener yet]
Webview:   Ready (but message already sent - LOST)
Extension: Timeout after 15 seconds
```

New (Webview-Initiated - FIXED):
```
Extension: Set HTML, register listener (ready to receive)
Webview:   [bundles load...]
Webview:   Send __webview_ready__ (only when actually ready)
Extension: Receive ready, send __handshake_complete__
Both:      Flush message queues, begin normal communication
```

---

## Next Actions

**After Plan Approval:**
1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@webview-handshake-race-condition-fix"`
3. **Quality Gates:** Efficiency Agent → Security Agent (after all steps complete)
4. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@webview-handshake-race-condition-fix"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md, step-02.md, ..., step-09.md_
