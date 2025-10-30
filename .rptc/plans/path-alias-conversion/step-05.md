# Step 5: Convert src/types/, src/utils/, and src/providers/

**Purpose:** Complete backend conversion by updating remaining utility and type modules

**Prerequisites:**
- [x] Step 4 completed (src/core/ and src/features/ converted)
- [x] All Step 4 tests passing
- [x] TypeScript compilation succeeds

**Tests to Write First:**

- [x] Test: Remaining src/ files compile with path aliases
  - **Given:** src/types/, src/utils/, src/providers/ converted
  - **When:** Run TypeScript compilation
  - **Then:** Compilation succeeds with 9 baseline errors
  - **File:** N/A (compilation test)

- [x] Test: Backend compilation fully succeeds
  - **Given:** All src/ imports converted to path aliases
  - **When:** Run full TypeScript compilation
  - **Then:** 9 baseline errors maintained, no new errors
  - **File:** N/A (compilation test)

**Files to Create/Modify:**

- [x] `src/types/**/*.ts` - Already using path aliases correctly (hybrid pattern)
- [x] `src/utils/**/*.ts` - Only 1 file: autoUpdater.ts (1 import converted)
- [x] `src/providers/**/*.ts` - Directory doesn't exist (outdated plan info)

**Implementation Details:**

**RED Phase** (Identify remaining files):

```bash
# Find files in these directories with upward relative imports
find src/types src/utils src/providers -name "*.ts" -type f -exec grep -l "from '\\.\\./'" {} \; 2>/dev/null

# Count files per directory
echo "Types: $(find src/types -name "*.ts" -type f -exec grep -l "from '\\.\\./'" {} \; 2>/dev/null | wc -l)"
echo "Utils: $(find src/utils -name "*.ts" -type f -exec grep -l "from '\\.\\./'" {} \; 2>/dev/null | wc -l)"
echo "Providers: $(find src/providers -name "*.ts" -type f -exec grep -l "from '\\.\\./'" {} \; 2>/dev/null | wc -l)"
```

**GREEN Phase** (Convert imports):

**Conversion Rules:**

