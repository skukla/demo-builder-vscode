# Step 3: Move or Delete Components Based on Usage Analysis

**Purpose:** Migrate USED components from atomic design structure to function-based directories using `git mv`, DELETE UNUSED components identified in Step 1.5

**Prerequisites:**

- [x] Step 1: Pre-Flight Verification complete
- [x] Step 1.5: Usage Analysis complete
- [x] Step 2: Directory structure created
- [ ] Usage reports reviewed (dead code identified)
- [ ] Git working tree clean (barrel files from Step 2 staged)

## Tests to Write First

**NO NEW TESTS** - File moves don't change functionality

- [ ] **Verification:** All components moved successfully
  - **Given:** Components moved with `git mv`
  - **When:** Run `git status`
  - **Then:** All moves tracked by git (renamed: old → new)
  - **File:** Manual verification

- [ ] **Verification:** Git history preserved
  - **Given:** Components moved with `git mv`
  - **When:** Run `git log --follow webview-ui/src/shared/components/ui/Badge.tsx`
  - **Then:** Full history visible (includes pre-move commits)
  - **File:** Manual verification

- [ ] **Verification:** TypeScript finds all moved files
  - **Given:** Components in new locations
  - **When:** Run `npx tsc --noEmit` on webview-ui
  - **Then:** TypeScript resolves all imports (may have wrong paths, but files found)
  - **File:** TypeScript compilation

## Files to Create/Modify

**Moved Files (27 total):**

**atoms/ → ui/ (8 files):**
- [ ] `Badge.tsx` → `ui/Badge.tsx`
- [ ] `Icon.tsx` → `ui/Icon.tsx`
- [ ] `Spinner.tsx` → `ui/Spinner.tsx`
- [ ] `StatusDot.tsx` → `ui/StatusDot.tsx`
- [ ] `StatusDot.d.ts` → `ui/StatusDot.d.ts`
- [ ] `Tag.tsx` → `ui/Tag.tsx`
- [ ] `Transition.tsx` → `ui/Transition.tsx`

**molecules/ → forms/ and feedback/ (5 files):**
- [ ] `FormField.tsx` → `forms/FormField.tsx`
- [ ] `ConfigSection.tsx` → `forms/ConfigSection.tsx`
- [ ] `ErrorDisplay.tsx` → `feedback/ErrorDisplay.tsx`
- [ ] `LoadingOverlay.tsx` → `feedback/LoadingOverlay.tsx`
- [ ] `EmptyState.tsx` → `feedback/EmptyState.tsx`

**organisms/ → navigation/ (2 files):**
- [ ] `SearchableList.tsx` → `navigation/SearchableList.tsx`
- [ ] `NavigationPanel.tsx` → `navigation/NavigationPanel.tsx`

**templates/ → layout/ (2 files):**
- [ ] `TwoColumnLayout.tsx` → `layout/TwoColumnLayout.tsx`
- [ ] `GridLayout.tsx` → `layout/GridLayout.tsx`

**components/ (shared) → appropriate directories (10 files):**
- [ ] `FadeTransition.tsx` → `ui/FadeTransition.tsx`
- [ ] `FadeTransition.d.ts` → `ui/FadeTransition.d.ts`
- [ ] `Modal.tsx` → `ui/Modal.tsx`
- [ ] `Modal.d.ts` → `ui/Modal.d.ts`
- [ ] `NumberedInstructions.tsx` → `ui/NumberedInstructions.tsx`
- [ ] `NumberedInstructions.d.ts` → `ui/NumberedInstructions.d.ts`
- [ ] `LoadingDisplay.tsx` → `feedback/LoadingDisplay.tsx`
- [ ] `LoadingDisplay.d.ts` → `feedback/LoadingDisplay.d.ts`
- [ ] `StatusCard.tsx` → `feedback/StatusCard.tsx`
- [ ] `StatusCard.d.ts` → `feedback/StatusCard.d.ts`
- [ ] `GridLayout.tsx` → `layout/GridLayout.tsx` (duplicate, will overwrite)
- [ ] `GridLayout.d.ts` → `layout/GridLayout.d.ts`
- [ ] `TwoColumnLayout.tsx` → `layout/TwoColumnLayout.tsx` (duplicate, will overwrite)
- [ ] `TwoColumnLayout.d.ts` → `layout/TwoColumnLayout.d.ts`

## Implementation Details

### 0. Review Usage Reports (CRITICAL - Do This First)

```bash
# Review dead code summary
cat .rptc/plans/frontend-architecture-cleanup/dead-code-summary.txt

# Review component decisions
cat .rptc/plans/frontend-architecture-cleanup/usage-report-components.txt

# Review hook decisions
cat .rptc/plans/frontend-architecture-cleanup/usage-report-hooks.txt

# Review test decisions
cat .rptc/plans/frontend-architecture-cleanup/usage-report-tests.txt

# IMPORTANT: For each component below, check if marked "DELETE ✗" in report
# If DELETE: Use `git rm` instead of `git mv`
# If MIGRATE: Use `git mv` as shown
# If REVIEW: Proceed with `git mv` (conservative - keep when uncertain)
```

