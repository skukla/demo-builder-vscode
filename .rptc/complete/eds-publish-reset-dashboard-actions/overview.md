# Implementation Plan: EDS Publish and Reset Dashboard Actions

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review (SKIPPED - disabled for small feature)
- [x] Security Review (SKIPPED - disabled, reuses existing authenticated services)
- [x] Complete

**Created:** 2026-01-12

---

## Executive Summary

**Feature:** Add Publish and Reset action buttons to the EDS project dashboard for force-refreshing CDN content and recreating the project from template.

**Purpose:** Enable users to manually trigger a full content publish to CDN (when automatic publishing fails or content is stale) and reset their EDS project to a clean state from the original template.

**Approach:** 3-step implementation adding handlers to `dashboardHandlers.ts`, then UI buttons to `ActionGrid.tsx` and hooks to `useDashboardActions.ts`. Reuses existing `HelixService`, `CleanupService`, and `EdsProjectService`.

**Estimated Complexity:** Small

**Key Risks:** Reset action is destructive - requires confirmation dialog to prevent accidental data loss.

---

## Test Strategy

**Framework:** Jest with ts-jest
**Coverage Goal:** 80%+
**Test Distribution:** Unit tests with mocked dependencies (NO integration tests)

**Test Scenarios Summary:**

- Detailed test scenarios are in each step file (step-01.md, step-02.md, step-03.md)

**Testing Constraints:**

- Unit tests ONLY - avoid integration tests (PM concern: hanging tests)
- All dependencies mocked (HelixService, CleanupService, EdsProjectService, vscode.window)
- Use Jest fake timers for any async operations
- Explicit test timeouts as safety net

---

## Acceptance Criteria

- [x] Publish button appears on EDS project dashboard
- [x] Publish action calls `HelixService.publishAllSiteContent()` and shows success/error
- [x] Reset button appears on EDS project dashboard
- [x] Reset action shows confirmation dialog before executing
- [x] Reset action cleans up EDS resources and recreates from template
- [x] All unit tests pass (21 tests across 3 files)
- [x] No new integration tests added

---

## Risk Assessment

### Risk 1: Destructive Reset Action
- **Category:** UX/Data Safety
- **Likelihood:** Medium
- **Impact:** High
- **Mitigation:** Use `vscode.window.showWarningMessage()` with `modal: true` and explicit confirmation button text ("Reset Project")

### Risk 2: Long-Running Operations
- **Category:** UX
- **Likelihood:** Medium
- **Impact:** Low
- **Mitigation:** Show progress notifications via existing `context.panel.webview.postMessage()` pattern; disable buttons during operation

---

## File Reference Map

### Existing Files to Modify:
- `src/features/dashboard/handlers/dashboardHandlers.ts` - Add `handlePublishEds` and `handleResetEds` handlers
- `src/features/dashboard/ui/components/ActionGrid.tsx` - Add Publish/Reset buttons with EDS conditional rendering
- `src/features/dashboard/ui/hooks/useDashboardActions.ts` - Add `handlePublishEds`/`handleResetEds` callbacks

### New Files to Create:
- None (all changes to existing files)

### Test Files:
- `tests/features/dashboard/handlers/dashboardHandlers-eds.test.ts` - Handler unit tests (Steps 1-2)
- `tests/features/dashboard/ui/components/ActionGrid.test.tsx` - UI component tests (Step 3, new describe block)
- `tests/features/dashboard/ui/hooks/useDashboardActions.test.ts` - Hook tests (Step 3, new describe block)

---

## Coordination Notes

**Step Dependencies:**

- Step 3 (UI) depends on Step 1 & 2 (handlers) for message types

**Integration Points:**

- `HelixService` (existing) - for publish via `publishAllSiteContent()`
- `CleanupService` (existing) - for reset cleanup via `cleanupEdsResources()`
- `EdsProjectService` (existing) - for reset recreation via `setupProject()`

---

## Configuration

**Efficiency Review:** disabled (small feature, 3 files modified)
**Security Review:** disabled (no security-sensitive changes, reuses existing authenticated services)

---

## Next Actions

To execute this plan:

```bash
/rptc:tdd "@eds-publish-reset-dashboard-actions/"
```
