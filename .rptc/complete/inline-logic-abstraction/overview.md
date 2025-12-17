# Inline Logic Abstraction Plan

## Status Tracking
- [x] Planned
- [x] In Progress
- [ ] Complete

**Created:** 2025-11-27
**Last Updated:** 2025-11-27

---

## Completed Work

### Phase A1 Complete (2025-11-27)

**Files Deleted:**
| File | Lines | Reason |
|------|-------|--------|
| `src/commands/deleteProject.ts` | 84 | Features version better (has retry logic) |
| `src/commands/resetAll.ts` | 105 | Core version better (has security) |
| `src/commands/viewStatus.ts` | 89 | Ported improvements to features version |
| `src/commands/helpers/` (directory) | 132 | Dead code (no imports) |
| `src/features/dashboard/commands/configureQuickPick.ts` | 172 | Orphaned (never used) |

**Files Modified:**
- `src/commands/commandManager.ts` - Updated imports to use features/core locations
- `src/features/lifecycle/commands/viewStatus.ts` - Ported cleaner method structure from legacy
- `tests/core/commands/commandManager.test.ts` - Updated mock paths

**Total Lines Removed:** ~582 lines

**Remaining in src/commands/:**
- `commandManager.ts` - Command registration (essential)
- `configure.ts` - ConfigureCommand (actively used)
- `diagnostics.ts` - DiagnosticsCommand (actively used)
- `handlers/HandlerContext.ts` - Shared infrastructure (essential)
- `handlers/HandlerRegistry.ts` - Shared infrastructure (essential)

### Phase A2 Complete (2025-11-27)

**Orphaned UI Components Deleted:**
| File/Directory | Lines | Reason |
|----------------|-------|--------|
| `src/features/components/ui/steps/components/` | 664 | Entire directory orphaned (never imported) |
| `src/core/ui/components/ui/ConfigurationSummary.tsx` | 238 | Features version is used |
| `src/features/dashboard/ui/components/` | 237 | NavigationPanel orphan (core version used) |
| `tests/features/components/ui/steps/components/` | ~400 | Tests for deleted orphans |

**Files Modified:**
- `src/core/ui/components/ui/index.ts` - Removed ConfigurationSummary export
- `src/features/dashboard/ui/index.ts` - Removed NavigationPanel export

**Total Lines Removed:** ~1,539 lines (1,139 source + ~400 tests)

---

## Executive Summary

**Purpose:** Clean up code duplication and extract inline business logic for better testability and reuse.

**Source:** jscpd scan found **110 duplicate clones** across the codebase (4.62% duplication).

---

## Phase A: Clean Up Duplicates (Me - Direct)

### A1: Delete Legacy Files ✅ COMPLETE

| Legacy File | Status | Notes |
|-------------|--------|-------|
| `src/commands/viewStatus.ts` | ✅ DELETED | Ported improvements to features version |
| `src/commands/deleteProject.ts` | ✅ DELETED | Features version better (retry logic) |
| `src/commands/resetAll.ts` | ✅ DELETED | Core version better (security) |
| `src/commands/helpers/` | ✅ DELETED | Dead code (no imports) |
| `src/features/dashboard/commands/configureQuickPick.ts` | ✅ DELETED | Orphan (never used) |
| `src/commands/configure.ts` | ⏭️ KEPT | Actively used, not duplicate |
| `src/commands/handlers/` | ⏭️ KEPT | Shared infrastructure, not duplicate |

### A2: Consolidate UI Components ✅ COMPLETE

| Component | Status | Notes |
|-----------|--------|-------|
| `ConfigurationSummary.tsx` | ✅ DELETED core version | Features version actively used |
| `NavigationPanel.tsx` | ✅ DELETED dashboard version | Core version actively used by ConfigureScreen |
| `ConfigNavigationPanel.tsx` | ✅ DELETED steps/components version | ui/components version actively used |
| `FieldRenderer.tsx` | ✅ DELETED | ConfigFieldRenderer.tsx is used |
| `BackendSelector.tsx` | ✅ DELETED | Orphan in steps/components |
| `FrontendSelector.tsx` | ✅ DELETED | Orphan in steps/components |
| `DependencySelector.tsx` | ✅ DELETED | Orphan in steps/components |
| `ConfigurationForm.tsx` | ✅ DELETED | Orphan in steps/components |

