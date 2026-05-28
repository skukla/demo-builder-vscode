# Implementation Plan: Over-Engineering Remediation

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review (post-TDD quality gate)
- [x] Security Review (post-TDD quality gate)
- [x] Complete (2025-12-31)

**Created:** 2025-12-30

---

## Executive Summary

**Feature:** Systematic removal of 7 categories of over-engineering identified during mesh endpoint refactoring

**Purpose:** Reduce maintenance burden, improve debuggability, and prevent future state inconsistency bugs by eliminating unnecessary abstraction layers and complexity

**Approach:** Incremental refactoring ordered by risk/impact - address critical state issues first, then high-impact service consolidation, followed by medium/low complexity reductions

**Estimated Complexity:** Large (8 steps, ~5,500 LOC reduction expected)

**Key Risks:**
1. State migration regression (Step 1 - CRITICAL)
2. Authentication service consolidation breaking existing flows (Step 2 - HIGH)
3. Test coverage gaps during refactoring

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest
- **Coverage Goal:** 85% for modified files, 100% for state management
- **Test Distribution:** Unit (80%), Integration (20%)

### Test Scenarios Summary

- **Happy Path:** All existing functionality continues working after each refactoring step
- **Edge Cases:** Concurrent state writes, cache invalidation, partial failures during auth flows
- **Error Conditions:** State migration failures, backward compatibility with old project formats

Note: Detailed test scenarios are in each step file (step-01.md through step-08.md)

---

## Acceptance Criteria

- [ ] All 267 existing tests continue passing after each step
- [ ] No new runtime errors in development or production builds
- [ ] Authentication flows (login, org/project/workspace selection) work identically
- [ ] State persistence/reload works for all project types
- [ ] Total LOC reduction of 3,500+ lines (target: 4,500)
- [ ] No interfaces with single implementations remain
- [ ] No unused generic classes remain (HandlerRegistry<T>)
- [ ] Coverage maintained at 85%+ for modified code

---

## Risk Assessment

### Risk 1: State Migration Regression
- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Critical
- **Mitigation:** Write migration tests FIRST; maintain backward compatibility with old format; add format version detection

### Risk 2: Authentication Flow Breakage
- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Mitigation:** Preserve all public API signatures initially; consolidate internal implementation only; comprehensive integration tests

### Risk 3: Test Coverage Gaps
- **Category:** Process
- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:** TDD approach ensures tests written before refactoring; coverage gate blocks merge if <85%

---

## File Reference Map

### Existing Files to Modify

**Step 1 (State):**
- `src/types/base.ts` - Remove duplicate fields
- `src/core/state/stateManager.ts` - Single source of truth

**Step 2 (Auth - 80% reduction):**
- `src/features/authentication/services/` - 19 files to consolidate to 5

**Step 3 (Handlers):**
- `src/core/base/BaseHandlerRegistry.ts` - Remove
- 7 feature handler registries - Convert to object literals

**Steps 4-7 (Medium/Low):**
- `src/core/utils/timeoutConfig.ts` - Simplify 50+ to ~7 constants
- `src/core/utils/progressUnifier/strategies/` - Config-driven
- `src/core/cache/AbstractCacheManager.ts` - Inline
- Various deprecated aliases - Remove

**Step 8 (Final Cleanup):**
- All deprecated handler registry files - Delete
- All deprecated strategy files - Delete
- All deprecated timeout aliases - Remove
- All @deprecated code - Delete (~1,000+ additional LOC)

### Files to Delete

- `src/core/handlers/HandlerRegistry.ts` (unused generic)
- `src/core/base/BaseHandlerRegistry.ts` (after step 3)
- Strategy classes (after step 5)
- `src/core/cache/AbstractCacheManager.ts` (after step 6)

---

## Implementation Constraints

- File size: All implementation files must be <500 lines
- Simplicity: No abstractions until pattern appears 3+ times (Rule of Three per architecture-patterns.md SOP)
- Testing: Minimum 85% coverage for modified code
- Backward compatibility: All existing tests must pass, no breaking API changes

---

## Configuration

**Efficiency Review:** enabled
**Security Review:** enabled (for auth service changes in Step 2)

---

## Coordination Notes

**Step Dependencies:**
- Steps 1-7 are independent and can be done in any order
- Step 8 MUST be done LAST (requires all previous steps complete)
- Recommended order: 1 (critical) -> 2 (high impact) -> 3-7 (can parallelize) -> 8 (final cleanup)

**Integration Points:**
- Step 1 affects all features that read/write project state
- Step 2 affects all Adobe I/O console operations
- Steps 3-7 are isolated refactorings

**Testing Strategy:**
- Run full test suite after each step before proceeding
- Each step is a separate PR for easier rollback

---

## Research Reference

**Document:** `.rptc/research/over-engineering-analysis.md`
**Methodology:** Static analysis + pattern detection triggered by mesh endpoint dual-storage bug

---

## Next Actions

Run `/rptc:tdd "@over-engineering-remediation/"` to begin TDD implementation

---

_Plan created by Master Feature Planner_
