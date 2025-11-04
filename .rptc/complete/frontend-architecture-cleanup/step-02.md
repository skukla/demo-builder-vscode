# Step 2: Create Function-Based Directory Structure

**Purpose:** Establish new function-based directory structure before moving files, create barrel files for clean exports

**Prerequisites:**

- [x] Step 1: Pre-Flight Verification complete
- [x] Step 1.5: Usage Analysis complete (dead code identified)
- [ ] All assumptions verified (no blockers)
- [ ] Git working tree clean

## Tests to Write First

**NO NEW TESTS** - Directory creation doesn't require tests

- [ ] **Verification:** Directory structure created correctly
  - **Given:** New directories created
  - **When:** Run `find webview-ui/src/shared/components -type d | sort`
  - **Then:** All 5 new directories exist (ui/, forms/, feedback/, navigation/, layout/)
  - **File:** Manual verification

- [ ] **Verification:** Barrel files have correct structure
  - **Given:** Barrel files created with placeholder exports
  - **When:** Check TypeScript compilation
  - **Then:** No syntax errors in barrel files
  - **File:** TypeScript compilation

## Files to Create/Modify

- [ ] `webview-ui/src/shared/components/ui/` - Create directory
- [ ] `webview-ui/src/shared/components/forms/` - Create directory
- [ ] `webview-ui/src/shared/components/feedback/` - Create directory
- [ ] `webview-ui/src/shared/components/navigation/` - Create directory
- [ ] `webview-ui/src/shared/components/layout/` - Create directory
- [ ] `webview-ui/src/shared/components/ui/index.ts` - Create barrel file
- [ ] `webview-ui/src/shared/components/forms/index.ts` - Create barrel file
- [ ] `webview-ui/src/shared/components/feedback/index.ts` - Create barrel file
- [ ] `webview-ui/src/shared/components/navigation/index.ts` - Create barrel file
- [ ] `webview-ui/src/shared/components/layout/index.ts` - Create barrel file

## Implementation Details

### 1. Create Directory Structure

```bash
# Create function-based directories
mkdir -p webview-ui/src/shared/components/ui
mkdir -p webview-ui/src/shared/components/forms
mkdir -p webview-ui/src/shared/components/feedback
mkdir -p webview-ui/src/shared/components/navigation
mkdir -p webview-ui/src/shared/components/layout

# Verify creation
find webview-ui/src/shared/components -type d -maxdepth 1 | sort
```

### 2. Create ui/ Barrel File

Create `webview-ui/src/shared/components/ui/index.ts`:

```typescript
/**
 * UI Components
 *
 * Basic UI elements (badges, icons, spinners, transitions, etc.)
 * These are simple, single-purpose components.
 *
 * Migration from atomic design: atoms/ → ui/
 */

// Placeholder - components will be moved in Step 3
// export { Badge } from './Badge';
// export type { BadgeProps, BadgeVariant } from './Badge';

// export { Icon } from './Icon';
// export type { IconProps, IconSize } from './Icon';

// export { Spinner } from './Spinner';
// export type { SpinnerProps } from './Spinner';

// export { StatusDot } from './StatusDot';
// export type { StatusDotProps, StatusDotVariant } from './StatusDot';

// export { Tag } from './Tag';
// export type { TagProps } from './Tag';

// export { Transition } from './Transition';
// export type { TransitionProps } from './Transition';

// export { FadeTransition } from './FadeTransition';
// export type { FadeTransitionProps } from './FadeTransition';

// export { Modal } from './Modal';
// export type { ModalProps } from './Modal';

// export { NumberedInstructions } from './NumberedInstructions';
// export type { NumberedInstructionsProps } from './NumberedInstructions';
```

### 3. Create forms/ Barrel File

Create `webview-ui/src/shared/components/forms/index.ts`:

```typescript
/**
 * Form Components
 *
 * Form-related components (form fields, config sections, etc.)
 * These handle user input and configuration.
 *
 * Migration from atomic design: molecules/ → forms/
 */

// Placeholder - components will be moved in Step 3
// export { FormField } from './FormField';
// export type { FormFieldProps, FormFieldOption } from './FormField';

// export { ConfigSection } from './ConfigSection';
// export type { ConfigSectionProps } from './ConfigSection';
```

### 4. Create feedback/ Barrel File

Create `webview-ui/src/shared/components/feedback/index.ts`:

```typescript
/**
 * Feedback Components
 *
 * Status, loading, error, and empty state components.
 * These provide feedback to users about system state.
 *
 * Migration from atomic design: molecules/ → feedback/
 */

// Placeholder - components will be moved in Step 3
// export { LoadingDisplay } from './LoadingDisplay';
// export type { LoadingDisplayProps } from './LoadingDisplay';

// export { StatusCard } from './StatusCard';
// export type { StatusCardProps } from './StatusCard';

// export { LoadingOverlay } from './LoadingOverlay';
// export type { LoadingOverlayProps } from './LoadingOverlay';

// export { ErrorDisplay } from './ErrorDisplay';
// export type { ErrorDisplayProps } from './ErrorDisplay';

// export { EmptyState } from './EmptyState';
// export type { EmptyStateProps } from './EmptyState';
```

