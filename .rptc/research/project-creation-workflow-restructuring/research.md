# Research: Project Creation Workflow Restructuring

**Date:** 2026-01-09
**Topic:** Should GitHub/DA.live operations be separated into a dedicated wizard step before project creation?
**Scope:** Codebase analysis
**Status:** Complete

---

## Executive Summary

This research analyzes the feasibility and impact of restructuring the project creation workflow to move GitHub and DA.live operations into a dedicated wizard step that runs **before** the project creation phase. This architectural change would solve the config.json timing issue where the mesh endpoint isn't available when config.json is first pushed to GitHub.

**Key Finding:** The proposal is **highly feasible** and would provide significant benefits including better error recovery, cleaner UX, and permanent resolution of the config.json timing problem.

---

## Background: The Timing Problem

### Current Issue

The project creation workflow has a timing dependency issue:

1. **EDS Setup** runs at 16-30% progress (Phase 0 in executor.ts)
   - Creates GitHub repository
   - Pushes config.json with **empty** `commerce-core-endpoint`

2. **Mesh Deployment** runs at 70-85% progress (Phase 3)
   - Deploys mesh to Adobe I/O
   - Mesh endpoint **now available**

3. **EDS Post-Mesh** (recently added fix) runs at 85-86%
   - Updates config.json with mesh endpoint
   - Re-pushes to GitHub

This results in config.json being pushed **twice** - once with empty endpoint, once with correct endpoint.

### PM's Proposal

Move the actual EDS operations (repo creation, DA.live content, Helix config) into a dedicated wizard step that runs **before** project creation. This way:

- EDS resources are provisioned during wizard
- Project creation only handles local operations + mesh deployment
- config.json can be pushed **once** after mesh deployment with correct endpoint

---

## Current Architecture Analysis

### Wizard Step Flow

**Current Steps** (from `wizard-steps.json`):

| # | Step | Purpose |
|---|------|---------|
| 1 | welcome | Brand/stack selection + project name |
| 2 | component-selection | Manual component selection |
| 3 | prerequisites | Tool verification |
| 4 | adobe-auth | Adobe authentication |
| 5 | adobe-project | Adobe I/O project selection |
| 6 | adobe-workspace | Workspace selection |
| 7 | eds-connect-services | GitHub + DA.live **auth** (conditional) |
| 8 | eds-repository-config | GitHub repo **config** (conditional) |
| 9 | eds-data-source | DA.live site **config** (conditional) |
| 10 | settings | Component settings collection |
| 11 | review | Final configuration review |
| 12 | project-creation | Project creation execution |

**Key Insight:** Steps 7-9 handle **authentication and configuration** only. The actual **operations** (repo creation, content population) happen in `executor.ts` Phase 4.

### Project Creation Phases

**File:** `src/features/project-creation/handlers/executor.ts`

| Phase | Lines | Operations | Progress |
|-------|-------|------------|----------|
| Pre-Flight | 168-200 | Port checks, directory setup | 0-5% |
| Phase 0: EDS | 244-401 | GitHub repo, DA.live, Helix, config.json | 16-30% |
| Phase 1-2 | 458-470 | Clone & install components | 30-70% |
| Phase 3: Mesh | 473-568 | Deploy mesh, get endpoint | 70-85% |
| EDS Post-Mesh | 570-640 | Update config.json with endpoint | 85-86% |
| Phase 4-5 | 643-678 | Generate env files, save state | 86-100% |

### Data Flow

```
Pre-Flight
    ↓
EDS Setup (Phase 0)
    ├→ edsResult.repoUrl
    ├→ project.componentInstances['eds-storefront']
    └→ config.json pushed (EMPTY commerce-core-endpoint)
    ↓
Component Installation (Phase 1-2)
    └→ All components cloned/installed
    ↓
Mesh Deployment (Phase 3)
    └→ project.meshState.endpoint NOW AVAILABLE
    ↓
EDS Post-Mesh
    └→ config.json RE-PUSHED (with endpoint)
    ↓
Finalization (Phase 4-5)
    └→ Project saved
```

