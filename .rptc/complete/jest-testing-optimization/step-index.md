# Jest Testing Optimization Plan

**Created:** 2025-11-25
**Status:** Ready for Implementation
**Research:** `.rptc/research/jest-testing-strategy-alternatives-2025-11-25/research.md`
**Detailed Plans:** See individual step files in this directory

---

## Executive Summary

Comprehensive testing optimization to address memory crashes, slow execution, and reliability issues. Based on research findings, implementing Jest + SWC transformation with memory management optimizations.

**Expected Improvements:**
- 30-75% faster test execution (SWC vs ts-jest)
- Eliminated memory crashes (workerIdleMemoryLimit + file splitting)
- Type safety maintained (pre-test tsc --noEmit)
- Reduced memory footprint (event listener cleanup)

---

## Current State (Verified 2025-11-25)

| Metric | Value | Issue |
|--------|-------|-------|
| Test Files | 345 files | - |
| Tests | ~3,844 | - |
| Large Files (>500 lines) | **7 files** | Minor issue |
| Largest Files (>600 lines) | 6 files | Consider splitting |
| Event Listeners | 95 patterns | 77 cleanup calls (81% coverage) |
| Transformer | ts-jest | 30-75% slower than SWC |
| workerIdleMemoryLimit | Not set | **Primary crash cause** |

> **Note:** Original research had errors (claimed 41 files >500 lines, 758 event listeners). Verified counts above.

---

## Implementation Steps

### Step 1: SWC Integration
**File:** `step-01.md`
**Status:** Complete (validate externally)
**Effort:** Low (1-2 hours)
**Impact:** High (30-75% faster)

Replace ts-jest with @swc/jest for Rust-based TypeScript transformation.

**Changes:**
- Install @swc/core and @swc/jest
- Update jest.config.js transform configuration
- Create .swcrc configuration file
- Verify all tests pass with new transformer

---

### Step 2: Memory Management Configuration
**File:** `step-02.md`
**Status:** Complete
**Effort:** Low (30 minutes)
**Impact:** High (prevents crashes)

Add Jest memory management settings to prevent memory accumulation.

**Changes:**
- Add workerIdleMemoryLimit: '512MB' to jest.config.js
- Optionally add isolatedModules: true for React project (if keeping ts-jest as fallback)

---

### Step 3: Pre-Test Type Checking
**File:** `step-03.md`
**Status:** Complete
**Effort:** Low (30 minutes)
**Impact:** Medium (type safety)

Add tsc --noEmit as pre-test check since SWC skips type checking.

**Changes:**
- Add "test:typecheck" script to package.json
- Update "test" script to run typecheck before tests
- Consider adding to CI pipeline

---

### Step 4: Large Test File Splitting
**File:** `step-04.md`
**Status:** Pending
**Effort:** Medium (4-6 hours)
**Impact:** Low (only 7 files affected)

Split 6 largest test files (>600 lines) following existing playbook.

**Target Files:**
1. `debugLogger.test.ts` (771 lines)
2. `checkHandler-refactored.test.ts` (689 lines)
3. `transientStateManager.test.ts` (646 lines)
4. `useSelectionStep.test.tsx` (619 lines)
5. `createHandler-refactored.test.ts` (617 lines)
6. `envFileWatcherService.mocked.test.ts` (609 lines)

**Changes:**
- Split by logical test groups (describe blocks)
- Target <300 lines per file
- Follow docs/testing/test-file-splitting-playbook.md

---

### Step 5: Event Listener Cleanup Audit
**File:** `step-05.md`
**Status:** Pending
**Effort:** Low (1 hour)
**Impact:** Low (81% already covered)

Review remaining 18 event listener patterns missing cleanup.

**Current State (Verified):**
- 95 event listener patterns found
- 77 cleanup patterns (81% coverage)

**Changes:**
- Identify files with event listeners missing cleanup
- Add afterEach hooks with dispose() calls
- Consider creating test utility for automatic cleanup
- Update testing guidelines to require cleanup

---

### Step 6: Verification & Metrics
**File:** `step-06.md`
**Status:** Pending
**Effort:** Low (30 minutes)
**Impact:** High (validates all changes)

Research agent re-verifies all metrics after implementation.

**Verification Checklist:**
- [ ] All ~3,844 tests pass
- [ ] Measure test execution time (before/after comparison)
- [ ] Verify no files >400 lines remain
- [ ] Confirm event listener cleanup at 100%
- [ ] Run full test suite without memory crashes
- [ ] Document performance improvement percentage

---

## Dependencies

```
Step 1 (SWC) ──┐
               ├──> Step 3 (Type Check) ──> Step 4 (File Splitting) ──┐
Step 2 (Memory)┘                                    │                 │
                                                    v                 │
                                           Step 5 (Event Cleanup) ────┴──> Step 6 (Verify)
```

**Notes:**
- Steps 1 and 2 can run in parallel (no dependencies)
- Step 3 depends on Step 1 (SWC removes type checking)
- Steps 4 and 5 can run in parallel after Step 3
- Step 6 runs after all implementation steps complete

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SWC compatibility issues | Low | Medium | Maintain ts-jest as fallback |
| Test failures after migration | Medium | Low | Run full suite after each step |
| File splitting breaks test isolation | Low | Low | Careful describe block grouping |
| Event listener cleanup breaks tests | Medium | Low | Add cleanup incrementally |

---

## Success Criteria

- [ ] All ~3,844 tests pass with new configuration
- [ ] No memory-related crashes during full test runs
- [ ] Test execution time reduced by 30%+
- [ ] No files >400 lines in tests/ directory
- [ ] 100% event listener patterns have cleanup
- [ ] Verification report documents before/after metrics

---

## Decisions

1. **Priority Order:** Crash prevention first (Steps 1-2), then optimization (Steps 3-5)
2. **File Splitting Threshold:** Target 300 lines, accept up to 400 for complex test suites
3. **Type Check Integration:** Separate "test:typecheck" script for flexibility
4. **Event Listener Enforcement:** Document pattern and fix existing issues, consider ESLint later

---

## Approval

- [x] PM Approval for Plan Structure
- [x] PM Approval for Step Priorities
- [x] Ready for Master Feature Planner delegation
- [x] Detailed step plans created

---

## Plan Files

| File | Description |
|------|-------------|
| `overview.md` | Executive summary, constraints, risks |
| `step-01.md` | SWC Integration |
| `step-02.md` | Memory Management Configuration |
| `step-03.md` | Pre-Test Type Checking |
| `step-04.md` | Large Test File Splitting |
| `step-05.md` | Event Listener Cleanup Audit |
| `step-06.md` | Verification & Metrics |

---

## Next Steps

To begin implementation:

```bash
# Start with Step 1 (highest impact)
/rptc:tdd "@jest-testing-optimization/step-01.md"
```

**Implementation Order:**
1. Step 1 + Step 2 (can be parallel - infrastructure)
2. Step 3 (depends on Step 1)
3. Step 4 + Step 5 (can be parallel - cleanup)
4. Step 6 (verification - research agent validates all changes)
