# Implementation Plan: Component ID Constants Centralization

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2026-01-10
**Completed:** 2026-01-11

---

## Executive Summary

**Feature:** Centralize all hardcoded component ID string literals ('commerce-mesh', 'eds-storefront', etc.) into a single constants file.

**Purpose:** Eliminate scattered magic strings, reduce typo risks, enable IDE refactoring support, and improve code maintainability.

**Approach:** Add `COMPONENT_IDS` object to existing `src/core/constants.ts` (no new files). Migrate `EDS_COMPONENT_ID` from `src/features/eds/services/types.ts` to central location.

**Estimated Complexity:** Small (pure refactoring, no behavior changes)

**Key Risks:** Typos during find-replace, missed references in JSON config files

---

## Test Strategy

**Framework:** Jest with ts-jest

**Coverage Goal:** Maintain existing coverage (no new functionality)

**Test Distribution:** Unit tests verify constants exist; existing tests validate no regressions

**Approach:** Run full test suite after each step to catch regressions immediately

**Note:** Detailed test scenarios are in each step file (step-01.md through step-06.md)

---

## Implementation Constraints

- File Size: <500 lines (standard)
- Complexity: Simple string constant exports
- Dependencies: No new packages required
- Platforms: TypeScript strict mode
- Performance: No runtime impact (compile-time constants)

---

## Acceptance Criteria

- [x] All existing tests pass (no behavior changes) - 6627 tests passing
- [x] `npm run build` succeeds with no TypeScript errors
- [x] All ~55 'commerce-mesh' references replaced with `COMPONENT_IDS.COMMERCE_MESH`
- [x] All 6 'eds-storefront' references in typeGuards.ts replaced with `COMPONENT_IDS.EDS_STOREFRONT`
- [x] `EDS_COMPONENT_ID` (8 usages) migrated from `src/features/eds/services/types.ts` to `src/core/constants.ts`
- [x] No hardcoded component ID strings remain in TypeScript source files
- [x] All 'demo-inspector' runtime lookups replaced with `COMPONENT_IDS.DEMO_INSPECTOR` (bonus)

---

## Risk Assessment

### Risk 1: Missed References
- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium (runtime errors if string mismatch)
- **Mitigation:** Use grep to verify zero remaining hardcoded strings after each step

### Risk 2: JSON Config Files
- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low (JSON files cannot use TS constants)
- **Mitigation:** Document that JSON files retain string literals by design; TypeScript validation catches mismatches

### Risk 3: Import Path Conflicts
- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low (build fails immediately)
- **Mitigation:** Run `npm run build` after each step

---

## File Reference Map

### Constants Location
- `src/core/constants.ts` - Add COMPONENT_IDS object (existing file)

### Existing Files to Modify (24 TypeScript files)
**Core:**
- `src/types/typeGuards.ts` (6 eds-storefront)
- `src/core/vscode/StatusBarManager.ts` (1 commerce-mesh)

**Mesh Feature:**
- `src/features/mesh/commands/deployMesh.ts` (2 commerce-mesh)
- `src/features/mesh/services/stalenessDetector.ts` (3 commerce-mesh)
- `src/features/mesh/services/meshVerifier.ts` (2 commerce-mesh)
- `src/features/mesh/services/meshConfig.ts` (3 commerce-mesh)

**Project Creation:**
- `src/features/project-creation/handlers/executor.ts` (8 commerce-mesh + 8 EDS_COMPONENT_ID)
- `src/features/project-creation/services/meshSetupService.ts` (8 commerce-mesh)
- `src/features/project-creation/services/projectFinalizationService.ts` (1 commerce-mesh)
- `src/features/project-creation/services/ProjectSetupContext.ts` (1 commerce-mesh)
- `src/features/project-creation/ui/wizard/wizardHelpers.ts` (2 commerce-mesh)
- `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` (1 commerce-mesh)
- `src/features/project-creation/ui/steps/reviewStepHelpers.tsx` (3 commerce-mesh)

**Dashboard/Lifecycle:**
- `src/features/dashboard/handlers/dashboardHandlers.ts` (1 commerce-mesh)
- `src/features/dashboard/handlers/meshStatusHelpers.ts` (3 commerce-mesh)
- `src/features/dashboard/services/dashboardStatusService.ts` (3 commerce-mesh)
- `src/features/dashboard/ui/configure/ConfigureScreen.tsx` (1 commerce-mesh)
- `src/features/dashboard/ui/configure/hooks/useConfigureFields.ts` (1 commerce-mesh)

**Components:**
- `src/features/components/services/DependencyResolver.ts` (1 commerce-mesh)
- `src/features/components/ui/steps/ComponentSelectionStep.tsx` (1 commerce-mesh)

**Other Features:**
- `src/features/eds/services/types.ts` (remove EDS_COMPONENT_ID export)
- `src/features/prerequisites/handlers/shared.ts` (6 commerce-mesh)
- `src/features/updates/services/componentRepositoryResolver.ts` (1 commerce-mesh)
- `src/features/updates/services/componentUpdater.ts` (1 commerce-mesh)
- `src/features/projects-dashboard/utils/componentSummaryUtils.ts` (1 commerce-mesh)

---

## Coordination Notes

- This is a pure refactoring task - no behavior changes expected
- Steps can be done incrementally (each step is independently testable)
- Run `npm test` after each step to catch regressions immediately
- JSON config files (`components.json`, `stacks.json`, `prerequisites.json`) retain string literals by design

---

## Next Actions

```bash
/rptc:tdd "@component-id-constants/"
```
