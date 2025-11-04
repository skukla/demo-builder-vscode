# Step 4: Migrate Shared Code to webview-ui/src/shared/

**Purpose:** Move all shared components, hooks, contexts, styles, and utils from `src/core/ui/` and `src/webviews/` to `webview-ui/src/shared/` using `git mv` to preserve history. Delete duplicate files identified in Step 3.

**Prerequisites:**

- [x] Step 1 completed (inventory created)
- [x] Step 2 completed (directory structure exists)
- [x] Step 3 completed (duplicates consolidated)
- [ ] Consolidation decisions reviewed and approved

**Tests to Write First:**

- [ ] Test: Verify git history preserved for moved files
  - **Given:** Files moved with `git mv`
  - **When:** Run `git log --follow webview-ui/src/shared/components/Modal.tsx`
  - **Then:** Git history shows original commits from src/core/ui/components/Modal.tsx
  - **File:** Manual test

- [ ] Test: Verify no files left in old locations (after migration)
  - **Given:** All files moved to webview-ui/src/shared/
  - **When:** Run `ls src/core/ui/components/` and `ls src/webviews/components/shared/`
  - **Then:** Directories empty or contain only non-migrated files
  - **File:** Manual test

- [ ] Test: Verify moved files compile (before import updates)
  - **Given:** Files moved to webview-ui/src/shared/
  - **When:** Run `npx tsc --noEmit -p webview-ui/tsconfig.json`
  - **Then:** No TypeScript errors (imports may fail, but file syntax valid)
  - **File:** Manual test

**Files to Create/Modify:**

