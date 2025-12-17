# Step 9: Extract BackButton Component

## Overview

Extract a shared BackButton navigation component from duplicated patterns in ProjectDashboardScreen and Sidebar.

## Test Requirements

### Test File
`tests/webview-ui/shared/components/navigation/BackButton.test.tsx`

### Test Cases

```typescript
describe('BackButton', () => {
  describe('rendering', () => {
    it('renders with default label "Back"', () => {
      render(<BackButton onPress={mockOnPress} />);
      expect(screen.getByRole('button')).toHaveTextContent('Back');
    });

    it('renders with custom label', () => {
      render(<BackButton label="All Projects" onPress={mockOnPress} />);
      expect(screen.getByRole('button')).toHaveTextContent('All Projects');
    });

    it('renders chevron left icon', () => {
      render(<BackButton onPress={mockOnPress} />);
      // Icon should be present (test via aria or structure)
      expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('calls onPress when clicked', async () => {
      const user = userEvent.setup();
      render(<BackButton onPress={mockOnPress} />);

      await user.click(screen.getByRole('button'));

      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('is keyboard accessible', async () => {
      const user = userEvent.setup();
      render(<BackButton onPress={mockOnPress} />);

      await user.tab();
      await user.keyboard('{Enter}');

      expect(mockOnPress).toHaveBeenCalled();
    });
  });

  describe('styling', () => {
    it('uses quiet variant by default', () => {
      render(<BackButton onPress={mockOnPress} />);
      // ActionButton quiet variant
      const button = screen.getByRole('button');
      expect(button).toHaveClass('spectrum-ActionButton--quiet');
    });
  });
});
```

## Implementation

### File to Create
`src/core/ui/components/navigation/BackButton.tsx`

### Implementation

```typescript
import React from 'react';
import { ActionButton, Text } from '@adobe/react-spectrum';
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft';

export interface BackButtonProps {
  /** Button label (default: "Back") */
  label?: string;
  /** Click handler */
  onPress: () => void;
}

/**
 * Back navigation button with chevron icon.
 *
 * @example
 * <BackButton label="All Projects" onPress={handleBack} />
 */
export function BackButton({ label = 'Back', onPress }: BackButtonProps): React.ReactElement {
  return (
    <ActionButton isQuiet onPress={onPress}>
      <ChevronLeft size="S" />
      <Text>{label}</Text>
    </ActionButton>
  );
}
```

### Update Index Export
`src/core/ui/components/navigation/index.ts`

```typescript
export { BackButton } from './BackButton';
export type { BackButtonProps } from './BackButton';
```

## Files to Update (Adoption)

### ProjectDashboardScreen.tsx

**Before:**
```tsx
<ActionButton isQuiet onPress={handleNavigateBack}>
  <ChevronLeft size="S" />
  <Text>All Projects</Text>
</ActionButton>
```

**After:**
```tsx
import { BackButton } from '@/core/ui/components/navigation';

<BackButton label="All Projects" onPress={handleNavigateBack} />
```

### Sidebar.tsx

**Before:**
```tsx
<ActionButton isQuiet onPress={onBack}>
  <ChevronLeft size="S" />
  <Text>{backLabel}</Text>
</ActionButton>
```

**After:**
```tsx
import { BackButton } from '@/core/ui/components/navigation';

<BackButton label={backLabel} onPress={onBack} />
```

## Verification

```bash
# Run component tests
npm run test:fast -- tests/webview-ui/shared/components/navigation/BackButton.test.tsx

# Run affected file tests
npm run test:fast -- tests/features/dashboard/ui/ProjectDashboardScreen.test.tsx
npm run test:fast -- tests/features/sidebar/ui/Sidebar.test.tsx

# Verify build
npm run compile
```

## Acceptance Criteria

- [x] BackButton component created with tests (14 tests)
- [x] Default label is "Back"
- [x] Custom label prop works
- [x] Chevron icon renders correctly
- [ ] ProjectDashboardScreen updated to use BackButton (deferred to Step 8)
- [ ] Sidebar updated to use BackButton (deferred to Step 8)
- [x] All tests pass
- [x] No visual regression

## Completion Notes

**Completed:** 2025-12-02
**Tests:** 14 passing (100% coverage)
**Files:** BackButton.tsx (32 lines), BackButton.test.tsx (270 lines)
**Note:** Adoption in ProjectDashboardScreen and Sidebar deferred to Step 8 (the redesign step)

## Notes

- This is a simple extraction - the pattern is already identical in both files
- Keep ActionButton isQuiet as the default (matches existing behavior)
- ChevronLeft icon is already used in both locations