### A3: Within-File Duplicates - ANALYSIS COMPLETE (2025-11-27)

#### Analysis Summary

| File | Duplication | Verdict | Action |
|------|-------------|---------|--------|
| `progressUnifier.ts` | ~80 lines | ⏭️ SKIP | Complex progress strategies, extraction adds abstraction cost |
| `dashboardHandlers.ts` | ~60 lines | ⏭️ SKIP | Status payload construction varies by context |
| `AdobeProjectStep.tsx` + `AdobeWorkspaceStep.tsx` | ~100 shared | ⏭️ SKIP | `useSelectionStep` hook already extracts logic; remaining is JSX with entity-specific text |
| `checkHandler.ts` + `continueHandler.ts` | ~50 shared | ⚠️ CANDIDATE | Error handling and per-node-version logic repeated |
| `useMeshOperations.ts` | ~40 internal | ⚠️ CANDIDATE | `createMesh`/`recreateMesh` have ~30 identical lines |

#### Detailed Analysis

**1. AdobeProjectStep + AdobeWorkspaceStep (~260 + ~240 lines)**

The `useSelectionStep` hook already extracts all shared logic:
- Loading, caching, filtering, auto-select, error handling
- Remaining code is mostly JSX with entity-specific:
  - Types: `AdobeProject` vs `Workspace`
  - Messages: "Loading projects" vs "Loading workspaces"
  - Validation: org vs project dependency
  - Display: description vs name subtitle

**Verdict**: ⏭️ SKIP - Hook already handles abstraction. Further extraction would add complexity for marginal benefit.

---

**2. checkHandler + continueHandler (~280 + ~220 lines)**

**Duplicated Patterns:**
1. **Timeout error handling** (~30 lines each):
   ```typescript
   // Identical pattern in both files
   if (isTimeoutError(error)) {
       context.logger.warn(`[Prerequisites] ${prereq.name} check timed out...`);
       context.stepLogger?.log('prerequisites', `⏱️ ${prereq.name} check timed out...`, 'warn');
   } else {
       context.logger.error(`[Prerequisites] Failed to check ${prereq.name}:`, error);
   }
   await context.sendMessage('prerequisite-status', { index, status: 'error', ... });
   ```

2. **Per-node-version status checking** (~40 lines each):
   - Both populate `perNodeVersionStatus` array
   - Both track `perNodeVariantMissing` and `missingVariantMajors`
   - Both iterate `requiredMajors` with same logic

3. **Status message construction** (repeated 3-4x each):
   ```typescript
   await context.sendMessage('prerequisite-status', {
       index, name, status, description, required, installed, version, message, canInstall, plugins, nodeVersionStatus
   });
   ```

**Extraction Opportunity:**
- Extract `handlePrerequisiteError(context, prereq, index, error)` helper
- The `shared.ts` file already has `checkPerNodeVersionStatus` but continueHandler doesn't use it

**Verdict**: ⚠️ CANDIDATE - Could extract error handling helper to `shared.ts`. Medium impact (~50 lines saved).

---

**3. useMeshOperations (~367 lines)**

**Duplicated Patterns:**
1. **createMesh vs recreateMesh** share ~30 identical lines:
   ```typescript
   // Success handling - identical in both
   if (result?.success) {
       updateState({ apiMesh: { isChecking: false, apiEnabled: true, meshExists: true, ... } });
       setMeshData({ meshId: result.meshId, status: 'deployed', endpoint: result.endpoint });
       setCanProceed(true);
   } else if (result?.meshExists && result?.meshStatus === 'error') {
       // Error handling - identical
   }
   ```

2. **apiMesh state updates** (repeated 10+ times):
   - Similar object spread patterns
   - Same fields set in multiple places

**Extraction Opportunity:**
- Extract `handleMeshResult(result, setters)` for success/error handling
- Create `setApiMeshState(updates)` wrapper for consistent state updates

**Verdict**: ⚠️ CANDIDATE - Could extract result handler. Medium impact (~30 lines saved).

---

**4. progressUnifier.ts + dashboardHandlers.ts**

Previously analyzed - duplication is structural (similar object shapes) not logic. Extraction would add abstraction without meaningful reuse.

**Verdict**: ⏭️ SKIP - Structural similarity, not logic duplication.

---

#### Recommended Actions

