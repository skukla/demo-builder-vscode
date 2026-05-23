# DA.live Token Re-authentication from Dashboard

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2026-01-16

---

## Executive Summary

**Feature:** Pre-check DA.live token validity before Reset operations with QuickPick-based re-authentication

**Purpose:** Provide proactive re-authentication UX when DA.live tokens expire, preventing mid-operation failures and improving user experience for dashboard Reset operations.

**Approach:**
1. Add token validity pre-check to handleResetEds in both dashboard handlers (check `isAuthenticated()` with 5-min buffer)
2. Show VS Code notification with "Sign In" button when token is expired/expiring
3. On "Sign In" click, display QuickPick mirroring wizard auth flow (Open DA.live, Paste from Clipboard)
4. Remove dead OAuth PKCE code from daLiveAuthService.ts (wizard uses bookmarklet flow)

**Estimated Complexity:** Low

**Key Risks:** QuickPick UX may differ slightly from wizard panel; token verification timing during active operations

---

## Test Strategy

**Framework:** Jest with ts-jest (Node environment)

**Coverage Goals:** 80%+ for new code

**Test Scenarios Summary:**
- Step 1: 5 unit tests - pre-check logic, notification triggering, user response handling
- Step 2: 14 unit tests - QuickPick initialization, item selection, token validation, cancellation
- Step 3: 9 unit tests - retained DaLiveAuthService functionality after PKCE removal
- **Total: ~28 tests** (detailed scenarios in each step file)

---

## Acceptance Criteria

- [ ] handleResetEds checks DA.live token validity BEFORE confirmation dialog
- [ ] Expired/expiring token triggers notification with "Sign In" action button
- [ ] "Sign In" action opens QuickPick with "Open DA.live" and "Paste from Clipboard" options
- [ ] Successfully pasted token stores and allows Reset to proceed
- [ ] User can cancel auth flow and return to dashboard without errors
- [ ] QuickPick uses wizard language: "Sign in to DA.live", "Verifying...", "Connected as {email}"
- [ ] Dead OAuth PKCE code removed from daLiveAuthService.ts (localhost callback server, PKCE utilities)
- [ ] Existing 401 handling in daLiveContentOperations.ts remains functional (separate concern)

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation |
|------|----------|------------|--------|------------|
| QuickPick UX differs from wizard panel | UX | Medium | Low | Use consistent language; QuickPick is simpler but adequate |
| Token expires mid-operation | Technical | Low | Medium | Pre-check buffer (5 min) should prevent; 401 handling exists as fallback |
| Breaking daLiveAuthService API | Technical | Low | High | Keep public API (isAuthenticated, getStoredToken, storeToken); only remove internal PKCE code |

---

## Implementation Constraints

- File Size: <500 lines (standard)
- Complexity: <50 lines/function, <10 cyclomatic
- Dependencies: No new packages; reuse existing DaLiveAuthService and vscode QuickPick API
- Patterns: Follow GitHubAppNotInstalledError handling pattern (dashboardHandlers.ts:761)
- Platform: VS Code Extension API

---

## Dependencies

**New Packages:** None

**Configuration Changes:** None

**External Services:** DA.live authentication (existing bookmarklet/token flow)

---

## File Reference Map

### Existing Files to Modify
- `src/features/projects-dashboard/handlers/dashboardHandlers.ts` - Add pre-check and QuickPick auth to handleResetEds
- `src/features/dashboard/handlers/dashboardHandlers.ts` - Add pre-check and QuickPick auth to handleResetEds
- `src/features/eds/services/daLiveAuthService.ts` - Remove dead OAuth PKCE code (keep token storage API)

### Existing Files to Reference (Not Modified)
- `src/features/eds/handlers/edsHelpers.ts` - Provides `validateDaLiveToken()` and `getDaLiveAuthService()` utilities for Step 2

### New Files to Create
- None

---

## Coordination Notes

**Step Dependencies:**
- Step 1 (pre-check + notification) must complete before Step 2 (QuickPick auth)
- Step 3 (dead code removal) is independent and can be done in parallel

**Integration Points:**
- Both dashboardHandlers.ts files share similar handleResetEds logic
- DaLiveAuthService.isAuthenticated() already checks expiration with 5-min buffer
- QuickPick flow will call existing storeToken methods from DaLiveAuthService

---

## Next Actions

1. Review this plan
2. Run `/rptc:tdd "@dalive-token-reauth-dashboard"` to begin implementation

---

_Plan created by Overview Generator Sub-Agent_
