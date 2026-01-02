# Step 2: Dead Code Removal

## Purpose

Remove dead code that has accumulated in the codebase, including:

1. **Unused `HandlerRegistry<T>` generic class** - Created during a consolidation effort but never adopted by any production code
2. **Deprecated `HandlerRegistry` alias** - A backward-compatibility alias that was never needed (all consumers use `ProjectCreationHandlerRegistry` directly)
3. **Associated test files** - Tests for code that doesn't run in production

**Why This Matters:**
- Dead code increases cognitive load when navigating the codebase
- Unused exports bloat barrel files and confuse new developers
- Deprecated aliases suggest migration paths that don't exist
- Removing dead code reduces maintenance burden and clarifies actual architecture

**Impact:** ~200 lines of code removed (67 lines source + 67 lines tests + barrel export cleanup)

---

## Prerequisites

- [ ] None - this step is independent and can be done in any order

---

## Tests to Write First

### Test 1: Verify no production imports of HandlerRegistry<T>

Before deleting, confirm no production code imports from `@/core/handlers/HandlerRegistry`:

- [ ] **Test:** Search confirms no production imports of generic HandlerRegistry
  - **Given:** Current codebase with `src/core/handlers/HandlerRegistry.ts`
  - **When:** Search for imports of `@/core/handlers/HandlerRegistry` in `src/`
  - **Then:** Only `src/core/handlers/index.ts` (the barrel) should reference it
  - **Verification Method:** Manual grep search (not a Jest test)

```bash
# This should return ONLY the barrel file, not any feature code
grep -r "from '@/core/handlers/HandlerRegistry'" src/
grep -r "from '@/core/handlers'" src/ | grep -v "executeCommandForProject"
```

### Test 2: Verify no production imports of deprecated alias

- [ ] **Test:** Search confirms deprecated `HandlerRegistry` alias is unused
  - **Given:** Current codebase with `export { ProjectCreationHandlerRegistry as HandlerRegistry }`
  - **When:** Search for imports of just `HandlerRegistry` (not `ProjectCreationHandlerRegistry`)
  - **Then:** No production code imports the deprecated alias
  - **Verification Method:** Manual grep search

```bash
# This should return no results in production code
grep -r "import.*{ HandlerRegistry }" src/
grep -r "import.*HandlerRegistry.*from.*project-creation" src/
```

### Test 3: Update barrel export test to remove deprecated expectation

- [ ] **Test:** Barrel export test expects `ProjectCreationHandlerRegistry` (not deprecated alias)
  - **Given:** `tests/features/barrel-exports.test.ts` has test for `HandlerRegistry` export
  - **When:** Remove deprecated alias from barrel
  - **Then:** Update test to verify `ProjectCreationHandlerRegistry` is exported (the canonical name)
  - **File:** `tests/features/barrel-exports.test.ts`

**Current test (lines 24-29):**
```typescript
it('should export HandlerRegistry', async () => {
    const exports = await import('@/features/project-creation');

    expect(exports.HandlerRegistry).toBeDefined();
    expect(typeof exports.HandlerRegistry).toBe('function');
});
```

**Updated test:**
```typescript
it('should export ProjectCreationHandlerRegistry (canonical name)', async () => {
    const exports = await import('@/features/project-creation');

    expect(exports.ProjectCreationHandlerRegistry).toBeDefined();
    expect(typeof exports.ProjectCreationHandlerRegistry).toBe('function');

    // Deprecated alias should NOT be exported
    expect((exports as Record<string, unknown>).HandlerRegistry).toBeUndefined();
});
```

### Test 4: Verify compilation after removal

- [ ] **Test:** TypeScript compilation succeeds after dead code removal
  - **Given:** All dead code files deleted and exports cleaned up
  - **When:** Run `npm run build`
  - **Then:** No compilation errors
  - **Verification Method:** Build command succeeds

### Test 5: Verify all existing tests pass

- [ ] **Test:** Full test suite passes after dead code removal
  - **Given:** Dead code removed, barrel export test updated
  - **When:** Run `npm test`
  - **Then:** All 267+ tests pass (minus the 6 deleted tests for removed code)
  - **Verification Method:** Test command succeeds

