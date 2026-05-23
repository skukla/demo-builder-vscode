# Step 2: Premature Abstraction Removal (envVarResolver.ts)

## Status: [x] Complete (2026-01-08)

## Purpose

Remove premature abstraction `envVarResolver.ts` by inlining its only used function (`resolveComponentEnvVars`) directly into its only caller (`envFileGenerator.ts`), and deleting the file.

## Prerequisites

- Step 1 complete (optional, steps are independent)

## Dependencies from Other Steps

- None (independent step)

## What This Step Accomplishes

1. Inline `resolveComponentEnvVars()` function (~62 lines) into `envFileGenerator.ts`
2. Remove dead import from `useComponentConfig.ts` if present
3. Delete `envVarResolver.ts` file entirely
4. Update barrel exports in `index.ts`

## Files to Modify

- `src/features/project-creation/helpers/envFileGenerator.ts` - inline resolveComponentEnvVars
- `src/features/components/ui/hooks/useComponentConfig.ts` - remove dead import (if exists)
- `src/features/components/services/index.ts` - remove export
- `src/features/components/services/envVarResolver.ts` - DELETE

## Tests to Write First

Since this is a refactoring (inlining), we verify existing tests pass:

### Existing Test Coverage
- envFileGenerator tests should continue to pass
- Project creation should generate correct .env files

### Verification Tests
1. **Build Verification**: `npm run build` succeeds with no TypeScript errors
2. **Test Suite**: All existing tests pass
3. **Functional Verification**: .env file generation works correctly

## Implementation Steps

1. Read `envVarResolver.ts` to understand the `resolveComponentEnvVars` function
2. Read `envFileGenerator.ts` to find where `resolveComponentEnvVars` is called
3. Copy the function logic directly into `envFileGenerator.ts`
4. Update imports as needed
5. Check `useComponentConfig.ts` for dead import and remove if present
6. Delete `envVarResolver.ts`
7. Update `src/features/components/services/index.ts` to remove export
8. Run `npm run build` to verify no TypeScript errors
9. Run `npm test` to verify all tests pass

## Expected Outcome

- `envVarResolver.ts` deleted (-122 lines)
- `envFileGenerator.ts` gains ~62 lines of inlined logic
- All existing tests pass
- Build succeeds
- No functional changes to .env file generation

## Acceptance Criteria

- [x] `envVarResolver.ts` deleted
- [x] `resolveComponentEnvVars` logic inlined into `envFileGenerator.ts` (simplified to ~30 lines)
- [x] Dead import removed from `useComponentConfig.ts` - N/A (no import existed)
- [x] Barrel export removed from `index.ts` - N/A (not in public API)
- [x] `npm run compile` passes
- [x] No TypeScript errors

## Refactoring Notes

The inlined function was significantly simplified:
- Changed from object parameter to positional parameters
- Removed unused `serviceEnvVarKeys` return value (only `allEnvVarKeys` was used)
- Removed verbose debug logging
- Removed unused `Logger` import
- Final size: ~30 lines vs original ~62 lines