**Skip (Low ROI):**
- progressUnifier.ts - Progress strategies are intentionally different
- dashboardHandlers.ts - Status payloads vary by handler context
- AdobeProjectStep + AdobeWorkspaceStep - Already abstracted via hook

**Consider (Medium ROI):**
1. **checkHandler + continueHandler**: Extract `handlePrerequisiteCheckError()` to shared.ts
2. **useMeshOperations**: Extract `handleMeshCreationResult()` helper

**Total Estimated Lines Saveable:** ~80 lines (if both candidates implemented)

---

#### Phase A3 Decision

Given the analysis:
- Most "duplication" is already well-abstracted or is structural similarity
- The 2 candidates would save ~80 lines but add abstraction complexity
- The main wins came from A1 (~582 lines) and A2 (~1,539 lines)

**Recommendation:** Mark Phase A3 as ANALYZED. Skip refactoring for now since ROI is low. The codebase is already well-structured with hooks and shared utilities extracting most common patterns.

### A4: Cross-Component Duplicates - OBSOLETE

**Status:** Most items resolved by Phase A2 deletions.

| Clone | Status | Notes |
|-------|--------|-------|
| Backend/Frontend Selector | ✅ DELETED | Orphans removed in A2 |
| FieldRenderer.tsx | ✅ DELETED | Orphan removed in A2 |
| Error/Success States | ⏭️ SKIP | Different contexts (auth vs mesh), low duplication |

**Remaining:** No actionable cross-component duplicates identified.

---

## Phase B: Find Inline Business Logic (Agents - Parallel)

Deploy 4 agents to search for extractable inline logic:

### Agent 1: Authentication Feature
- Search: `src/features/authentication/`
- Look for: validation logic, permission checks, token processing, org/project filtering

### Agent 2: Components Feature
- Search: `src/features/components/`
- Look for: config parsing, field validation, dependency resolution, env var processing

### Agent 3: Dashboard/Lifecycle Features
- Search: `src/features/dashboard/`, `src/features/lifecycle/`
- Look for: state transformations, status calculations, process management logic

### Agent 4: Prerequisites/Mesh Features
- Search: `src/features/prerequisites/`, `src/features/mesh/`
- Look for: version comparisons, installation logic, mesh config building, API response parsing

---

## jscpd Full Results Summary

```
┌────────────┬────────────────┬─────────────┬──────────────┬──────────────┬──────────────────┬───────────────────┐
│ Format     │ Files analyzed │ Total lines │ Total tokens │ Clones found │ Duplicated lines │ Duplicated tokens │
├────────────┼────────────────┼─────────────┼──────────────┼──────────────┼──────────────────┼───────────────────┤
│ javascript │ 63             │ 3393        │ 31053        │ 10           │ 575 (16.95%)     │ 5552 (17.88%)     │
│ tsx        │ 67             │ 9362        │ 75521        │ 41           │ 959 (10.24%)     │ 8622 (11.42%)     │
│ css        │ 10             │ 783         │ 3785         │ 1            │ 34 (4.34%)       │ 127 (3.36%)       │
│ typescript │ 201            │ 33024       │ 234542       │ 58           │ 1018 (3.08%)     │ 9241 (3.94%)      │
│ Total:     │ 361            │ 55996       │ 402971       │ 110          │ 2586 (4.62%)     │ 23542 (5.84%)     │
└────────────┴────────────────┴─────────────┴──────────────┴──────────────┴──────────────────┴───────────────────┘
```

**No circular dependencies found** (madge check passed)

---

## Execution Order

1. **Phase A1** - Delete legacy files (quick wins, ~30 min)
2. **Phase A2** - Consolidate UI components (~2 hours)
3. **Phase A3** - Refactor within-file duplicates (~4 hours)
4. **Phase A4** - Cross-component extractions (~3 hours)
5. **Phase B** - Agent-based inline logic search (~1 hour search, variable fix time)

---

## Expected Impact

| Metric | Before | After (Est.) |
|--------|--------|--------------|
| Duplicate lines | 2,586 (4.62%) | ~500 (0.9%) |
| Files | 270 | ~255 |
| Clones | 110 | ~20 |

---

## Notes

- Always run tests after each deletion/consolidation
- Update imports across codebase when moving files
- Some duplicates may be intentional (copy for customization) - verify before deleting