---

## Files to Delete

- [ ] `src/core/handlers/HandlerRegistry.ts` (67 lines)
  - Unused generic handler registry class
  - Never imported by any production code
  - Only exists because of an abandoned consolidation effort

- [ ] `tests/core/handlers/HandlerRegistry.test.ts` (67 lines)
  - Tests for the unused class above
  - Provides no value since the code it tests is never run

---

## Files to Modify

### 1. `src/core/handlers/index.ts`

- [ ] **Remove:** Exports of `HandlerRegistry` and `Handler` type

**Before:**
```typescript
export {
    HandlerRegistry,
    type Handler,
} from './HandlerRegistry';

export {
    createErrorResponse,
    wrapHandler,
    type ErrorResponse,
} from './errorHandling';

export { executeCommandForProject } from './projectCommandHelper';
```

**After:**
```typescript
export {
    createErrorResponse,
    wrapHandler,
    type ErrorResponse,
} from './errorHandling';

export { executeCommandForProject } from './projectCommandHelper';
```

### 2. `src/features/project-creation/handlers/ProjectCreationHandlerRegistry.ts`

- [ ] **Remove:** Deprecated alias export (lines 115-119)

**Before (lines 115-119):**
```typescript
/**
 * @deprecated Use ProjectCreationHandlerRegistry instead
 * Alias for backward compatibility during migration
 */
export { ProjectCreationHandlerRegistry as HandlerRegistry };
```

**After:** (delete these 5 lines entirely)

### 3. `src/features/project-creation/handlers/index.ts`

- [ ] **Remove:** `HandlerRegistry` from export

**Before (line 8):**
```typescript
export { ProjectCreationHandlerRegistry, HandlerRegistry } from './ProjectCreationHandlerRegistry';
```

**After:**
```typescript
export { ProjectCreationHandlerRegistry } from './ProjectCreationHandlerRegistry';
```

### 4. `src/features/project-creation/index.ts`

- [ ] **Remove:** `HandlerRegistry` from export

**Before (line 22):**
```typescript
export { ProjectCreationHandlerRegistry, HandlerRegistry } from './handlers/ProjectCreationHandlerRegistry';
```

**After:**
```typescript
export { ProjectCreationHandlerRegistry } from './handlers/ProjectCreationHandlerRegistry';
```

### 5. `tests/features/barrel-exports.test.ts`

- [ ] **Update:** Test to expect canonical name, not deprecated alias

**Before (lines 24-29):**
```typescript
it('should export HandlerRegistry', async () => {
    const exports = await import('@/features/project-creation');

    expect(exports.HandlerRegistry).toBeDefined();
    expect(typeof exports.HandlerRegistry).toBe('function');
});
```

**After:**
```typescript
it('should export ProjectCreationHandlerRegistry (canonical name)', async () => {
    const exports = await import('@/features/project-creation');

    expect(exports.ProjectCreationHandlerRegistry).toBeDefined();
    expect(typeof exports.ProjectCreationHandlerRegistry).toBe('function');

    // Deprecated alias should NOT be exported
    expect((exports as Record<string, unknown>).HandlerRegistry).toBeUndefined();
});
```

---

## Implementation Details

### RED Phase (Update Tests First)

1. **Update barrel export test** in `tests/features/barrel-exports.test.ts`:
   - Change test name from "should export HandlerRegistry" to "should export ProjectCreationHandlerRegistry (canonical name)"
   - Update expectation to check for `ProjectCreationHandlerRegistry`
   - Add assertion that deprecated `HandlerRegistry` is undefined

2. **Run tests to see expected failure:**
   ```bash
   npm test -- tests/features/barrel-exports.test.ts
   ```
   - Test should fail because `HandlerRegistry` still exists

### GREEN Phase (Remove Dead Code)

1. **Delete unused files:**
   ```bash
   rm src/core/handlers/HandlerRegistry.ts
   rm tests/core/handlers/HandlerRegistry.test.ts
   ```

2. **Update `src/core/handlers/index.ts`:**
   - Remove the `HandlerRegistry` and `Handler` exports

