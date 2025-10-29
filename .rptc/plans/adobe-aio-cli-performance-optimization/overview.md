# Implementation Plan: Adobe AIO CLI Prerequisite Performance Optimization

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase) - Steps 1-4 Complete (100%)
- [x] Efficiency Review - PENDING
- [x] Security Review - PENDING
- [ ] Complete

**Created:** 2025-10-28
**Last Updated:** 2025-10-28
**Steps:** 4 total steps (4 complete, 0 remaining)

**Handoff Documents**:
- `handoff-step1-complete.md` - Context after Step 1 completion
- `handoff-steps-3-4.md` - **Current** - Ready to execute Steps 3-4

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: enabled

---

## Executive Summary

**Feature:** Optimize Adobe AIO CLI prerequisite checking and installation performance through npm flags, caching, parallel execution, and enhanced progress visibility.

**Purpose:** Reduce prerequisite checking time from 3-6 seconds per Node version to <1 second for cached checks, and installation time by 40-60% through optimized npm flags. Improve user experience with accurate progress feedback during multi-version installations.

**Approach:** Incremental optimization in 4 steps: (1) Add npm performance flags and timeout tuning, (2) Implement transparent prerequisite caching with TTL, (3) Parallelize per-Node-version AIO CLI checks, (4) Enhance progress visibility for concurrent operations. Keep existing sequential prerequisite checking architecture (correct by design). UI remains simple with no manual refresh buttons - caching is transparent.

**Estimated Complexity:** Medium

**Estimated Timeline:** 8-12 hours

**Key Risks:** npm cache corruption (mitigated by cache validation), parallel execution race conditions (mitigated by ExternalCommandManager), breaking changes to existing prerequisite system (mitigated by incremental approach with backward compatibility)

---

## Test Strategy

### Testing Approach

- **Framework:** Jest (existing extension test framework)
- **Coverage Goal:** 85% overall, 100% critical paths (caching logic, parallel execution, npm flag application)
- **Test Distribution:** Unit (70%), Integration (25%), E2E (5%)

### Test Scenarios Summary

**Happy Path:**
- First-time prerequisite check (cache miss) performs full check and caches result
- Subsequent checks (cache hit) return instantly from cache
- Parallel per-Node-version checks complete faster than sequential
- npm install with performance flags completes 40-60% faster
- Progress tracking updates correctly during concurrent installations

**Edge Cases:**
- Cache expiration (TTL) triggers re-check after timeout
- Cache invalidation when prerequisites.json changes
- Mixed cache hit/miss scenarios across multiple prerequisites
- Concurrent checks for same prerequisite deduplicated
- npm flag compatibility across different npm versions
- Parallel execution with varying completion times

**Error Conditions:**
- npm install failures with performance flags (fallback to standard flags)
- Cache file corruption (automatic invalidation and rebuild)
- Timeout during parallel prerequisite checks (individual timeout handling)
- Race conditions in cache read/write (lock-based protection)
- Process termination during cache write (atomic write operations)

**Detailed test scenarios are in each step file** (step-01.md, step-02.md, step-03.md, step-04.md)

### Coverage Goals

**Overall Target:** 85%

**Component Breakdown:**

- `PrerequisitesCacheManager`: 95% (critical caching logic, TTL, invalidation)
- `prerequisitesManager.ts` (npm flags): 90% (flag application, fallback logic)
- `prerequisitesManager.ts` (parallel checks): 90% (parallel execution, timeout handling)
- `ProgressUnifier`: 85% (concurrent progress tracking)
- Existing prerequisite system: Maintain current coverage (no regression)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All optimization features implemented (npm flags, caching, parallel checks, progress visibility)
- [ ] **Testing:** All tests passing (unit, integration, E2E)
- [ ] **Coverage:** Overall coverage ≥ 85%, critical paths 100%
- [ ] **Code Quality:** Passes linter, no debug code, follows style guide
- [ ] **Documentation:** Code comments, README updated with caching behavior and performance improvements
- [ ] **Security:** No security vulnerabilities (cache isolation, input validation)
- [ ] **Performance:** Meets performance requirements (see feature-specific criteria)
- [ ] **Error Handling:** All error conditions handled gracefully (npm failures, cache corruption, timeouts)

