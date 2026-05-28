# Implementation Plan: Debug EDS Project Creation Inconsistencies

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review (skipped - logging only)
- [x] Complete

**Created:** 2026-01-09

---

## Executive Summary

**Feature:** Add strategic logging to diagnose EDS project creation inconsistencies

**Purpose:** Understand why GitHub repos and DA.live projects intermittently fail to appear in selection lists, and why AEM Code Sync checks do not re-run on retry

**Approach:** Instrument 4 key areas with diagnostic logging: GitHub repo listing, DA.live project listing, pre-flight checks, and state cleanup. Capture timestamps, API responses, cache states, and error details.

**Estimated Complexity:** Simple (logging only, no behavior changes)

**Estimated Timeline:** 2-3 hours

**Key Risks:**
- Excessive logging could impact performance or clutter output
- Log statements may need removal after diagnosis

---

## Test Strategy

### Testing Approach

- **Framework:** Manual verification with log comparison
- **Coverage Goal:** All 6 identified root causes observable via logs

### Verification Method

1. Trigger EDS project creation flow
2. Observe logs in "Demo Builder: Debug" channel
3. Compare log output between successful and failed attempts
4. Identify which root cause matches observed behavior

---

## Acceptance Criteria

- [x] GitHub repo listing logs: API call params, response count, pagination info
- [x] DA.live project listing logs: auth state, API response, error details
- [x] Pre-flight check logs: trigger conditions, useEffect dependencies, retry state
- [x] State cleanup logs: cache clear events, state reset timing
- [x] Logs sufficient to identify root cause from 6 candidates

---

## Risk Assessment

### Risk 1: Log Volume

- **Category:** Performance
- **Likelihood:** Low
- **Impact:** Low
- **Mitigation:** Use Debug channel only, structured log format

---

## File Reference Map

### Files to Modify

- `src/features/eds/services/githubRepoOperations.ts` - GitHub listing logs
- `src/features/eds/handlers/edsDaLiveOrgHandlers.ts` - DA.live listing logs
- `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` - Pre-flight check logs
- `src/features/eds/handlers/edsHelpers.ts` - Cache/state cleanup logs

---

## Implementation Constraints

- File Size: <500 lines (standard)
- Dependencies: Use existing DebugLogger only
- Platforms: VS Code Extension

---

## Next Actions

Execute with: `/rptc:tdd "@debug-eds-project-creation-inconsistencies/"`
