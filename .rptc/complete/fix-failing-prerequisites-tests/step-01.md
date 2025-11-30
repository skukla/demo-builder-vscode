# Step 1: Fix Failing Prerequisites Integration Tests

## Purpose

Diagnose and fix the two failing integration tests that are blocking the commit:
- `tests/integration/prerequisites/endToEnd.test.ts`
- `tests/integration/prerequisites/installationPerformance.test.ts`

## Tests to Verify

The failing integration tests themselves:

```bash
npm test -- tests/integration/prerequisites/endToEnd.test.ts
npm test -- tests/integration/prerequisites/installationPerformance.test.ts
```

Plus full test suite verification after fixes:

```bash
npm test
```

## Implementation Guidance

### Phase 1: Diagnose

1. Run each failing test in isolation with full output
2. Identify exact error messages and stack traces
3. Determine root cause (setup issue, assertion failure, timeout, etc.)
4. Check if related to recent ProgressUnifier changes or pre-existing

### Phase 2: Fix

1. Implement targeted fixes based on diagnosis
2. Options may include:
   - Test setup/teardown corrections
   - Mock adjustments
   - Timeout increases (if legitimate)
   - Assertion updates (if test expectations wrong)
   - Code fixes (if actual bugs found)

### Phase 3: Verify

1. Verify each test passes in isolation
2. Run full prerequisites test suite
3. Run full project test suite
4. Confirm no regressions introduced

## Expected Changes

**Test Files** (likely):
- `tests/integration/prerequisites/endToEnd.test.ts`
- `tests/integration/prerequisites/installationPerformance.test.ts`

**Source Files** (possibly):
- Files in `src/features/prerequisites/` if actual bugs found
- Configuration files if setup issues

## Success Criteria

- ✅ Both integration tests pass
- ✅ Full test suite passes
- ✅ No regressions in other tests
- ✅ Coverage maintained or improved
