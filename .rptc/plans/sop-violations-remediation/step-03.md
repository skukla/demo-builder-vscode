# Step 3: DI Consistency

**Status:** ✅ Complete (Already Done)
**Priority:** HIGH
**Effort:** ~2 hours (N/A - no work needed)
**Risk:** Low-Medium
**Completed:** 2025-12-31

---

## Purpose

Standardize logger instantiation across the codebase:
- Services use `getLogger()`
- Handlers use `context.logger`

---

## Current State

Files using direct instantiation (`new Logger()`):
- `src/features/authentication/services/*` (19 files)
- `src/features/eds/services/*` (10 files)
- `src/features/mesh/services/*` (1 file)

---

## Strategy: Pragmatic Consistency

**Use `getLogger()` as the standard pattern for services.**

This is simpler than full context injection and acceptable for consistency.

---

## Implementation Pattern

### Services (use getLogger)
```typescript
// BEFORE
import { Logger } from '@/core/logging';
const logger = new Logger('myService');

// AFTER
import { getLogger } from '@/core/logging';
const logger = getLogger();
```

### Handlers (use context.logger - unchanged)
```typescript
// Handlers still use context.logger (correct pattern)
export const handleAction = async (context: HandlerContext) => {
    context.logger.info('Handling action');
};
```

---

## Files to Update

### Authentication Services (~19 files)
- Replace `new Logger('name')` with `getLogger()`
- Logger name inferred from file/function context

### EDS Services (~10 files)
- Replace `new Logger('name')` with `getLogger()`

### Mesh Services (~1 file)
- Replace `new Logger('name')` with `getLogger()`

---

## Tests to Write First

### Test Scenarios
1. **Logger pattern verification**: Scan for `new Logger(` patterns
2. **Service functionality preserved**: All existing service tests pass
3. **Handler pattern unchanged**: Handlers still use context.logger

### Test Approach
- Grep-based verification of patterns
- Run existing test suite

---

## Expected Outcome

- No `new Logger()` in services
- All services use `getLogger()`
- Handlers continue using `context.logger`
- Consistent logging pattern across codebase

---

## Acceptance Criteria

- [x] No `new Logger()` calls in service files (verified: 0 occurrences in .ts files)
- [x] Services use `getLogger()` consistently (verified: 30 files)
- [x] Handlers use `context.logger` consistently (verified: 21 files, 302 occurrences)
- [x] All existing tests pass (22 DI tests passing)

---

## Implementation Notes

### Verification Performed

**Pattern Analysis:**
```
new Logger(       → 0 occurrences in .ts files (only in docs)
getLogger()       → 30 service files use correctly
context.logger    → 302 occurrences across 21 handler files
```

**Decision: No Work Needed**

The codebase was already in the correct state. The plan's "Current State" section was outdated - the standardization work had already been completed in prior refactoring efforts.

**Existing DI Tests:**
- `tests/core/di/diPatterns.test.ts`
- `tests/core/di/service-logger-injection.test.ts`
- 22 tests passing
