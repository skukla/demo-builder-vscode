# Step 4: Remove Atomic Design Directories and Delete src/core/ui/

**Purpose:** Delete empty atomic design directories, remove src/core/ui/ duplicates, delete dead entry points

**Prerequisites:**

- [x] Step 1: Pre-Flight Verification complete
- [x] Step 2: Directory structure created
- [x] Step 3: Components moved to function-based directories
- [ ] Git working tree clean (Step 3 committed)

## Tests to Write First

**NO NEW TESTS** - File deletions don't change functionality

- [ ] **Verification:** Atomic design directories removed
  - **Given:** Empty atomic design directories
  - **When:** Run `find webview-ui/src/shared/components -type d | grep -E "(atoms|molecules|organisms|templates)"`
  - **Then:** 0 results (directories deleted)
  - **File:** Manual verification

- [ ] **Verification:** src/core/ui/ removed
  - **Given:** Duplicate code directory deleted
  - **When:** Run `ls src/core/ui 2>&1`
  - **Then:** "No such file or directory" error
  - **File:** Manual verification

- [ ] **Verification:** Dead entry points removed
  - **Given:** Unused ui/main/ files deleted
  - **When:** Run `find src/features -name "main" -type d`
  - **Then:** 0 results (main/ directories deleted)
  - **File:** Manual verification

## Files to Create/Modify

**Files to Delete:**

**Atomic Design Directories (empty after Step 3):**
- [ ] `webview-ui/src/shared/components/atoms/` - Delete directory
- [ ] `webview-ui/src/shared/components/molecules/` - Delete directory
- [ ] `webview-ui/src/shared/components/organisms/` - Delete directory
- [ ] `webview-ui/src/shared/components/templates/` - Delete directory

**src/core/ui/ Duplicates (26 files, 2,285 lines):**
- [ ] `src/core/ui/components/` - Delete directory (8 files)
- [ ] `src/core/ui/hooks/` - Delete directory (9 files)
- [ ] `src/core/ui/styles/` - Delete directory (3 files)
- [ ] `src/core/ui/types/` - Delete directory (1 file)
- [ ] `src/core/ui/utils/` - Delete directory (1 file)
- [ ] `src/core/ui/vscode-api.ts` - Delete file
- [ ] `src/core/ui/` - Delete parent directory

**Dead Entry Points (4 files):**
- [ ] `src/features/dashboard/ui/main/` - Delete directory
- [ ] `src/features/welcome/ui/main/` - Delete directory
- [ ] `src/features/project-creation/ui/main/` - Delete directory

## Implementation Details

### 1. Verify Atomic Design Directories Are Empty

```bash
# Check that atoms/ is empty (except index.ts)
ls webview-ui/src/shared/components/atoms/
# Expected: index.ts only (or empty)

# Check molecules/
ls webview-ui/src/shared/components/molecules/
# Expected: index.ts only (or empty)

# Check organisms/
ls webview-ui/src/shared/components/organisms/
# Expected: index.ts only (or empty)

# Check templates/
ls webview-ui/src/shared/components/templates/
# Expected: index.ts only (or empty)
```

### 2. Delete Atomic Design Directories

```bash
# Remove atomic design directories
git rm -r webview-ui/src/shared/components/atoms
git rm -r webview-ui/src/shared/components/molecules
git rm -r webview-ui/src/shared/components/organisms
git rm -r webview-ui/src/shared/components/templates

# Verify deletion
find webview-ui/src/shared/components -type d | grep -E "(atoms|molecules|organisms|templates)"
# Expected: 0 results
```

### 3. Verify No References to src/core/ui/ Before Deletion

```bash
# CRITICAL: Verify no imports remain (Step 5 will fix imports, but check baseline)
grep -r "from ['\"]@/core/ui" src/ tests/ webview-ui/ 2>/dev/null | wc -l
# Expected: 30 imports (18 src, 12 tests) - will be fixed in Step 5

# Check for dynamic imports (should be 0)
grep -r "import(.*@/core/ui" src/ tests/ webview-ui/ 2>/dev/null
# Expected: 0 results

# Check for require() statements (should be 0)
grep -r "require(.*@/core/ui" src/ tests/ webview-ui/ 2>/dev/null
# Expected: 0 results
```

**WARNING:** If dynamic imports or require() found, STOP and document before proceeding.

### 4. Delete src/core/ui/ Directory

```bash
# Delete entire src/core/ui/ directory
git rm -r src/core/ui

# Verify deletion
ls src/core/ui 2>&1
# Expected: "No such file or directory"

# Verify git tracked deletion
git status | grep "deleted:.*core/ui"
# Expected: Multiple "deleted:" entries
```

### 5. Verify No References to Dead Entry Points

```bash
# Check for imports from ui/main/
grep -r "from.*ui/main" src/ tests/ webview-ui/ 2>/dev/null
# Expected: 0 results (these files were not imported)

# Check webpack.config.js (should NOT reference these files)
grep -A 20 "entry:" webpack.config.js | grep -E "(configure|project-dashboard|welcome|index).tsx"
# Expected: 0 results (webpack uses different entry points)
```

