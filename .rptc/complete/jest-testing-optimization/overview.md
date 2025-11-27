# Jest Testing Optimization - Overview

**Created:** 2025-11-25
**Status:** Ready for Implementation
**Research:** `.rptc/research/jest-testing-strategy-alternatives-2025-11-25/research.md`

---

## Executive Summary

**Feature:** Optimize Jest test suite for performance and stability

**Purpose:** Address memory crashes, slow execution (ts-jest overhead), and event listener leaks that impact developer productivity and CI reliability.

**Approach:** Replace ts-jest with SWC for 30-75% faster transforms, add memory management configuration, and implement systematic cleanup patterns.

**Estimated Complexity:** Medium

**Estimated Timeline:** 6-10 hours total across 5 steps

**Key Risks:**
1. SWC compatibility with existing test patterns (Low risk - well-tested at Microsoft scale)
2. Type errors not caught during test runs (Mitigated by Step 3 pre-test type checking)
3. Test failures after file splitting (Low risk - incremental approach with validation)

---

## Current State Analysis

| Metric | Current Value | Issue |
|--------|---------------|-------|
| Test Files | 345 files | - |
| Total Tests | ~2,300 | - |
| Transformer | ts-jest 29.4.5 | 30-75% slower than SWC |
| workerIdleMemoryLimit | Not configured | Memory accumulation/crashes |
| Large Files (>600 lines) | 7 files | Memory pressure |
| Event Listener Patterns | ~758 patterns | Only ~21 cleanup calls |
| afterEach Hooks | 51 total | Insufficient cleanup coverage |

### Files Over 600 Lines (Step 4 Targets)

1. `debugLogger.test.ts` (771 lines)
2. `checkHandler-refactored.test.ts` (689 lines)
3. `transientStateManager.test.ts` (646 lines)
4. `useSelectionStep.test.tsx` (619 lines)
5. `createHandler-refactored.test.ts` (617 lines)
6. `envFileWatcherService.mocked.test.ts` (609 lines)
7. `ProjectDashboardScreen.test.tsx` (520 lines) - At threshold, monitor only

---

## Implementation Constraints

- **File Size:** <300 lines target, accept up to 400 for complex test suites
- **Complexity:** Functions <50 lines, cyclomatic complexity <10
- **Dependencies:**
  - REQUIRED: @swc/core ^1.3.0, @swc/jest ^0.2.0
  - PROHIBITED: Vitest migration (CI performance regression risk)
- **Platforms:** Node.js 18+, macOS/Linux (Windows untested)
- **Performance:**
  - Target: 30%+ faster test execution
  - Memory: Prevent heap out-of-memory crashes
  - Individual test timeout: 10s (unchanged)

---

## Test Strategy

### Testing Approach

- **Framework:** Jest 30.2.0 (keep existing)
- **Coverage Goal:** Maintain 80%+ overall
- **Validation Method:** Full test suite must pass after each step

### Verification Patterns

For each step, verify:
1. All 2,300+ tests pass
2. No new memory warnings or crashes
3. Coverage remains at 80%+ threshold
4. No regressions in test behavior

### Test Commands

```bash
# Individual file testing (safe for Cursor)
npx jest "tests/path/to/file.test.ts"

# Pattern matching
npx jest --testPathPattern="core/logging"

# Coverage verification
npx jest --coverage --collectCoverageFrom="src/**/*.ts"
```

**WARNING:** Do NOT run `npm run test:fast` - causes Cursor crashes.

---

## Step Dependencies

```
Step 1 (SWC) ────┐
                 ├──> Step 3 (Type Check) ──> Step 4 (File Splitting)
Step 2 (Memory)──┘                                    │
                                                      v
                                              Step 5 (Event Cleanup)
```

**Notes:**
- Steps 1 and 2 are independent and can be implemented in any order
- Step 3 depends on Step 1 (SWC removes built-in type checking)
- Steps 4 and 5 can run in parallel after core infrastructure is stable

---