### 5. Create navigation/ Barrel File

Create `webview-ui/src/shared/components/navigation/index.ts`:

```typescript
/**
 * Navigation Components
 *
 * Components for navigation, search, and list management.
 * These help users find and select items.
 *
 * Migration from atomic design: organisms/ → navigation/
 */

// Placeholder - components will be moved in Step 3
// export { SearchableList } from './SearchableList';
// export type { SearchableListProps, SearchableListItem } from './SearchableList';

// export { NavigationPanel } from './NavigationPanel';
// export type { NavigationPanelProps, NavigationSection, NavigationField } from './NavigationPanel';
```

### 6. Create layout/ Barrel File

Create `webview-ui/src/shared/components/layout/index.ts`:

```typescript
/**
 * Layout Components
 *
 * Layout and structural components (grids, columns, etc.)
 * These define page structure and organization.
 *
 * Migration from atomic design: templates/ → layout/
 */

// Placeholder - components will be moved in Step 3
// export { TwoColumnLayout } from './TwoColumnLayout';
// export type { TwoColumnLayoutProps } from './TwoColumnLayout';

// export { GridLayout } from './GridLayout';
// export type { GridLayoutProps } from './GridLayout';
```

### 7. Verify Directory Structure

```bash
# Verify all directories created
tree webview-ui/src/shared/components -L 2

# Expected output:
# webview-ui/src/shared/components
# ├── atoms/
# ├── debug/
# ├── feedback/
# │   └── index.ts
# ├── forms/
# │   └── index.ts
# ├── layout/
# │   └── index.ts
# ├── molecules/
# ├── navigation/
# │   └── index.ts
# ├── organisms/
# ├── spectrum-extended/
# ├── templates/
# ├── ui/
# │   └── index.ts
# └── index.ts
```

### 8. Verify TypeScript Compilation

```bash
# Check that barrel files have no syntax errors
npx tsc --noEmit webview-ui/src/shared/components/ui/index.ts
npx tsc --noEmit webview-ui/src/shared/components/forms/index.ts
npx tsc --noEmit webview-ui/src/shared/components/feedback/index.ts
npx tsc --noEmit webview-ui/src/shared/components/navigation/index.ts
npx tsc --noEmit webview-ui/src/shared/components/layout/index.ts
```

## Expected Outcome

- [ ] 5 new directories created in function-based structure
- [ ] 5 barrel files created with placeholder exports (all commented out)
- [ ] TypeScript compilation clean (no syntax errors in new files)
- [ ] Directory structure matches design (ui/, forms/, feedback/, navigation/, layout/)
- [ ] Atomic design directories still exist (will be removed in Step 4)

## Acceptance Criteria

- [ ] All directories created successfully
- [ ] All barrel files created with correct structure (placeholder exports commented)
- [ ] TypeScript compilation succeeds for new barrel files
- [ ] Git status shows 5 new untracked files (barrel files)
- [ ] No existing files modified
- [ ] Documentation comments in barrel files explain purpose and migration source

**Estimated Time:** 30 minutes

## Step 2 Completion Summary

**Status:** ✅ COMPLETE

**Implementation Results:**
- 5 directories created successfully (ui/, forms/, feedback/, navigation/, layout/)
- 5 barrel files created with placeholder exports (all commented out)
- All barrel files include documentation explaining purpose and migration source
- TypeScript compilation: All clean (no syntax errors)
- Git status: 5 new untracked files, 0 modifications

**Files Created:**
- `webview-ui/src/shared/components/ui/index.ts` (37 lines, placeholder exports)
- `webview-ui/src/shared/components/forms/index.ts` (20 lines, placeholder exports)
- `webview-ui/src/shared/components/feedback/index.ts` (30 lines, placeholder exports)
- `webview-ui/src/shared/components/navigation/index.ts` (22 lines, placeholder exports)
- `webview-ui/src/shared/components/layout/index.ts` (20 lines, placeholder exports)

**Verification Passed:**
- Directory structure matches design ✅
- All barrel files compile without errors ✅
- No existing files modified ✅
- Placeholder exports ready for Step 3 migration ✅

**Ready for:** Step 3 - Move or Delete Components Based on Usage

---

## Rollback Strategy

**If issues during directory creation:**

```bash
# Remove created directories
rm -rf webview-ui/src/shared/components/ui
rm -rf webview-ui/src/shared/components/forms
rm -rf webview-ui/src/shared/components/feedback
rm -rf webview-ui/src/shared/components/navigation
rm -rf webview-ui/src/shared/components/layout

# Verify clean state
git status
```

**Cost:** Zero (no files modified, only new files created)
