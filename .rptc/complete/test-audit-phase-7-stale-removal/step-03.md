# Step 3: Verify Structural Alignment and Final Cleanup

## Purpose

Final verification step to ensure test directory structure aligns with source code structure, resolve any remaining structural drift, and document the cleanup for future reference.

## Prerequisites

- [ ] Step 1 completed (inventory created)
- [ ] Step 2 completed (stale tests removed)
- [ ] Test suite passing after Step 2
- [ ] Coverage validated after Step 2

## Tests to Write First

- [ ] **Verification:** Final test suite validation
  - **Given:** All stale tests removed and structure cleaned
  - **When:** Full test suite with coverage is executed
  - **Then:** All tests pass, coverage meets target (80%+)
  - **Command:** `npm test -- --coverage`

- [ ] **Verification:** TypeScript compilation clean
  - **Given:** Test infrastructure after cleanup
  - **When:** TypeScript compiler runs with noEmit
  - **Then:** No errors related to tests
  - **Command:** `npx tsc --noEmit`

## Structural Analysis

### Directory Structure Comparison

Compare test structure to source structure:

**Source Structure (`src/`):**
```
src/
├── core/
│   ├── base/
│   ├── cache/
│   ├── commands/
│   ├── communication/
│   ├── config/
│   ├── di/
│   ├── errors/
│   ├── handlers/
│   ├── logging/
│   ├── shell/
│   ├── state/
│   ├── ui/
│   ├── utils/
│   ├── validation/
│   └── vscode/
├── features/
│   ├── authentication/
│   ├── components/
│   ├── dashboard/
│   ├── eds/
│   ├── lifecycle/
│   ├── mesh/
│   ├── prerequisites/
│   ├── project-creation/
│   ├── projects-dashboard/
│   ├── sidebar/
│   └── updates/
├── commands/
├── utils/
└── types/
```

**Test Structure (`tests/`):**
```
tests/
├── core/           # Mirrors src/core/
├── features/       # Mirrors src/features/
├── unit/           # POTENTIAL DRIFT - separate from core/features
├── integration/    # Integration tests (expected)
├── webview-ui/     # React component tests (expected)
├── helpers/        # Global test helpers (expected)
├── testUtils/      # Global async utilities (expected)
├── __mocks__/      # Jest mocks (expected)
├── setup/          # Jest setup (expected)
├── types/          # Type tests (expected)
├── scripts/        # Test scripts (expected)
├── templates/      # Template validation tests (expected)
├── security/       # Security tests (expected)
└── commands/       # POTENTIAL DRIFT - legacy handler location
```

### Structural Issues to Evaluate

#### Issue 1: `tests/unit/` Directory

**Current State:**
- Contains `prerequisites/`, `utils/`, `features/eds/`, `features/mesh/`
- Separate from main `tests/core/` and `tests/features/` structure

**Files in `tests/unit/`:**
- `tests/unit/prerequisites/cacheManager-invalidation.test.ts`
- `tests/unit/prerequisites/cacheManager-operations.test.ts`
- `tests/unit/prerequisites/cacheManager-security.test.ts`
- `tests/unit/prerequisites/cacheManager.testUtils.ts`
- `tests/unit/prerequisites/parallelExecution.test.ts`
- `tests/unit/utils/progressUnifier-cleanup.test.ts`
- `tests/unit/utils/progressUnifier-commands.test.ts`
- `tests/unit/utils/progressUnifier-node-version.test.ts`
- `tests/unit/utils/progressUnifier-strategies.test.ts`
- `tests/unit/utils/progressUnifier.testUtils.ts`
- `tests/unit/utils/progressUnifierHelpers.test.ts`
- `tests/unit/features/eds/services/*.test.ts` (7 files)
- `tests/unit/features/eds/handlers/edsHandlers.test.ts`
- `tests/unit/features/mesh/services/stalenessDetector.test.ts`

**Decision Required:**
- [ ] **Option A:** Migrate to `tests/core/` and `tests/features/` (aligns with README)
- [ ] **Option B:** Keep `tests/unit/` as separate namespace (may have tooling reasons)
- [ ] **Option C:** Document as intentional divergence

**Recommended Action:** Option A - Migrate, as README indicates this was migration plan

#### Issue 2: `tests/commands/handlers/` Directory

**Current State:**
- Contains only `HandlerContext.test.ts`
- README mentions this was supposed to migrate to `tests/features/*/handlers/`

**Decision Required:**
- [ ] Evaluate if `HandlerContext.test.ts` should move to `tests/core/handlers/`
- [ ] Or if it tests feature-specific handler context, move to appropriate feature

**Recommended Action:** Move to `tests/core/handlers/HandlerContext.test.ts`

#### Issue 3: Duplicate UI Test Locations

**Current State:**
- `tests/webview-ui/shared/` - React component tests
- `tests/core/ui/` - Also contains UI component tests

