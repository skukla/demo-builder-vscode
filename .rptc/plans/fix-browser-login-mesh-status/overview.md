# Fix Browser Login During Mesh Status Check

## Status Tracking

- [x] Planned
- [ ] In Progress
- [ ] Complete

## Executive Summary

| Attribute | Value |
|-----------|-------|
| **Feature** | Fix automatic browser login during mesh status check |
| **Purpose** | Prevent unexpected browser windows when checking mesh deployment status |
| **Approach** | Replace Adobe CLI command with direct token inspection |
| **Complexity** | Simple (1 step) |
| **Key Risks** | Low - using existing tested method |

## Problem Statement

When the Project Dashboard loads, it checks mesh deployment status. The pre-flight authentication check in `stalenessDetector.ts:72` uses `aio console where --json`, which triggers an automatic browser login when the OAuth token is expired.

**Expected behavior:** Show "Session expired" status with manual re-login button.
**Actual behavior:** Browser window opens automatically for Adobe CLI login.

## Root Cause

The code comment on line 70 states the command "doesn't trigger interactive login" - this is incorrect. Adobe CLI's `aio console where` command does trigger browser-based login when the token is expired.

## Solution

Replace the CLI command with `AuthenticationService.getTokenStatus()` which:
- Reads the token file directly from `~/.aio`
- Returns token validity without invoking Adobe CLI
- Already exists and is tested (lines 113-119 of authenticationService.ts)

## Test Strategy

- **Framework:** Jest
- **Coverage Goal:** 85%+
- **Test Scenarios:** See step-01.md for details

## Acceptance Criteria

- [ ] Browser does not open automatically when token is expired
- [ ] Mesh status shows appropriate state (checking → needs-auth or deployed)
- [ ] "Sign in" button appears when token is expired
- [ ] All existing tests pass

## File Reference Map

### Existing Files to Modify

| File | Changes |
|------|---------|
| `src/features/mesh/services/stalenessDetector.ts` | Replace CLI auth check with getTokenStatus() |

### New Files to Create

None - using existing AuthenticationService method.

## Dependencies

- `AuthenticationService.getTokenStatus()` - already exists
- `TokenManager.inspectToken()` - already exists

## Next Actions

1. Run `/rptc:tdd "@fix-browser-login-mesh-status"` to implement