- [ ] **Move from src/core/ui/components/ to webview-ui/src/shared/components/**
  - Modal.tsx
  - FadeTransition.tsx
  - LoadingDisplay.tsx
  - FormField.tsx
  - NumberedInstructions.tsx
  - StatusCard.tsx
  - TwoColumnLayout.tsx
  - GridLayout.tsx

- [ ] **Move from src/core/ui/hooks/ to webview-ui/src/shared/hooks/**
  - useAsyncData.ts
  - useVSCodeMessage.ts
  - useVSCodeRequest.ts
  - useSelectableDefault.ts
  - useAutoScroll.ts
  - useLoadingState.ts
  - useFocusTrap.ts
  - useSelection.ts
  - useSearchFilter.ts
  - index.ts

- [ ] **Move from src/core/ui/utils/ to webview-ui/src/shared/utils/**
  - classNames.ts

- [ ] **Move from src/webviews/components/ to webview-ui/src/shared/components/**
  - atoms/ (all: Badge, Icon, Spinner, StatusDot, Tag, Transition)
  - molecules/ (all except duplicates: ConfigSection, ErrorDisplay, EmptyState, LoadingOverlay)
  - organisms/ (all: NavigationPanel, SearchableList)
  - shared/ (unique files: ComponentCard, ConfigurationSummary, DependencyItem, SelectionSummary, Tip, CompactOption)
  - feedback/ (all: TerminalOutput)
  - debug/ (all debug utilities)
  - spectrum-extended/ (if any)

- [ ] **Move from src/webviews/ to webview-ui/src/shared/**
  - contexts/ → webview-ui/src/shared/contexts/
  - hooks/ → webview-ui/src/shared/hooks/ (merge with core/ui hooks)
  - styles/ → webview-ui/src/shared/styles/
  - utils/ → webview-ui/src/shared/utils/ (merge with core/ui utils)
  - types/ → webview-ui/src/shared/types/

- [ ] **Delete duplicate files (from Step 3)**
  - src/webviews/components/shared/Modal.tsx
  - src/webviews/components/shared/FadeTransition.tsx
  - src/webviews/components/shared/LoadingDisplay.tsx
  - src/webviews/components/molecules/FormField.tsx
  - src/webviews/components/shared/NumberedInstructions.tsx
  - src/webviews/components/molecules/StatusCard.tsx

**Implementation Details:**

**RED Phase** (Write failing tests)

No automated tests - manual verification with git:

```bash
# Test 1: Verify git mv preserves history (will fail until files moved)
git log --follow webview-ui/src/shared/components/Modal.tsx

# Test 2: Verify TypeScript compilation (will fail with import errors initially)
npx tsc --noEmit -p webview-ui/tsconfig.json
```

**GREEN Phase** (Minimal implementation)

1. **Move Core UI Components**

```bash
# Move consolidated components from src/core/ui/components/
git mv src/core/ui/components/Modal.tsx webview-ui/src/shared/components/
git mv src/core/ui/components/FadeTransition.tsx webview-ui/src/shared/components/
git mv src/core/ui/components/LoadingDisplay.tsx webview-ui/src/shared/components/
git mv src/core/ui/components/FormField.tsx webview-ui/src/shared/components/
git mv src/core/ui/components/NumberedInstructions.tsx webview-ui/src/shared/components/
git mv src/core/ui/components/StatusCard.tsx webview-ui/src/shared/components/
git mv src/core/ui/components/TwoColumnLayout.tsx webview-ui/src/shared/components/
git mv src/core/ui/components/GridLayout.tsx webview-ui/src/shared/components/

# Verify git history preserved
git log --oneline --follow webview-ui/src/shared/components/Modal.tsx | head -5
```

2. **Move Core UI Hooks**

```bash
# Move all hooks from src/core/ui/hooks/
git mv src/core/ui/hooks/useAsyncData.ts webview-ui/src/shared/hooks/
git mv src/core/ui/hooks/useVSCodeMessage.ts webview-ui/src/shared/hooks/
git mv src/core/ui/hooks/useVSCodeRequest.ts webview-ui/src/shared/hooks/
git mv src/core/ui/hooks/useSelectableDefault.ts webview-ui/src/shared/hooks/
git mv src/core/ui/hooks/useAutoScroll.ts webview-ui/src/shared/hooks/
git mv src/core/ui/hooks/useLoadingState.ts webview-ui/src/shared/hooks/
git mv src/core/ui/hooks/useFocusTrap.ts webview-ui/src/shared/hooks/
git mv src/core/ui/hooks/useSelection.ts webview-ui/src/shared/hooks/
git mv src/core/ui/hooks/useSearchFilter.ts webview-ui/src/shared/hooks/
git mv src/core/ui/hooks/index.ts webview-ui/src/shared/hooks/index-core.ts  # Rename to avoid conflict

# Verify moves
ls -la webview-ui/src/shared/hooks/
```

3. **Move Core UI Utils**

```bash
# Move utils from src/core/ui/utils/
git mv src/core/ui/utils/classNames.ts webview-ui/src/shared/utils/

# Verify
ls -la webview-ui/src/shared/utils/
```

4. **Delete Duplicate Files**

```bash
# Delete duplicates identified in Step 3 (NOT using git mv - these are duplicates)
git rm src/webviews/components/shared/Modal.tsx
git rm src/webviews/components/shared/FadeTransition.tsx
git rm src/webviews/components/shared/LoadingDisplay.tsx
git rm src/webviews/components/molecules/FormField.tsx
git rm src/webviews/components/shared/NumberedInstructions.tsx
git rm src/webviews/components/molecules/StatusCard.tsx

# Commit deletions
git commit -m "refactor(webview): Remove duplicate components

Removed duplicate components that were consolidated in src/core/ui/components/:
- Modal.tsx (kept core/ui version with size mapping)
- FadeTransition.tsx (kept core/ui version with cleaner logic)
- LoadingDisplay.tsx (kept core/ui version with more features)
- FormField.tsx (kept core/ui version)
- NumberedInstructions.tsx (kept core/ui version)
- StatusCard.tsx (kept core/ui version)

Part of webview architecture restructure to eliminate duplication."
```

5. **Move Webviews Components (Unique Files)**

```bash
# Move atoms/ directory
git mv src/webviews/components/atoms webview-ui/src/shared/components/

# Move molecules/ directory (remaining files after duplicate deletion)
for file in src/webviews/components/molecules/*; do
  git mv "$file" webview-ui/src/shared/components/molecules/
done

# Move organisms/ directory
git mv src/webviews/components/organisms webview-ui/src/shared/components/

# Move shared/ directory (remaining unique files)
for file in src/webviews/components/shared/*; do
  if [ -f "$file" ]; then
    git mv "$file" webview-ui/src/shared/components/
  fi
done

# Move feedback/ directory
git mv src/webviews/components/feedback webview-ui/src/shared/components/

# Move debug/ directory
if [ -d "src/webviews/components/debug" ]; then
  git mv src/webviews/components/debug webview-ui/src/shared/components/
fi

# Verify moves
ls -la webview-ui/src/shared/components/
```

6. **Move Webviews Contexts**

```bash
# Move all contexts
git mv src/webviews/contexts webview-ui/src/shared/

# Verify
ls -la webview-ui/src/shared/contexts/
```

7. **Move Webviews Hooks (Merge with Core UI Hooks)**

```bash
# Move each hook file individually (to handle potential conflicts)
for hook in src/webviews/hooks/*; do
  filename=$(basename "$hook")

  # Check if file already exists in webview-ui/src/shared/hooks/
  if [ -f "webview-ui/src/shared/hooks/$filename" ]; then
    echo "CONFLICT: $filename already exists - manual merge required"
    # Document conflict for manual resolution
    echo "$filename" >> .rptc/plans/webview-architecture-restructure/hook-conflicts.txt
  else
    git mv "$hook" webview-ui/src/shared/hooks/
  fi
done

# Verify
ls -la webview-ui/src/shared/hooks/
```

8. **Move Webviews Styles**

```bash
# Move styles directory
git mv src/webviews/styles webview-ui/src/shared/

# Verify
ls -la webview-ui/src/shared/styles/
```

9. **Move Webviews Utils (Merge with Core UI Utils)**

```bash
# Move each util file individually
for util in src/webviews/utils/*; do
  filename=$(basename "$util")

  # Check if file already exists
  if [ -f "webview-ui/src/shared/utils/$filename" ]; then
    echo "CONFLICT: $filename already exists - manual merge required"
    echo "$filename" >> .rptc/plans/webview-architecture-restructure/util-conflicts.txt
  else
    git mv "$util" webview-ui/src/shared/utils/
  fi
done

# Verify
ls -la webview-ui/src/shared/utils/
```

10. **Move Webviews Types**

```bash
# Move types directory
git mv src/webviews/types webview-ui/src/shared/

# Verify
ls -la webview-ui/src/shared/types/
```

11. **Create Index Files for Barrel Exports**

```bash
# Create webview-ui/src/shared/components/index.ts
cat > webview-ui/src/shared/components/index.ts << 'EOF'
// Consolidated shared components
export { Modal } from './Modal';
export { FadeTransition } from './FadeTransition';
export { LoadingDisplay } from './LoadingDisplay';
export { FormField } from './FormField';
export { NumberedInstructions } from './NumberedInstructions';
export { StatusCard } from './StatusCard';
export { TwoColumnLayout } from './TwoColumnLayout';
export { GridLayout } from './GridLayout';

// Atoms
export * from './atoms';

// Molecules
export * from './molecules';

// Organisms
export * from './organisms';

// Feedback
export * from './feedback';
EOF

# Create webview-ui/src/shared/hooks/index.ts
cat > webview-ui/src/shared/hooks/index.ts << 'EOF'
// Core UI hooks
export { useAsyncData } from './useAsyncData';
export { useVSCodeMessage } from './useVSCodeMessage';
export { useVSCodeRequest } from './useVSCodeRequest';
export { useSelectableDefault } from './useSelectableDefault';
export { useAutoScroll } from './useAutoScroll';
export { useLoadingState } from './useLoadingState';
export { useFocusTrap } from './useFocusTrap';
export { useSelection } from './useSelection';
export { useSearchFilter } from './useSearchFilter';

// Webview-specific hooks (if any unique hooks exist)
// Add exports here after reviewing hook conflicts
EOF

# Create webview-ui/src/shared/index.ts (main barrel export)
cat > webview-ui/src/shared/index.ts << 'EOF'
// Shared components, hooks, and utilities for webview UI
export * from './components';
export * from './hooks';
export * from './contexts';
export * from './utils';
export * from './types';
EOF
```

**REFACTOR Phase** (Improve while keeping tests green)

1. **Resolve Hook Conflicts (if any)**

```bash
# Check if conflicts were documented
if [ -f ".rptc/plans/webview-architecture-restructure/hook-conflicts.txt" ]; then
  echo "Hook conflicts detected - manual merge required:"
  cat .rptc/plans/webview-architecture-restructure/hook-conflicts.txt

  # For each conflict, manually:
  # 1. Compare both versions with diff
  # 2. Merge useful features from both
  # 3. Delete inferior version
  # 4. Document merge decision
fi
```

2. **Resolve Util Conflicts (if any)**

```bash
# Check if conflicts were documented
if [ -f ".rptc/plans/webview-architecture-restructure/util-conflicts.txt" ]; then
  echo "Util conflicts detected - manual merge required:"
  cat .rptc/plans/webview-architecture-restructure/util-conflicts.txt

  # For each conflict, manually:
  # 1. Compare with diff (likely classNames.ts)
  # 2. Merge if different, delete if duplicate
  # 3. Document merge decision
fi
```

3. **Verify Git History Preserved**

```bash
# Check history for moved files
git log --oneline --follow webview-ui/src/shared/components/Modal.tsx | head -10
git log --oneline --follow webview-ui/src/shared/hooks/useAsyncData.ts | head -10
git log --oneline --follow webview-ui/src/shared/contexts/ThemeContext.tsx | head -10

# All should show original commits from old locations
```

4. **Commit Migrations**

```bash
# Commit shared code migration
git commit -m "refactor(webview): Migrate shared code to webview-ui/src/shared/

Moved all shared components, hooks, contexts, styles, utils, and types from:
- src/core/ui/ → webview-ui/src/shared/
- src/webviews/ → webview-ui/src/shared/

This establishes clear separation between extension host code and webview UI code.

File moves preserve git history via git mv.

Part of webview architecture restructure (Step 4)."
```

**Expected Outcome:**

- All shared components moved to webview-ui/src/shared/components/ (30+ files)
- All shared hooks moved to webview-ui/src/shared/hooks/ (15+ files)
- All contexts, styles, utils, types moved to webview-ui/src/shared/
- Duplicate files deleted (6 files)
- Git history preserved for all moved files
- Barrel exports created for easy imports

**Acceptance Criteria:**

- [ ] All core/ui components moved to webview-ui/src/shared/components/
- [ ] All core/ui hooks moved to webview-ui/src/shared/hooks/
- [ ] All webviews/ shared code moved to webview-ui/src/shared/
- [ ] Duplicate files deleted (6 files from Step 3)
- [ ] Git history preserved (verified with `git log --follow`)
- [ ] Hook/util conflicts resolved (if any)
- [ ] Barrel export files created (index.ts in each directory)
- [ ] src/core/ui/ directory now empty (or only non-migrated files remain)
- [ ] src/webviews/components/ directory now empty of shared code

**Estimated Time:** 3-4 hours