## Risk Assessment

### Risk 1: SWC Incompatibility with Specific Test Patterns

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Some TypeScript edge cases may transform differently in SWC vs tsc
- **Mitigation:**
  1. Test SWC on subset of tests first
  2. Keep ts-jest in devDependencies as fallback
  3. Document any required SWC configuration adjustments
- **Contingency:** Revert to ts-jest if >5% of tests fail

### Risk 2: Type Errors Hidden During Development

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low
- **Priority:** Low
- **Description:** SWC strips types without checking them
- **Mitigation:**
  1. Add `test:typecheck` script (Step 3)
  2. CI pipeline runs typecheck before tests
  3. Developers can run typecheck locally
- **Contingency:** Already mitigated by Step 3

### Risk 3: File Splitting Breaks Test Isolation

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Shared state or mocks may not transfer correctly to split files
- **Mitigation:**
  1. Follow existing playbook pattern
  2. Create .testUtils.ts files for shared mocks
  3. Validate each split file independently
- **Contingency:** Keep original file as reference during splits

### Risk 4: Event Listener Cleanup Breaks Existing Tests

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low
- **Priority:** Low
- **Description:** Adding dispose() calls may interfere with test expectations
- **Mitigation:**
  1. Add cleanup incrementally
  2. Test each file after modification
  3. Review mock assertions before adding cleanup
- **Contingency:** Revert individual file changes if tests fail

---

## Acceptance Criteria

### Definition of Done

- [ ] All 2,300+ tests pass with new configuration
- [ ] No memory-related crashes during full test runs
- [ ] Test execution time reduced by 30%+ (benchmark before/after)
- [ ] No test files >400 lines (7 largest files split)
- [ ] 80%+ event listener patterns have cleanup in afterEach
- [ ] Type checking available via separate script
- [ ] Documentation updated with new test commands

### Step-Specific Criteria

- **Step 1:** SWC transformation working for all 345 test files
- **Step 2:** workerIdleMemoryLimit configured, no heap crashes
- **Step 3:** `npm run test:typecheck` script functional
- **Step 4:** 6 files split to <400 lines each
- **Step 5:** afterEach hooks added to high-impact test files

---

## File Reference Map

### Configuration Files (Modify)

- `jest.config.js` - Transform configuration, memory settings
- `package.json` - New test scripts, devDependencies

### New Files (Create)

- `.swcrc` - SWC configuration for test transforms
- Test utility files for split test suites (Step 4)

### Test Files (Modify in Step 4)

1. `tests/core/logging/debugLogger.test.ts`
2. `tests/features/mesh/handlers/checkHandler-refactored.test.ts`
3. `tests/core/state/transientStateManager.test.ts`
4. `tests/features/authentication/ui/hooks/useSelectionStep.test.tsx`
5. `tests/features/mesh/handlers/createHandler-refactored.test.ts`
6. `tests/core/vscode/envFileWatcherService.mocked.test.ts`

---

## References

### Research Document
`.rptc/research/jest-testing-strategy-alternatives-2025-11-25/research.md`

### Existing Documentation
- `docs/testing/test-file-splitting-playbook.md` - File splitting patterns
- `tests/__mocks__/vscode.ts` - VS Code API mock reference

### External Resources
- [SWC Jest Documentation](https://swc.rs/docs/usage/jest)
- [Microsoft accessibility-insights-web PR #4336](https://github.com/microsoft/accessibility-insights-web/pull/4336) - Reference implementation
- [Jest Memory Optimization](https://infinitejs.com/posts/optimizing-jest-memory-usage/)

---

## Next Actions

1. Begin with **Step 1: SWC Integration** - highest impact, lowest risk
2. Immediately follow with **Step 2: Memory Management** - crash prevention
3. Complete infrastructure steps before file splitting

**First Command:** Execute Step 1 using `/rptc:tdd "@jest-testing-optimization/step-01.md"`

---

_Plan created by Master Feature Planner_
_Status: Ready for TDD Implementation_
