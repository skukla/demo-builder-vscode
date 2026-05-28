# Implementation Plan: EDS Preflight Step

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2026-01-12

---

## Executive Summary

**Feature:** Move GitHub repo creation, DA.live content population, and Helix configuration into a dedicated wizard step that runs BEFORE project creation.

**Purpose:** Solve the config.json timing problem where mesh endpoint is unavailable during initial push. Currently config.json is pushed twice (empty endpoint, then updated). This change enables a single push with the correct mesh endpoint.

**Approach:** Create EdsPreflightStep component that executes GitHub/DA.live/Helix operations during wizard flow. Project creation then skips EDS resource creation and pushes config.json once after mesh deployment.

**Estimated Complexity:** Medium (2-3 days)

**Key Risks:** User cancellation mid-operation creating orphaned GitHub repos; long-running operations (60-90s) in wizard context.

---

## Test Strategy

**Note from PM:** No tests required for this implementation.

---

## Acceptance Criteria

- [x] EdsPreflightStep creates GitHub repository from CitiSignal template
- [x] EdsPreflightStep configures Helix 5 fstab.yaml and verifies code sync
- [x] EdsPreflightStep populates DA.live content
- [x] EdsPreflightStep shows granular progress (Creating repo, Configuring Helix, Copying content)
- [x] GitHubAppInstallDialog displays when AEM Code Sync app not installed
- [x] Cancel during preflight triggers CleanupService for orphaned resources
- [x] Wizard step appears between settings and review steps
- [x] Project creation skips EDS resource creation when preflight completed
- [x] config.json pushed ONCE with correct mesh endpoint after mesh deployment

---

## Risk Assessment

### Risk 1: Orphaned Resources on Cancellation
- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Mitigation:** Track partial state; trigger CleanupService on cancel; show confirmation dialog before canceling mid-operation

### Risk 2: Long-Running Operations in Wizard
- **Category:** UX
- **Likelihood:** High
- **Impact:** Low
- **Mitigation:** Use LoadingDisplay with granular progress; disable Cancel during critical operations; show elapsed time

### Risk 3: GitHub App Not Installed
- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Mitigation:** Reuse existing GitHubAppInstallDialog component with auto-detection polling

---

## Dependencies

### Existing Services (No Changes Needed)
- `edsSetupPhases.ts` - GitHub/DA.live/Helix phase operations
- `CleanupService` - Resource cleanup on cancel
- `GitHubAppInstallDialog` - GitHub App installation guidance

### Configuration Changes
- `wizard-steps.json` - Add new `eds-preflight` step definition

---

## File Reference Map

### Existing Files to Modify
- `src/features/project-creation/config/wizard-steps.json` - Add eds-preflight step
- `src/features/project-creation/handlers/executor.ts` - Skip EDS resource creation when preflight done
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Wire EdsPreflightStep

### New Files to Create
- `src/features/eds/ui/steps/EdsPreflightStep.tsx` - Combined GitHub + DA.live + Helix operations
- `src/features/eds/handlers/edsPreflightHandlers.ts` - Cancel/cleanup message handlers

---

## Coordination Notes

### Step Dependencies
- Step 1 (EdsPreflightStep component) must complete before Step 5 (wire into WizardContainer)
- Step 2 (wizard config) and Step 3 (executor modification) can proceed in parallel after Step 1
- Step 4 (cancel/cleanup handling) requires Step 1 structure and Step 3 (preflight flag)

### Integration Points
- EdsPreflightStep stores results in WizardState.edsConfig
- Executor reads edsConfig to determine if preflight completed
- CleanupService triggered via context.cleanup on cancel

---

## Next Actions

**To execute this plan:**
```bash
/rptc:tdd "@eds-preflight-step/"
```
