# Step 6: Fix DI Inconsistencies

## Summary

Standardize 10 dependency injection patterns across services. Currently Logger injection mixes `getLogger()` inline init with constructor injection, creating testing friction and inconsistent patterns.

## Prerequisites

- [ ] Steps 4-5 complete (extraction refactors)

## Current Patterns (Inconsistent)

| Pattern | Example | Count |
|---------|---------|-------|
| `getLogger()` inline | `private logger = getLogger()` | ~15 files |
| Constructor injection | `constructor(logger: Logger)` | ~8 files |
| Inline instantiation | `private cache = new CacheManager()` | ~3 files |

## Target Pattern

**Constructor injection for testable dependencies:**
- Logger, external services, managers requiring mocks
- Matches PrerequisitesManager, MeshDeployer pattern

**Inline for pure utilities:**
- Constants, config objects, simple helpers

## Tests to Write First (RED Phase)

- [ ] Test: Services accept injected Logger in constructor
- [ ] Test: Services work with mock Logger (no getLogger calls)
- [ ] Test: CacheManager injectable for isolation

## Files to Modify

Priority services with inline `getLogger()`:

1. `src/features/eds/services/daLiveService.ts`
2. `src/features/eds/services/githubService.ts`
3. `src/features/eds/services/toolManager.ts`
4. `src/features/eds/services/edsProjectService.ts`
5. `src/features/eds/services/helixService.ts`
6. `src/features/eds/services/cleanupService.ts`
7. `src/features/authentication/services/tokenManager.ts`
8. `src/features/authentication/services/authCacheManager.ts`
9. `src/features/prerequisites/services/prerequisitesCacheManager.ts`
10. `src/features/mesh/services/stalenessDetector.ts`

## Implementation Details (GREEN Phase)

1. Add Logger parameter to constructor
2. Remove inline `getLogger()` call
3. Update all instantiation call sites
4. Run existing tests to verify no regressions

## Expected Outcome

- [x] Consistent constructor injection for Logger
- [x] All services testable with mock Logger
- [x] Clear dependency graph (no hidden singletons)

## Acceptance Criteria

- [x] 10 files standardized to constructor injection
- [x] All existing tests pass
- [x] No behavior changes
- [x] Improved test isolation capability

---

## Completion Notes

**Status:** ✅ Complete
**Date:** 2025-12-29
**Tests Added:** 9 (service-logger-injection.test.ts)
**Full Suite:** 6007 tests passing

**Services Standardized (9):**
- daLiveService.ts - Added optional Logger as 2nd param
- githubService.ts - Added optional Logger as 2nd param
- toolManager.ts - Added optional Logger as 1st param
- edsProjectService.ts - Added optional Logger as 5th param
- helixService.ts - Added optional Logger as 2nd param
- cleanupService.ts - Added optional Logger as 5th param
- tokenManager.ts - Added optional Logger as 3rd param
- authCacheManager.ts - Added optional Logger as 1st param
- prerequisitesCacheManager.ts - Added optional Logger as 1st param

**Already Compliant (1):**
- stalenessDetector.ts - Already uses constructor injection

**Pattern Applied:**
```typescript
constructor(existingDeps, logger?: Logger) {
    this.logger = logger ?? getLogger();
}
```
