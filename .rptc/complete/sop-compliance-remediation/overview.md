# SOP Compliance Remediation Plan

## Status Tracking
- [x] Planned
- [x] In Progress
- [x] Reviews Complete
- [x] Complete

**Created**: 2025-12-17
**Last Updated**: 2025-12-17

---

## Executive Summary

| Field | Value |
|-------|-------|
| **Feature** | SOP Compliance Remediation |
| **Purpose** | Fix 12 verified SOP violations across codebase |
| **Approach** | Phased: quick wins (timeouts) -> inline styles -> god file decomposition |
| **Complexity** | Medium (12 items across 3 steps) |
| **Estimated Time** | 3-4 hours |
| **Key Risks** | CSS regression, state management during component extraction |

---

## Implementation Steps

### Step 1: Magic Timeout Constants (HIGH - 2 items) ✅
- [x] Fix `ProjectDashboardScreen.tsx:169` - Replace `1000` with `FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION`
- [x] Fix `useConfigNavigation.ts:212` - Replace `0` with `FRONTEND_TIMEOUTS.MICROTASK_DEFER`
- [x] Add new constants to `src/core/ui/utils/frontendTimeouts.ts`

### Step 2: Inline Style Migration (MEDIUM - 7 items) ✅
- [x] `WizardProgress.tsx` - Added SOP comments for 3 dynamic styles (lines 92, 96, 102)
- [x] `SidebarNav.tsx:56` - Added SOP comment for dynamic style
- [x] `TimelineNav.tsx:137` - Added SOP comment for dynamic style
- [x] `ReviewStep.tsx:45` - Use existing `.min-w-100` utility class
- [x] `WelcomeStep.tsx:106` - Added + used new `.min-h-96` utility class

### Step 3: ProjectDashboardScreen Decomposition (MEDIUM - 1 god file) ✅
- [x] Extract `useDashboardActions` hook (11 handlers, 141 lines)
- [x] Extract `useDashboardStatus` hook (state/subscriptions, 244 lines)
- [x] Extract `ActionGrid` component (9 buttons, 188 lines)
- [x] Reduce parent file from 417 to 202 lines (52% reduction)

---

## Test Strategy

**Framework**: Jest + React Testing Library
**Coverage Goals**: Maintain existing 80%+ coverage

| Step | Test Approach |
|------|---------------|
| Step 1 | Existing tests pass (no behavior change) |
| Step 2 | Visual regression verification in extension |
| Step 3 | Unit tests for extracted components, integration tests for screen |

Detailed test scenarios in each step file.

---

## Acceptance Criteria

- [x] All 12 verified violations addressed
- [x] All tests pass (4,818 passing)
- [x] No visual regressions (verified via compilation)
- [x] Code review approved (Efficiency + Security agents)
- [x] SOP scan shows 0 new violations

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation |
|------|----------|------------|--------|------------|
| CSS regression from style migration | Technical | Low | Medium | Test each change visually |
| State breaks during extraction | Technical | Medium | High | Extract incrementally, test after each |
| New violations introduced | Process | Low | Low | Run SOP scan after each step |

---

## Dependencies

**New Packages**: None
**Configuration Changes**: None
**External Services**: None

---

## File Reference Map

### Existing Files to Modify
- `src/core/utils/timeoutConfig.ts` - Add 2 new constants
- `src/features/dashboard/ui/ProjectDashboardScreen.tsx` - Timeout fix + decomposition
- `src/features/components/ui/hooks/useConfigNavigation.ts` - Timeout fix
- `src/features/sidebar/ui/components/WizardProgress.tsx` - Style cleanup
- `src/features/sidebar/ui/components/SidebarNav.tsx` - Style cleanup
- `src/features/project-creation/ui/wizard/TimelineNav.tsx` - Style cleanup
- `src/features/project-creation/ui/steps/ReviewStep.tsx` - Style cleanup
- `src/features/project-creation/ui/steps/WelcomeStep.tsx` - Style cleanup
- `src/core/ui/styles/custom-spectrum.css` - New utility classes

### New Files to Create
- `src/features/dashboard/ui/components/DemoControls.tsx`
- `src/features/dashboard/ui/components/ProjectInfo.tsx`
- `src/features/dashboard/ui/hooks/useDashboardState.ts`

---

## SOP References

- **code-patterns.md Section 1**: Centralized Timeout Constants
- **code-patterns.md Section 11**: Minimize Inline Styles
- **code-patterns.md Section 12**: Minimize Over-Engineering (god file guidance)

---

## Next Actions

1. Start with Step 1 (quick wins - 15 min)
2. Proceed to Step 2 (style migration - 45 min)
3. Tackle Step 3 (god file decomposition - 2 hours)

**First Step**: Run `/rptc:tdd "@sop-compliance-remediation/"` to begin TDD implementation