### 6. Delete Dead Entry Points

```bash
# Delete dashboard/ui/main/
git rm -r src/features/dashboard/ui/main

# Delete welcome/ui/main/
git rm -r src/features/welcome/ui/main

# Delete project-creation/ui/main/
git rm -r src/features/project-creation/ui/main

# Verify deletions
find src/features -name "main" -type d
# Expected: 0 results
```

### 7. Update Main Barrel File

Edit `webview-ui/src/shared/components/index.ts`:

**Remove these lines:**
```typescript
// Atoms
export * from './atoms';

// Molecules
export * from './molecules';

// Organisms
export * from './organisms';

// Templates
export * from './templates';
```

**Replace with:**
```typescript
// UI Components (basic elements)
export * from './ui';

// Form Components
export * from './forms';

// Feedback Components
export * from './feedback';

// Navigation Components
export * from './navigation';

// Layout Components
export * from './layout';
```

**Full updated file:**
```typescript
/**
 * Shared Webview Components
 *
 * This file exports all shared UI components used throughout the webview application.
 * Organized by function (ui, forms, feedback, navigation, layout) rather than size.
 */

// UI Components (basic elements)
export * from './ui';

// Form Components
export * from './forms';

// Feedback Components
export * from './feedback';

// Navigation Components
export * from './navigation';

// Layout Components
export * from './layout';

// Feature-Specific Components
export { CompactOption } from './CompactOption';
export { ComponentCard } from './ComponentCard';
export { ConfigurationSummary } from './ConfigurationSummary';
export { DependencyItem } from './DependencyItem';
export { SelectionSummary } from './SelectionSummary';
export { Tip } from './Tip';

// Debug Components
export * from './debug';

// Spectrum Extended Components
export * from './spectrum-extended';

// Legacy Terminal Output (keep for now)
export * from './feedback';
```

### 8. Verify TypeScript Can Still Find Components

```bash
# TypeScript compilation (will have import errors, but files should resolve)
npm run compile:typescript 2>&1 | tee /tmp/step4-typescript-check.txt

# Check for "Cannot find module" errors
grep "Cannot find module" /tmp/step4-typescript-check.txt | wc -l
# Expected: Many errors (imports not updated yet), but should be fixable

# Check for deleted file references (should be 0)
grep "core/ui" /tmp/step4-typescript-check.txt | wc -l
# Expected: Some errors referencing @/core/ui imports (will be fixed in Step 5)
```

### 9. Create Commit Checkpoint

```bash
# Stage all deletions and barrel file update
git add .

# Commit
git commit -m "refactor: remove atomic design directories and duplicate src/core/ui/

- Delete atoms/, molecules/, organisms/, templates/ (empty after component migration)
- Delete src/core/ui/ directory (2,285 lines of duplicate code)
  - 8 component files (duplicates of webview-ui components)
  - 9 hook files (re-exports from webview-ui hooks)
  - 3 style files, 1 type file, 1 util file
  - vscode-api.ts re-export
- Delete dead entry points:
  - src/features/dashboard/ui/main/
  - src/features/welcome/ui/main/
  - src/features/project-creation/ui/main/
- Update main barrel file to export from function-based directories

Total: 30 files deleted (26 from src/core/ui/, 4 dead entry points)

⚠️  BREAKING: Imports from @/core/ui now broken (fixed in Step 5)

Part of frontend-architecture-cleanup plan
Refs: .rptc/plans/frontend-architecture-cleanup/"

# Verify commit
git log -1 --stat
```

## Expected Outcome

- [ ] 4 atomic design directories deleted (atoms/, molecules/, organisms/, templates/)
- [ ] src/core/ui/ directory completely deleted (2,285 lines removed)
- [ ] 3 dead ui/main/ directories deleted (4 files removed)
- [ ] Main barrel file updated with function-based exports
- [ ] Git commit created documenting deletions
- [ ] TypeScript compilation broken (expected - fixed in Step 5)
- [ ] 30 total files deleted

## Acceptance Criteria

- [ ] No atomic design directories remain in webview-ui/src/shared/components/
- [ ] src/core/ directory no longer contains ui/ subdirectory
- [ ] No ui/main/ directories remain in src/features/
- [ ] Main barrel file exports from function-based directories
- [ ] Git status clean after commit
- [ ] ~30 files deleted tracked in git commit
- [ ] Webpack still recognizes entry points (wizard, welcome, dashboard, configure)

**Estimated Time:** 1 hour

---

## Rollback Strategy

**If issues during deletions:**

```bash
# Rollback all deletions
git reset --hard HEAD~1

# Verify atomic design directories restored
find webview-ui/src/shared/components -type d | grep -E "(atoms|molecules|organisms|templates)"
# Expected: 4 directories

# Verify src/core/ui/ restored
ls src/core/ui
# Expected: components/, hooks/, styles/, types/, utils/, vscode-api.ts
```

**Cost:** Low (git makes deletions reversible)

**Important:** After rollback, must also rollback Step 3 (component moves) to return to consistent state.
