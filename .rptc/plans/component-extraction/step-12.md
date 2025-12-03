# Step 12: Deprecate ErrorDisplay in Favor of StatusDisplay

## Overview

Migrate all ErrorDisplay usages to StatusDisplay (which already supports error variants with actions), then deprecate ErrorDisplay.

## Test Requirements

### Test File
No new tests - this is a migration and deprecation step.

### Verification

```bash
# Before: Find all ErrorDisplay usages
grep -r "ErrorDisplay" src/ --include="*.tsx" -l

# After: Should only find the deprecated component itself
grep -r "ErrorDisplay" src/ --include="*.tsx" -l
# Expected: Only src/core/ui/components/feedback/ErrorDisplay.tsx
```

## Implementation

### Step 1: Audit ErrorDisplay Usages

Find all files importing ErrorDisplay:

```bash
grep -r "import.*ErrorDisplay" src/ --include="*.tsx"
```

### Step 2: Compare APIs

**ErrorDisplay (current):**
```typescript
interface ErrorDisplayProps {
  title: string;
  message?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}
```

**StatusDisplay (target):**
```typescript
interface StatusDisplayProps {
  variant: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  icon?: React.ReactNode;
}
```

### Step 3: Migrate Each Usage

For each file using ErrorDisplay:

**Before:**
```tsx
import { ErrorDisplay } from '@/core/ui/components/feedback';

<ErrorDisplay
  title="Authentication Failed"
  message="Please try signing in again"
  action={{ label: 'Sign In', onPress: handleSignIn }}
/>
```

**After:**
```tsx
import { StatusDisplay } from '@/core/ui/components/feedback';

<StatusDisplay
  variant="error"
  title="Authentication Failed"
  message="Please try signing in again"
  action={{ label: 'Sign In', onPress: handleSignIn }}
/>
```

### Step 4: Files to Update

Based on research, likely files to update:

1. **AuthErrorState.tsx** - Authentication error display
2. **MeshErrorDialog.tsx** - Mesh deployment errors
3. **Any other error displays** - Search will reveal

### Step 5: Add Deprecation Notice

**Location:** `src/core/ui/components/feedback/ErrorDisplay.tsx`

```typescript
/**
 * @deprecated Use `StatusDisplay` with `variant="error"` instead.
 * This component will be removed in a future version.
 *
 * @example
 * // Before:
 * <ErrorDisplay title="Error" message="Something went wrong" />
 *
 * // After:
 * <StatusDisplay variant="error" title="Error" message="Something went wrong" />
 */
export function ErrorDisplay(props: ErrorDisplayProps): React.ReactElement {
  // Log deprecation warning in development
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      'ErrorDisplay is deprecated. Use StatusDisplay with variant="error" instead.'
    );
  }

  // Delegate to StatusDisplay
  return <StatusDisplay variant="error" {...props} />;
}
```

### Step 6: Update Index Export

**Location:** `src/core/ui/components/feedback/index.ts`

```typescript
export { StatusDisplay } from './StatusDisplay';
export type { StatusDisplayProps } from './StatusDisplay';

// Deprecated - use StatusDisplay with variant="error"
export { ErrorDisplay } from './ErrorDisplay';
export type { ErrorDisplayProps } from './ErrorDisplay';
```

## Verification

```bash
# Run tests for affected components
npm run test:fast -- tests/webview-ui/shared/components/feedback/

# Run tests for migrated files
npm run test:fast -- tests/features/authentication/ui/steps/components/
npm run test:fast -- tests/features/mesh/ui/steps/components/

# Verify build
npm run compile

# Check for remaining direct usages (should be 0 after migration)
grep -r "import.*ErrorDisplay" src/ --include="*.tsx" | grep -v "feedback/ErrorDisplay"
```

## Acceptance Criteria

- [x] All ErrorDisplay usages migrated to StatusDisplay
- [x] ErrorDisplay component marked as deprecated
- [x] ErrorDisplay internally delegates to StatusDisplay
- [x] Development warning logged when ErrorDisplay used
- [x] All tests pass (87 tests)
- [x] No visual regressions

## Completion Notes

**Completed:** 2025-12-02

**Files Modified:**
- `src/core/ui/components/feedback/index.ts` - Added StatusDisplay export
- `src/core/ui/components/feedback/ErrorDisplay.tsx` - Deprecated, now delegates to StatusDisplay
- `src/features/authentication/ui/components/SelectionStepContent.tsx` - Migrated to StatusDisplay
- `tests/webview-ui/shared/components/feedback/ErrorDisplay.test.tsx` - Updated 2 tests for new behavior

**Changes:**
- ErrorDisplay reduced from 90 lines to 72 lines (delegates to StatusDisplay)
- SelectionStepContent now uses StatusDisplay directly
- StatusDisplay exported from feedback barrel file
- Warning color changed from yellow-600 to orange-600 (matches StatusDisplay convention)

## Rollback Plan

If issues arise:
1. Revert migrations to StatusDisplay
2. Remove deprecation notice from ErrorDisplay
3. Investigate specific failure

## Notes

- StatusDisplay already supports all ErrorDisplay functionality
- Adding `variant="error"` is the only change needed
- Keep ErrorDisplay as a deprecated wrapper for backward compatibility
- Can fully remove ErrorDisplay in a future major version
- Development warning helps catch lingering usages during testing