**Analysis:**
- `tests/core/ui/` appears to test core UI infrastructure
- `tests/webview-ui/` tests shared webview components
- This may be intentional separation

**Recommended Action:** Document as intentional (core UI vs shared webview UI)

## Implementation Details

### RED Phase (Analyze Structure)

1. Generate structure comparison:
   ```bash
   # Generate source directory list
   find src -type d | sort > /tmp/src-dirs.txt

   # Generate test directory list
   find tests -type d | sort > /tmp/test-dirs.txt

   # Compare for alignment
   diff /tmp/src-dirs.txt /tmp/test-dirs.txt
   ```

2. Document all structural discrepancies

### GREEN Phase (Resolve Discrepancies)

Based on decisions made above:

**If migrating `tests/unit/`:**

```bash
# Create target directories if needed
mkdir -p tests/features/prerequisites/services
mkdir -p tests/core/utils/progressUnifier

# Move prerequisites tests
git mv tests/unit/prerequisites/*.test.ts tests/features/prerequisites/services/
git mv tests/unit/prerequisites/*.testUtils.ts tests/features/prerequisites/services/

# Move progressUnifier tests
git mv tests/unit/utils/progressUnifier*.test.ts tests/core/utils/progressUnifier/
git mv tests/unit/utils/progressUnifier*.testUtils.ts tests/core/utils/progressUnifier/
git mv tests/unit/utils/progressUnifierHelpers.test.ts tests/core/utils/progressUnifier/

# Move EDS tests (already in features structure)
git mv tests/unit/features/eds/* tests/features/eds/

# Move mesh tests
git mv tests/unit/features/mesh/* tests/features/mesh/

# Remove empty unit directory
rm -rf tests/unit/

# Fix imports in moved files
# (May need to update relative paths to testUtils)
```

**If migrating `tests/commands/handlers/`:**

```bash
# Move HandlerContext test to core/handlers
git mv tests/commands/handlers/HandlerContext.test.ts tests/core/handlers/

# Remove empty directory
rm -rf tests/commands/handlers/
rmdir tests/commands/
```

### REFACTOR Phase (Validate and Document)

1. Run full test suite:
   ```bash
   npm test -- --coverage
   ```

2. Fix any broken imports from file moves

3. Update `tests/README.md` if structure changed:
   - Remove references to `tests/unit/`
   - Remove references to `tests/commands/handlers/`
   - Confirm directory structure documentation is accurate

## Expected Outcome

- Test directory structure mirrors src/ directory structure
- All legacy/drift directories either migrated or documented
- README.md accurately describes current structure
- No empty or orphaned directories remain
- Test suite passes with expected coverage

## Acceptance Criteria

- [ ] Structural analysis completed and documented
- [ ] Migration decisions made for each drift issue
- [ ] Migrations executed (if applicable)
- [ ] All moved test files have updated imports
- [ ] Full test suite passes after migrations
- [ ] Coverage maintained at acceptable levels
- [ ] `tests/README.md` updated to reflect current structure
- [ ] No empty directories remain
- [ ] Git history preserved via `git mv` for moved files

## Estimated Time

1-2 hours

---

## Documentation Updates

### README.md Updates

If structure changes are made, update `tests/README.md`:

**Remove these sections if directories are migrated:**
- References to `tests/unit/`
- References to `tests/commands/handlers/`
- Migration History section (can be simplified)

**Add these clarifications:**
- Confirm `tests/core/ui/` vs `tests/webview-ui/` distinction
- Document any intentional structural differences

### Final Verification Checklist

After all changes:

- [ ] `npm test` passes
- [ ] `npm test -- --coverage` shows 80%+ coverage
- [ ] `npx tsc --noEmit` passes
- [ ] No IDE errors in test files
- [ ] `git log --follow` works for moved files
- [ ] README.md is accurate
- [ ] No empty directories exist

---

## Commit Message Template

After completing all steps, create a descriptive commit:

```
chore(tests): complete phase 7 stale test removal audit

- Remove placeholder tests in npmFallback.test.ts
- Remove empty directory tests/unit/features/eds/ui/steps/
- Migrate tests/unit/ contents to tests/core/ and tests/features/
- Migrate tests/commands/handlers/ to tests/core/handlers/
- Update README.md to reflect current structure

Part of test infrastructure cleanup initiative.
Test coverage maintained at X% (baseline: Y%).

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Post-Audit Recommendations

Document lessons learned for future test infrastructure maintenance:

1. **Establish PR checks** for test file placement
   - Lint rule to enforce tests mirror src structure
   - CI check for empty directories

2. **Periodic audit schedule**
   - Quarterly review of testUtils usage
   - Annual structural alignment check

3. **Documentation requirements**
   - All non-standard test locations must have README explaining why
   - Migration notes preserved in commit messages

4. **Prevention measures**
   - Add ESLint rule for import path consistency
   - Add pre-commit hook to detect orphaned test files