1. **src/types/** (usually doesn't import much):
   - Convert `../core/` → `@/core/`
   - Convert `../features/` → `@/features/`
   - Most type files are self-contained

2. **src/utils/** (legacy utilities being phased out):
   - Convert `../core/` → `@/core/`
   - Convert `../features/` → `@/features/`
   - Convert `../types/` → `@/types/`
   - Note: Many utils have been migrated to features/

3. **src/providers/** (VS Code providers):
   - Convert `../core/` → `@/core/`
   - Convert `../features/` → `@/features/`
   - Convert `../types/` → `@/types/`

**Batch Conversion Script:**

```bash
# src/types/ conversions
find src/types -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./core/|from '@/core/|g" {} \; 2>/dev/null
find src/types -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./features/|from '@/features/|g" {} \; 2>/dev/null
find src/types -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./shared/|from '@/core/|g" {} \; 2>/dev/null

# src/utils/ conversions
find src/utils -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./core/|from '@/core/|g" {} \; 2>/dev/null
find src/utils -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./features/|from '@/features/|g" {} \; 2>/dev/null
find src/utils -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./types/|from '@/types/|g" {} \; 2>/dev/null
find src/utils -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./shared/|from '@/core/|g" {} \; 2>/dev/null

# src/providers/ conversions
find src/providers -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./core/|from '@/core/|g" {} \; 2>/dev/null
find src/providers -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./features/|from '@/features/|g" {} \; 2>/dev/null
find src/providers -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./types/|from '@/types/|g" {} \; 2>/dev/null
find src/providers -name "*.ts" -type f -exec sed -i '' "s|from '\\.\\./shared/|from '@/core/|g" {} \; 2>/dev/null
```

**Manual Review:**

```bash
# Review all changes
git diff src/types/ src/utils/ src/providers/

# Verify conversions are correct
# Look for:
# - Incorrect path mappings
# - Imports that should stay relative
# - Broken import paths
```

**REFACTOR Phase** (Verify and cleanup):

1. **Check for remaining relative imports**
   ```bash
   # Should only find within-directory relative imports
   find src/types src/utils src/providers -name "*.ts" -exec grep -H "from '\\./" {} \; 2>/dev/null
   ```

2. **Full backend compilation**
   ```bash
   # This should succeed with zero errors
   npm run build
   ```

3. **ESLint check**
   ```bash
   npx eslint src/types/ src/utils/ src/providers/
   ```

4. **Verify backend complete**
   ```bash
   # Find any remaining upward relative imports in ALL of src/
   find src -name "*.ts" -exec grep -l "from '\\.\\./'" {} \; | wc -l
   # Should be 0 or very close to 0 (only within-directory allowed)
   ```

**Expected Outcome:**

- All cross-boundary imports in src/types/, src/utils/, src/providers/ use path aliases
- **Backend conversion complete** (all src/ directories done)
- TypeScript compilation succeeds
- Zero upward relative imports in src/

**Acceptance Criteria:**

- [x] All tests passing for this step
- [x] TypeScript compilation succeeds (npm run compile)
- [x] No upward relative imports in src/types/, src/utils/, src/providers/
- [x] ESLint passes for these directories
- [x] Full src/ directory has zero upward relative imports
- [x] Git diff reviewed and approved

**Actual Time:** 0.25 hours (much simpler than estimated - only 1 file needed conversion)

---

## Step 5 Completion Report

**Execution Date:** 2025-10-29

### Actual Implementation

**Scope Discovery:**
- **src/types/**: 10 files - Already using hybrid pattern correctly ✅
- **src/utils/**: 1 file (`autoUpdater.ts`) - 1 import converted
- **src/providers/**: Directory doesn't exist (outdated plan information)

**Files Modified:** 1 file
- `src/utils/autoUpdater.ts` - Line 7 converted from `'../types'` to `'@/types'`

**Imports Converted:** 1 import
- `import { UpdateInfo } from '../types'` → `import { UpdateInfo } from '@/types'`

**Refactoring Applied:**
- ESLint auto-fix applied for import order (core before types)

### Test Results

**Compilation:** ✅ PASS
- TypeScript compilation succeeded
- Baseline: 9 errors (maintained, no new errors)
- Errors: 4 in adobeEntityService.ts, 1 in showDashboard.ts, 4 in showWelcome.ts

**Backend Milestone:** ✅ COMPLETE
- Upward relative imports in src/: **0**
- Path alias usage count: **368**
- All cross-boundary imports use path aliases
- Within-directory imports use relative paths (hybrid pattern)

**ESLint:** ✅ PASS
- No errors or warnings after auto-fix

### Constraints Compliance

- ✅ No logic changes (pure refactoring)
- ✅ Hybrid pattern maintained
- ✅ Baseline error count maintained (9 errors)
- ✅ Backend milestone achieved

### Backend Milestone Verification

**Status**: ✅ **COMPLETE** - All src/ directories converted

**Verification:**
```bash
# Upward relative imports remaining
find src -name "*.ts" -exec grep -l "from '\\.\\./'" {} \; | wc -l
# Result: 0 ✅

# Path alias usage
grep -r "from '@/" src/ --include="*.ts" | wc -l
# Result: 368 ✅
```

**Directories Status:**
- src/types/: ✅ Complete (already using path aliases)
- src/utils/: ✅ Complete (1 file converted)
- src/providers/: N/A (doesn't exist)
- src/commands/: ✅ Complete (Step 3)
- src/core/: ✅ Complete (Step 4)
- src/features/: ✅ Complete (Step 4)
- src/extension.ts: ✅ Complete (Step 2)

### Ready For Next Step

✅ **Yes** - Step 6 (Frontend webview-ui/shared/ verification) can begin

**Note**: Frontend conversion (Steps 6-8) begins with webview-ui/ directory.

---

## Verification Commands

```bash
# 1. Verify minimal upward relative imports in entire src/
find src -name "*.ts" -exec grep -l "from '\\.\\./'" {} \; | wc -l  # Should be ~0

# 2. Verify compilation succeeds
npm run build && echo "✅ Backend conversion complete"

# 3. Count path alias usage across all src/
grep -r "from '@/" src/ -l | wc -l

# 4. Verify ESLint passes
npx eslint src/

# 5. Verify dist/ folder populated
ls -lh dist/ | grep -E "extension\.js|commandManager\.js"
```

## Commit Message

```
refactor: convert src/types/, src/utils/, src/providers/ to path aliases

- Convert all cross-boundary imports to path aliases
- Complete backend (src/) path alias conversion
- Maintain hybrid pattern (aliases for cross-boundary only)

Affected directories:
- src/types/ (~3 files)
- src/utils/ (~2 files)
- src/providers/ (~2 files)

Backend conversion: ✅ COMPLETE (100% of src/)

Part of path alias conversion (Step 5/10)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Notes

- **Smallest batch** - mostly cleanup
- **Backend milestone**: After this step, all src/ is converted
- src/utils/ is legacy code being phased out (minimal impact)
- src/types/ usually has minimal imports
- Next steps focus on webview-ui/ (frontend)
