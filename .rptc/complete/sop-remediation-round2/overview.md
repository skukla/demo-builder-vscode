# SOP Remediation Plan - Round 2

**Created**: 2025-11-28
**SOP Version**: 2.0.0
**Total Violations**: 23
**Estimated Effort**: 3-5 hours

---

## Summary

This plan addresses 23 SOP violations discovered during the full codebase scan after the initial remediation round. The violations span 5 pattern categories across 14 files.

| Pattern | Section | Violations | Priority | Step |
|---------|---------|------------|----------|------|
| Magic Timeouts | §1 | 10 | HIGH | Step 1 |
| Nested Ternaries | §3 | 4 | MEDIUM | Step 2 |
| JSX Inline Complexity | §5 | 2 | MEDIUM | Step 3 |
| Callback Body Complexity | §6 | 3 | MEDIUM | Step 4 |
| Long Validation Chains | §10 | 4 | MEDIUM | Step 5 |

---

## Implementation Steps

### Step 1: Magic Timeout Constants (§1) - HIGH PRIORITY
**File**: `step-01-timeout-constants.md`
**Violations**: 10
**Effort**: 45-60 minutes

Add 8 new constants to `timeoutConfig.ts` and update 10 usage sites across 6 files. These are UI timing values (status bar, notifications, transitions).

### Step 2: Nested Ternary Extraction (§3)
**File**: `step-02-nested-ternaries.md`
**Violations**: 4
**Effort**: 30-45 minutes

Extract 4 nested ternary expressions to explicit helper functions with clear if/else logic.

### Step 3: JSX Complexity Extraction (§5)
**File**: `step-03-jsx-complexity.md`
**Violations**: 2
**Effort**: 45-60 minutes

Extract conditional rendering logic from JSX. One critical violation has 8 branches.

### Step 4: Callback Body Extraction (§6)
**File**: `step-04-callback-complexity.md`
**Violations**: 3
**Effort**: 30-45 minutes

Extract complex callback transformations. Two violations are duplicates that should share a helper.

### Step 5: Validation Chain Extraction (§10)
**File**: `step-05-validation-chains.md`
**Violations**: 4
**Effort**: 30-45 minutes

Extract long validation chains (4+ conditions) to named type guard functions.

---

## Files Affected

| File | Violations | Steps |
|------|------------|-------|
| `src/core/base/baseCommand.ts` | 4 | 1 |
| `src/features/project-creation/ui/components/ConfigurationSummary.tsx` | 3 | 2, 3 |
| `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` | 2 | 1, 5 |
| `src/features/project-creation/ui/wizard/WizardContainer.tsx` | 1 | 2 |
| `src/features/dashboard/ui/configure/ConfigureScreen.tsx` | 1 | 4 |
| `src/features/components/ui/hooks/useComponentConfig.ts` | 1 | 4 |
| `src/features/prerequisites/services/PrerequisitesManager.ts` | 1 | 4 |
| `src/features/authentication/ui/steps/AdobeAuthStep.tsx` | 1 | 3 |
| `src/features/authentication/services/authenticationService.ts` | 1 | 5 |
| `src/features/dashboard/ui/ProjectDashboardScreen.tsx` | 1 | 5 |
| `src/features/project-creation/ui/steps/ReviewStep.tsx` | 1 | 5 |
| `src/core/shell/commandSequencer.ts` | 1 | 2 |
| `src/utils/autoUpdater.ts` | 1 | 1 |
| `src/extension.ts` | 1 | 1 |
| `src/core/vscode/StatusBarManager.ts` | 1 | 1 |
| `src/core/vscode/envFileWatcherService.ts` | 1 | 1 |
| `src/core/commands/ResetAllCommand.ts` | 1 | 1 |

---

## Acceptance Criteria

1. All 23 violations resolved
2. All existing tests pass
3. No new SOP violations introduced
4. Code compiles without errors
5. `/rptc:helper-sop-scan` returns 0 violations for affected patterns

---

## TDD Approach

Each step follows RED-GREEN-REFACTOR:

1. **RED**: Add tests for new helper functions
2. **GREEN**: Implement helpers and update usage sites
3. **REFACTOR**: Verify no regressions, optimize if needed

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| UI timing changes affect UX | Use same numeric values, just centralized |
| Helper extraction changes behavior | Tests verify identical behavior |
| Shared helper affects multiple files | Test both usage sites |

---

## Notes

- Step 4 has two duplicate violations that should share a single helper
- Step 3 has one critical violation (8 branches) that needs careful extraction
- All timeout values are UI-related, low risk of business logic impact