3. **Update `src/features/project-creation/handlers/ProjectCreationHandlerRegistry.ts`:**
   - Delete lines 115-119 (the deprecated alias export with JSDoc)

4. **Update `src/features/project-creation/handlers/index.ts`:**
   - Remove `, HandlerRegistry` from the export statement

5. **Update `src/features/project-creation/index.ts`:**
   - Remove `, HandlerRegistry` from the export statement

6. **Verify compilation:**
   ```bash
   npm run build
   ```

7. **Verify tests pass:**
   ```bash
   npm test
   ```

### REFACTOR Phase

No refactoring needed - this is a pure deletion step.

---

## Expected Outcome

- **Files Deleted:** 2 (source file + test file)
- **Lines Removed:** ~200 total
  - 67 lines from `HandlerRegistry.ts`
  - 67 lines from `HandlerRegistry.test.ts`
  - 5 lines deprecated alias in `ProjectCreationHandlerRegistry.ts`
  - 3 barrel export cleanups
  - ~10 lines test update (net neutral)
- **Tests:** 267 - 6 = 261 tests passing (6 tests removed with dead code)
- **Compilation:** Clean build with no errors

**What works after this step:**
- All production code functions identically (no behavior change)
- Barrel exports are cleaner with only canonical names
- No deprecated aliases confusing developers
- No dead code paths to maintain

---

## Acceptance Criteria

- [ ] `src/core/handlers/HandlerRegistry.ts` deleted
- [ ] `tests/core/handlers/HandlerRegistry.test.ts` deleted
- [ ] `src/core/handlers/index.ts` no longer exports `HandlerRegistry` or `Handler`
- [ ] Deprecated alias removed from `ProjectCreationHandlerRegistry.ts`
- [ ] Deprecated alias removed from barrel exports (handlers/index.ts, feature index.ts)
- [ ] Barrel export test updated to expect canonical name only
- [ ] `npm run build` succeeds with no errors
- [ ] `npm test` passes (all remaining tests green)
- [ ] No console.log or debugger statements
- [ ] Code follows project style guide

---

## Estimated Time

**30-45 minutes**

- 10 min: Update barrel export test
- 10 min: Delete files and clean up exports
- 10-15 min: Verify build and tests
- 5 min: Final review

---

## Rollback Plan

If issues discovered after removal:

```bash
# Restore deleted files
git checkout HEAD -- src/core/handlers/HandlerRegistry.ts
git checkout HEAD -- tests/core/handlers/HandlerRegistry.test.ts

# Revert barrel export changes
git checkout HEAD -- src/core/handlers/index.ts
git checkout HEAD -- src/features/project-creation/handlers/ProjectCreationHandlerRegistry.ts
git checkout HEAD -- src/features/project-creation/handlers/index.ts
git checkout HEAD -- src/features/project-creation/index.ts
git checkout HEAD -- tests/features/barrel-exports.test.ts
```

---

## Notes

### Why HandlerRegistry<T> Was Never Used

The generic `HandlerRegistry<T>` in `src/core/handlers/` was created during a code efficiency refactoring effort (see `.rptc/complete/code-efficiency-refactoring/step-02.md`). The plan was to consolidate multiple handler registry implementations into one generic version.

However, analysis revealed that:
1. `BaseHandlerRegistry` (the abstract class in `src/core/base/`) already serves as the base for all feature registries
2. Each feature's registry (Dashboard, ProjectCreation, Mesh, etc.) extends `BaseHandlerRegistry`
3. The generic `HandlerRegistry<T>` provided no additional value over `BaseHandlerRegistry`

The consolidation was never completed, leaving `HandlerRegistry<T>` as orphaned code.

### Why the Deprecated Alias Was Never Needed

The `export { ProjectCreationHandlerRegistry as HandlerRegistry }` alias was added "for backward compatibility during migration." However:
1. No migration ever happened
2. All code always imported `ProjectCreationHandlerRegistry` directly
3. The alias added confusion without providing value

---

_Step 2 of 7 in Over-Engineering Remediation Plan_
