# Step 1: Dead Code Removal (serviceResolver.ts)

## Status: [x] Complete (2026-01-08)

## Purpose

Remove dead code from `serviceResolver.ts` by inlining the one used function (`resolveServices`) directly into its only caller (`useComponentSelection.ts`), and deleting the file entirely including 2 never-used functions.

## Prerequisites

- None (first step)

## Dependencies from Other Steps

- None

## What This Step Accomplishes

1. Inline `resolveServices()` function (~70 lines) into `useComponentSelection.ts`
2. Delete `isServiceProvided()` function (never used anywhere)
3. Delete `getServiceProviders()` function (never used anywhere)
4. Delete `serviceResolver.ts` file entirely
5. Update barrel exports in `index.ts`

## Files to Modify

- `src/features/components/ui/hooks/useComponentSelection.ts` - inline resolveServices
- `src/features/components/services/index.ts` - remove export
- `src/features/components/services/serviceResolver.ts` - DELETE

## Tests to Write First

Since this is a refactoring (inlining), we verify existing tests pass:

### Existing Test Coverage
- Component selection hook tests should continue to pass
- Service resolution logic should work identically

### Verification Tests
1. **Build Verification**: `npm run build` succeeds with no TypeScript errors
2. **Test Suite**: All existing tests in `tests/` pass
3. **Functional Verification**: Component selection resolves services correctly

## Implementation Steps

1. Read `serviceResolver.ts` to understand the `resolveServices` function
2. Read `useComponentSelection.ts` to find where `resolveServices` is called
3. Copy the `resolveServices` function logic directly into the hook
4. Update imports as needed (remove serviceResolver import)
5. Delete `serviceResolver.ts`
6. Update `src/features/components/services/index.ts` to remove export
7. Run `npm run build` to verify no TypeScript errors
8. Run `npm test` to verify all tests pass

## Expected Outcome

- `serviceResolver.ts` deleted (-155 lines)
- `useComponentSelection.ts` gains ~70 lines of inlined logic
- All existing tests pass
- Build succeeds
- No functional changes to component selection behavior

## Acceptance Criteria

- [ ] `serviceResolver.ts` deleted
- [ ] `resolveServices` logic inlined into `useComponentSelection.ts`
- [ ] Barrel export removed from `index.ts`
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] No TypeScript errors