---

## Implementation Options

### Option 1: Keep Current Architecture (With Fix)

**Description:** Status quo - EDS operations remain in executor.ts Phase 4, with Post-Mesh phase handling config.json update.

**Pros:**
- No additional work required
- Single progress bar during project creation
- Proven stable

**Cons:**
- Long project creation phase (~2-3 min for EDS)
- If failure at 80% progress, user loses all progress
- config.json timing complexity (two-phase push)

**Effort:** None (already implemented)

---

### Option 2: Combined EDS Preflight Step (Recommended)

**Description:** Create a new wizard step that combines GitHub repo creation + DA.live content population + Helix configuration before project creation.

**New Wizard Flow:**

| # | Step | Change |
|---|------|--------|
| 1-6 | welcome → adobe-workspace | No change |
| 7 | eds-connect-services | Auth only (existing) |
| 8 | **eds-preflight** | **NEW: Repo + DA.live + Helix operations** |
| 9 | settings | No change |
| 10 | review | No change |
| 11 | project-creation | Skip EDS operations |

**What the new step would do:**
1. Create/select GitHub repository
2. Clone CitiSignal template (if new repo)
3. Configure Helix 5 fstab.yaml
4. Verify code sync
5. Populate DA.live content
6. Clone ingestion tools

**What project creation would do:**
- Skip EDS resource creation (already done)
- Clone pre-created repo locally
- Install components + mesh
- Generate config.json **after mesh has endpoint**
- Push config.json **once** (with correct endpoint!)

**Pros:**
- **Solves config.json timing permanently** - Single push with correct endpoint
- **Better UX** - Users see dedicated EDS setup progress
- **Better error recovery** - If EDS fails, retry that step without losing other work
- **Cleaner separation** - Project creation focuses on local operations
- **Matches user mental model** - "Set up GitHub" then "Create project"

**Cons:**
- Long-running operations in wizard (~60-90 seconds)
- Need to handle "user closes wizard mid-operation" case
- If user cancels after EDS step, orphaned GitHub repo (cleanup needed)

**Effort:** Medium (2-3 days)

---

### Option 3: Split into Two Separate Steps

**Description:** Instead of one combined step, have separate steps for GitHub and DA.live.

**New Wizard Flow:**
```
7. eds-connect-services (auth)
8. eds-github-setup (repo creation + Helix)
9. eds-dalive-setup (content population)
10. settings
11. review
12. project-creation
```

**Pros:**
- Finer-grained progress visibility
- Easier error isolation (GitHub vs DA.live failures)

**Cons:**
- More wizard steps (longer flow)
- DA.live depends on GitHub anyway

**Effort:** Medium-High (3-4 days)

---

## Comparison Matrix

| Criterion | Option 1 (Current) | Option 2 (Combined) | Option 3 (Split) |
|-----------|-------------------|---------------------|------------------|
| **config.json timing** | Two-phase push | Single push ✓ | Single push ✓ |
| **Error recovery** | Lose all progress | Retry EDS step ✓ | Retry specific step ✓ |
| **User visibility** | Single progress bar | Dedicated progress ✓ | Multiple progress bars |
| **Wizard length** | 12 steps | 11 steps ✓ | 13 steps |
| **Implementation effort** | None | Medium | Medium-High |
| **Risk** | None | Low-Medium | Medium |

---

## config.json Timing Solution

### How Option 2 Solves the Problem

**Current Flow (Two Pushes):**
```
EDS Setup (Phase 0)
  └→ config.json pushed with EMPTY endpoint

Mesh Deployment (Phase 3)
  └→ Endpoint available

EDS Post-Mesh
  └→ config.json RE-PUSHED with endpoint
```

**Proposed Flow (Single Push):**
```
Wizard: EDS Preflight Step
  ├→ GitHub repo created
  ├→ DA.live content populated
  ├→ Helix configured
  └→ config.json NOT pushed yet

Project Creation:
  ├→ Clone repo locally
  ├→ Install components
  ├→ Deploy mesh → endpoint available
  └→ Generate & push config.json WITH endpoint (single push!)
```