### 1. Move or Delete Components from atoms/ to ui/

```bash
cd webview-ui/src/shared/components

# EXAMPLE: Check usage before moving
# if grep -q "Badge.*DELETE" ../../.rptc/plans/frontend-architecture-cleanup/usage-report-components.txt; then
#   echo "Deleting unused component: Badge.tsx"
#   git rm atoms/Badge.tsx
# else
#   echo "Migrating used component: Badge.tsx"
#   git mv atoms/Badge.tsx ui/Badge.tsx
# fi

# For efficiency, manually review report and execute appropriate command for each file:

# Badge.tsx - CHECK REPORT FIRST
git mv atoms/Badge.tsx ui/Badge.tsx  # OR: git rm atoms/Badge.tsx if unused
git mv atoms/Icon.tsx ui/Icon.tsx
git mv atoms/Spinner.tsx ui/Spinner.tsx
git mv atoms/StatusDot.tsx ui/StatusDot.tsx
git mv atoms/StatusDot.d.ts ui/StatusDot.d.ts
git mv atoms/Tag.tsx ui/Tag.tsx
git mv atoms/Transition.tsx ui/Transition.tsx

# Verify moves
git status | grep "renamed:"
```

### 2. Move Components from molecules/ to forms/ and feedback/

```bash
# Move form-related components
git mv molecules/FormField.tsx forms/FormField.tsx
git mv molecules/ConfigSection.tsx forms/ConfigSection.tsx

# Move feedback components
git mv molecules/ErrorDisplay.tsx feedback/ErrorDisplay.tsx
git mv molecules/LoadingOverlay.tsx feedback/LoadingOverlay.tsx
git mv molecules/EmptyState.tsx feedback/EmptyState.tsx

# Verify moves
git status | grep "renamed:.*molecules"
```

### 3. Move Components from organisms/ to navigation/

```bash
# Move navigation components
git mv organisms/SearchableList.tsx navigation/SearchableList.tsx
git mv organisms/NavigationPanel.tsx navigation/NavigationPanel.tsx

# Verify moves
git status | grep "renamed:.*organisms"
```

### 4. Move Components from templates/ to layout/

```bash
# Move layout components
git mv templates/TwoColumnLayout.tsx layout/TwoColumnLayout.tsx
git mv templates/GridLayout.tsx layout/GridLayout.tsx

# Verify moves
git status | grep "renamed:.*templates"
```

### 5. Move Shared Components to Appropriate Directories

```bash
# Move UI components from shared
git mv FadeTransition.tsx ui/FadeTransition.tsx
git mv FadeTransition.d.ts ui/FadeTransition.d.ts
git mv Modal.tsx ui/Modal.tsx
git mv Modal.d.ts ui/Modal.d.ts
git mv NumberedInstructions.tsx ui/NumberedInstructions.tsx
git mv NumberedInstructions.d.ts ui/NumberedInstructions.d.ts

# Move feedback components from shared
git mv LoadingDisplay.tsx feedback/LoadingDisplay.tsx
git mv LoadingDisplay.d.ts feedback/LoadingDisplay.d.ts
git mv StatusCard.tsx feedback/StatusCard.tsx
git mv StatusCard.d.ts feedback/StatusCard.d.ts

# Handle duplicates (GridLayout and TwoColumnLayout already moved from templates/)
# These are duplicates - prefer the templates/ versions (already in layout/)
# Just remove the shared component versions
rm GridLayout.tsx GridLayout.d.ts
rm TwoColumnLayout.tsx TwoColumnLayout.d.ts

# Also remove compiled JS files if they exist
rm -f *.js *.js.map *.d.ts.map

# Verify all moves
git status
```

### 6. Update Barrel Files with Real Exports

Update `webview-ui/src/shared/components/ui/index.ts`:

```typescript
/**
 * UI Components
 *
 * Basic UI elements (badges, icons, spinners, transitions, etc.)
 * These are simple, single-purpose components.
 *
 * Migration from atomic design: atoms/ → ui/
 */

export { Badge } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';

export { Icon } from './Icon';
export type { IconProps, IconSize } from './Icon';

export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';

export { StatusDot } from './StatusDot';
export type { StatusDotProps, StatusDotVariant } from './StatusDot';

export { Tag } from './Tag';
export type { TagProps } from './Tag';

export { Transition } from './Transition';
export type { TransitionProps } from './Transition';

export { FadeTransition } from './FadeTransition';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { NumberedInstructions } from './NumberedInstructions';
export type { NumberedInstructionsProps } from './NumberedInstructions';
```

Update `webview-ui/src/shared/components/forms/index.ts`:

```typescript
/**
 * Form Components
 *
 * Form-related components (form fields, config sections, etc.)
 * These handle user input and configuration.
 *
 * Migration from atomic design: molecules/ → forms/
 */

export { FormField } from './FormField';
export type { FormFieldProps, FormFieldOption } from './FormField';

export { ConfigSection } from './ConfigSection';
export type { ConfigSectionProps } from './ConfigSection';
```

Update `webview-ui/src/shared/components/feedback/index.ts`:

```typescript
/**
 * Feedback Components
 *
 * Status, loading, error, and empty state components.
 * These provide feedback to users about system state.
 *
 * Migration from atomic design: molecules/ → feedback/
 */

export { LoadingDisplay } from './LoadingDisplay';
export type { LoadingDisplayProps } from './LoadingDisplay';

export { StatusCard } from './StatusCard';
export type { StatusCardProps } from './StatusCard';

export { LoadingOverlay } from './LoadingOverlay';
export type { LoadingOverlayProps } from './LoadingOverlay';

export { ErrorDisplay } from './ErrorDisplay';
export type { ErrorDisplayProps } from './ErrorDisplay';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
```

Update `webview-ui/src/shared/components/navigation/index.ts`:

```typescript
/**
 * Navigation Components
 *
 * Components for navigation, search, and list management.
 * These help users find and select items.
 *
 * Migration from atomic design: organisms/ → navigation/
 */

export { SearchableList } from './SearchableList';
export type { SearchableListProps, SearchableListItem } from './SearchableList';

export { NavigationPanel } from './NavigationPanel';
export type { NavigationPanelProps, NavigationSection, NavigationField } from './NavigationPanel';
```

Update `webview-ui/src/shared/components/layout/index.ts`:

```typescript
/**
 * Layout Components
 *
 * Layout and structural components (grids, columns, etc.)
 * These define page structure and organization.
 *
 * Migration from atomic design: templates/ → layout/
 */

export { TwoColumnLayout } from './TwoColumnLayout';
export type { TwoColumnLayoutProps } from './TwoColumnLayout';

export { GridLayout } from './GridLayout';
export type { GridLayoutProps } from './GridLayout';
```

### 7. Verify All Moves Tracked by Git

```bash
# Count renamed files
git status --short | grep "^R " | wc -l
# Expected: ~27 files

# Verify specific moves
git log --follow --oneline webview-ui/src/shared/components/ui/Badge.tsx | head -5
# Should show history from atoms/Badge.tsx

# Check for any deleted files (should only be duplicates)
git status --short | grep "^D "
# Expected: GridLayout.tsx, TwoColumnLayout.tsx (duplicates removed)
```

### 8. Create Commit Checkpoint

```bash
# Stage all changes
git add .

# Commit file moves
git commit -m "refactor: migrate components from atomic design to function-based structure

- Move atoms/ → ui/ (8 components)
- Move molecules/ → forms/ and feedback/ (5 components)
- Move organisms/ → navigation/ (2 components)
- Move templates/ → layout/ (2 components)
- Move shared components to appropriate directories (10 components)
- Update barrel files with real exports
- Remove duplicate GridLayout and TwoColumnLayout

Total: 27 components migrated, history preserved with git mv

Part of frontend-architecture-cleanup plan
Refs: .rptc/plans/frontend-architecture-cleanup/"

# Verify commit
git log -1 --stat
```

## Expected Outcome

- [ ] USED components moved to function-based directories (count may be <27 if unused deleted)
- [ ] UNUSED components deleted (per Step 1.5 usage reports)
- [ ] Git history preserved for all moved files
- [ ] Duplicate GridLayout and TwoColumnLayout removed
- [ ] All barrel files updated with real exports (only for migrated components)
- [ ] Git commit created with detailed message
- [ ] Atomic design directories now empty (will be removed in Step 4)
- [ ] Dead code eliminated before migration (not after)

## Acceptance Criteria

- [ ] All USED component files moved successfully
- [ ] All UNUSED component files deleted (per usage reports)
- [ ] Git shows "renamed:" for all moves (migrated components)
- [ ] Git shows "deleted:" for unused components
- [ ] `git log --follow` shows full history for moved files
- [ ] Barrel files export all components from new locations
- [ ] TypeScript can find all files (imports broken, but files resolve)
- [ ] No unexpected file deletions (only duplicates removed)
- [ ] Commit created with clear message

**Estimated Time:** 1.5 hours

---

## Rollback Strategy

**If issues during file moves:**

```bash
# Rollback all moves
git reset --hard HEAD

# Or rollback specific moves
git checkout HEAD -- webview-ui/src/shared/components/
```

**Cost:** Low (git mv is atomic, easy to rollback)

**Verification After Rollback:**
```bash
# Verify atomic design structure restored
find webview-ui/src/shared/components/atoms -type f
find webview-ui/src/shared/components/molecules -type f
```