**Feature-Specific Criteria:**

- [ ] **npm Flags Performance**: Installation 40-60% faster with `--prefer-offline`, `--no-audit`, `--no-fund` flags
- [ ] **Cache Performance**: Cached prerequisite checks complete in <1 second (95% reduction from 3-6s baseline)
- [ ] **Parallel Performance**: Per-Node-version checks 50-66% faster than sequential (3 versions: 9-18s → 6s)
- [ ] **Cache Reliability**: Cache invalidation works correctly (TTL expiration, config changes, corruption detection)
- [ ] **Backward Compatibility**: Existing prerequisite system behavior unchanged (sequential prerequisite order, per-Node-version perNodeVersion logic)
- [ ] **Progress Accuracy**: Progress tracking reflects concurrent operations accurately (no stuck progress, clear messaging)
- [ ] **UI Simplicity**: No manual refresh buttons added (caching transparent to users)
- [ ] **Timeout Configuration**: 10s timeout for checks (down from 60s) enables faster failure detection

---

## Risk Assessment

### Risk 1: npm Cache Corruption

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** npm's local cache (used with `--prefer-offline`) can become corrupted, causing installation failures that are hard to diagnose. Cache invalidation logic must detect and recover from corrupted state.
- **Mitigation:**
  1. Implement cache validation checks before using cached results
  2. Add automatic cache invalidation on installation failures
  3. Provide fallback to non-cached installation (`--force` flag)
  4. Log cache operations for debugging
- **Contingency Plan:** If cache corruption is frequent, add manual cache clearing command and document troubleshooting steps

### Risk 2: Parallel Execution Race Conditions

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** Critical
- **Description:** Parallel per-Node-version checks could race on shared resources (cache files, ExternalCommandManager queue). Race conditions could cause incorrect status detection or cache corruption.
- **Mitigation:**
  1. Use ExternalCommandManager for command queuing and mutual exclusion
  2. Implement file locking for cache read/write operations
  3. Use atomic write operations (write to temp file, then rename)
  4. Add comprehensive unit tests for concurrent access scenarios
- **Contingency Plan:** If race conditions persist, fall back to sequential per-Node-version checks (still faster than current implementation due to caching)

### Risk 3: Breaking Changes to Existing Prerequisite System

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** High
- **Priority:** High
- **Description:** Optimizations could inadvertently change prerequisite checking behavior, breaking component installations or causing false positives/negatives in detection.
- **Mitigation:**
  1. Incremental approach with backward compatibility at each step
  2. Comprehensive integration tests covering existing prerequisite flows
  3. Feature flags to disable optimizations if issues arise
  4. Extensive testing with real component installations (CitiSignal Next.js, Commerce Mesh, App Builder apps)
- **Contingency Plan:** If regressions are detected, add configuration option to disable optimizations and revert to baseline behavior

### Risk 4: npm Flag Compatibility Issues

- **Category:** Dependency
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Performance flags (`--prefer-offline`, `--no-audit`) may not be compatible with older npm versions or could cause failures with specific packages.
- **Mitigation:**
  1. Check npm version before applying performance flags
  2. Implement fallback to standard flags on installation failure
  3. Log npm version and flags used for debugging
  4. Test with multiple npm versions (6.x, 7.x, 8.x, 9.x)
- **Contingency Plan:** If compatibility issues arise, make performance flags opt-in via configuration

### Risk 5: Cache TTL Tuning

- **Category:** Performance
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Cache TTL (time-to-live) too short negates performance benefits; too long causes stale data issues (missed prerequisite updates).
- **Mitigation:**
  1. Start with conservative 24-hour TTL based on research recommendations
  2. Add configuration option for TTL adjustment
  3. Invalidate cache on prerequisites.json changes (hash-based detection)
  4. Monitor cache hit/miss rates in logs
- **Contingency Plan:** If stale data issues arise, reduce TTL to 6-12 hours or add manual cache clear option