This eliminates the two-phase push entirely.

---

## Technical Feasibility

### Why This Is Feasible

1. **Services are modular** - GitHub/DA.live services (`GitHubRepoPhase`, `ContentPhase`) can be called from wizard or executor

2. **State management ready** - `WizardState.edsConfig` already stores GitHub/DA.live configuration

3. **Patterns exist** - Adobe Auth step already handles external auth flows with similar UX

4. **Cleanup service exists** - `cleanupService.ts` handles orphaned resource cleanup

### Key Files to Modify

| File | Change |
|------|--------|
| `wizard-steps.json` | Add new `eds-preflight` step |
| NEW: `EdsPreflightStep.tsx` | Combined GitHub + DA.live operations |
| `executor.ts` | Skip EDS resource creation, use existing |
| `WizardContainer.tsx` | Wire new step |
| `stepFiltering.ts` | Add conditions for new step |

### Files NOT Needing Change

- `src/features/eds/services/*` - Services work from wizard or executor
- `src/types/webview.ts` - State shape already supports this
- `src/features/authentication/*` - Separate, orthogonal

---

## Challenges and Mitigations

### Challenge 1: Long-Running Operations in Wizard

**Issue:** Repository creation takes 60-90 seconds

**Mitigation:**
- Use `LoadingDisplay` component (existing pattern)
- Show granular progress (Creating repo... Configuring Helix... Populating content...)
- Disable Cancel button during critical operations

### Challenge 2: User Cancels Mid-Operation

**Issue:** If user cancels after GitHub repo created but before completion, orphaned repo

**Mitigation:**
- Show confirmation dialog: "Repository created but setup incomplete. Canceling will delete it."
- Use `CleanupService` to delete orphaned resources
- Track partial state for recovery

### Challenge 3: Error Recovery

**Issue:** If one operation fails, need clean retry

**Mitigation:**
- Track completed operations in wizard state
- On retry, skip completed operations
- Clear error state on retry

---

## Recommendation

**Proceed with Option 2 (Combined EDS Preflight Step)**

### Rationale

1. **Solves the root cause** - config.json pushed once with correct endpoint, no Post-Mesh phase needed

2. **Better user experience** - Users see EDS setup as distinct from project creation, matches mental model

3. **Better resilience** - EDS failures don't lose component installation progress

4. **Architecturally clean** - Services already modular, minimal code changes

5. **Net reduction in complexity** - Eliminates two-phase config.json push, removes Post-Mesh phase

### Implementation Approach

1. Create `EdsPreflightStep.tsx` combining repo + DA.live + Helix operations
2. Update `wizard-steps.json` to add new step (replacing config-only steps)
3. Modify `executor.ts` to skip resource creation, use pre-created resources
4. Add progress tracking for new step operations
5. Implement cancel/cleanup handling

### Estimated Effort

- **Development:** 2-3 days
- **Testing:** 1 day
- **Total:** 3-4 days

---

## Key Takeaways

1. **The proposal is highly feasible** - Codebase architecture already supports this pattern

2. **This would solve config.json timing permanently** - No more two-phase push

3. **Services are ready** - GitHub/DA.live services work from wizard or executor

4. **Cleanup exists** - `cleanupService.ts` handles orphaned resources

5. **UX improvement** - Users get better visibility and error recovery

---

## References

### Key Files Analyzed

- `src/features/project-creation/handlers/executor.ts` - Main orchestration
- `src/features/project-creation/config/wizard-steps.json` - Step definitions
- `src/features/eds/services/edsSetupPhases.ts` - EDS phase operations
- `src/features/eds/services/edsProjectService.ts` - EDS project service
- `src/features/eds/ui/steps/` - Existing EDS wizard steps
- `src/types/webview.ts` - Wizard state types
- `src/features/project-creation/ui/wizard/stepFiltering.ts` - Step visibility logic

### Related Documentation

- `src/features/eds/README.md` - EDS feature documentation
- `src/features/CLAUDE.md` - Feature architecture overview

---

*Research conducted using RPTC workflow codebase exploration*