---

## Dependencies

### New Packages to Install

- [ ] **Package:** None (uses Node.js built-in `fs.promises` for atomic file operations)
  - **Purpose:** Atomic cache file writes to prevent corruption
  - **Risk:** Low (built-in module, no external dependency)

### Configuration Changes

- [ ] **Config:** `templates/prerequisites.json`
  - **Changes:** Add npm performance flags (`--no-audit --no-fund --prefer-offline`) to Adobe AIO CLI install command
  - **Environment:** All environments
  - **Reason:** Reduce installation time by 40-60% (research shows these flags are safe and effective)

- [ ] **Config:** New cache file `.demo-builder-cache/prerequisites-cache.json`
  - **Changes:** Create new cache directory in extension global storage
  - **Environment:** All environments
  - **Reason:** Store prerequisite check results with TTL timestamps

### External Service Integrations

- None (optimization is internal to prerequisite system)

---

## File Reference Map

### Existing Files (To Modify)

**Core Files:**
- `src/features/prerequisites/services/prerequisitesManager.ts` - Add npm flags, parallel execution, cache integration
- `src/features/prerequisites/handlers/checkHandler.ts` - Integrate cache for prerequisite checks
- `src/features/prerequisites/handlers/installHandler.ts` - Apply npm performance flags during installation
- `src/utils/progressUnifier.ts` - Enhance for concurrent progress tracking
- `templates/prerequisites.json` - Update Adobe AIO CLI timeout configuration

**Test Files:**
- Create `src/features/prerequisites/services/prerequisitesManager.test.ts` - Test npm flags and parallel execution
- Create `src/features/prerequisites/services/prerequisitesCacheManager.test.ts` - Test caching logic

### New Files (To Create)

**Implementation Files:**
- `src/features/prerequisites/services/prerequisitesCacheManager.ts` - Cache manager with TTL, invalidation, atomic writes
- `src/features/prerequisites/services/types.ts` - Add cache-related type definitions (CacheEntry, CacheConfig)

**Test Files:**
- `tests/unit/prerequisites/cacheManager.test.ts` - Unit tests for cache operations
- `tests/unit/prerequisites/npmFlags.test.ts` - Unit tests for npm flag application
- `tests/unit/prerequisites/parallelExecution.test.ts` - Unit tests for parallel per-Node-version checks
- `tests/integration/prerequisites/endToEnd.test.ts` - Integration tests for full prerequisite flow with optimizations

**Total Files:** 5 modified, 5 created

---

## Coordination Notes

**Step Dependencies:**

- Step 2 (Caching) depends on Step 1 (npm flags + timeouts): Caching relies on reliable installation success, which requires proper timeout configuration
- Step 3 (Parallel checks) depends on Step 2 (Caching): Parallel execution benefits from cache to avoid redundant checks during concurrent operations
- Step 4 (Progress visibility) depends on Step 3 (Parallel checks): Progress enhancements are most valuable when concurrent operations are happening

**Integration Points:**

- `PrerequisitesCacheManager` interfaces with `PrerequisitesManager` via `checkPrerequisite()` method (cache lookup before execution)
- `PrerequisitesManager` interfaces with `ExternalCommandManager` for parallel command execution (queuing and mutual exclusion)
- `ProgressUnifier` receives progress updates from multiple concurrent prerequisite checks (aggregation and display)
- Cache invalidation triggered by `ConfigurationLoader` when prerequisites.json file hash changes

**Backward Compatibility:**

- Sequential prerequisite checking order preserved (only per-Node-version checks parallelized)
- Existing prerequisite definitions in `templates/prerequisites.json` remain unchanged (except timeout config)
- Cache is transparent to UI (no new user-facing controls)
- Fallback to non-cached, non-parallelized execution if issues detected

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@adobe-aio-cli-performance-optimization"`
3. **Quality Gates:** Efficiency Agent → Security Agent (after all steps complete)
4. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@adobe-aio-cli-performance-optimization"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md, step-02.md, step-03.md, step-04.md_
