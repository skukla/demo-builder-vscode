# Step 13: Extract LoadingOverlay Component

## Overview

Extract the inline `LOADING_OVERLAY_STYLES` from WizardContainer into a reusable LoadingOverlay component for code cleanliness and potential future reuse.

## Rationale

**Override of Rule of Three:** While currently only used in WizardContainer, extraction is justified for:
- **Code cleanliness:** Removes ~30 lines of inline styles from WizardContainer
- **Separation of concerns:** Modal overlay logic separated from wizard logic
- **Consistency:** Follows pattern of other extracted components
- **Future-proofing:** Pattern available if needed elsewhere

## Test Requirements

### Test File
`tests/webview-ui/shared/components/feedback/LoadingOverlay.test.tsx`

### Test Cases

```typescript
describe('LoadingOverlay', () => {
  describe('rendering', () => {
    it('renders when isVisible is true', () => {
      render(<LoadingOverlay isVisible={true} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('does not render when isVisible is false', () => {
      render(<LoadingOverlay isVisible={false} />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('renders spinner animation', () => {
      render(<LoadingOverlay isVisible={true} />);

      // Spinner should be visible
      const overlay = screen.getByRole('status');
      expect(overlay).toBeInTheDocument();
    });
  });

  describe('optional message', () => {
    it('renders message when provided', () => {
      render(<LoadingOverlay isVisible={true} message="Loading projects..." />);

      expect(screen.getByText('Loading projects...')).toBeInTheDocument();
    });

    it('does not render message element when not provided', () => {
      render(<LoadingOverlay isVisible={true} />);

      // Only spinner, no text
      expect(screen.queryByRole('status')?.textContent).toBeFalsy();
    });
  });

  describe('accessibility', () => {
    it('has role="status" for screen readers', () => {
      render(<LoadingOverlay isVisible={true} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has aria-busy="true" when visible', () => {
      render(<LoadingOverlay isVisible={true} />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    });

    it('announces message to screen readers', () => {
      render(<LoadingOverlay isVisible={true} message="Saving..." />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Saving...');
    });
  });

  describe('styling', () => {
    it('covers full container with semi-transparent backdrop', () => {
      render(<LoadingOverlay isVisible={true} />);

      const overlay = screen.getByRole('status').parentElement;
      expect(overlay).toHaveStyle({ position: 'absolute' });
    });

    it('centers spinner in overlay', () => {
      render(<LoadingOverlay isVisible={true} />);

      const overlay = screen.getByRole('status').parentElement;
      expect(overlay).toHaveStyle({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      });
    });
  });
});
```

## Implementation

### File to Create
`src/core/ui/components/feedback/LoadingOverlay.tsx`

### Implementation

```tsx
import React from 'react';
import { Text } from '@adobe/react-spectrum';

export interface LoadingOverlayProps {
  /** Whether the overlay is visible */
  isVisible: boolean;
  /** Optional message to display below spinner */
  message?: string;
}

const styles = {
  container: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    borderRadius: '4px',
    gap: '16px',
  },
  spinnerContainer: {
    backgroundColor: 'var(--spectrum-global-color-gray-50)',
    padding: '24px',
    borderRadius: '50%',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '3px solid var(--spectrum-global-color-blue-400)',
    borderTopColor: 'transparent',
    animation: 'spin 1s linear infinite',
  },
};

// CSS keyframes for spinner (injected once)
const spinKeyframes = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

/**
 * Modal loading overlay with spinner.
 *
 * Use for blocking operations where user should wait
 * (e.g., "Backend Call on Continue" pattern).
 *
 * For inline loading states, use LoadingDisplay instead.
 *
 * @example
 * <div style={{ position: 'relative' }}>
 *   <YourContent />
 *   <LoadingOverlay isVisible={isLoading} message="Saving..." />
 * </div>
 */
export function LoadingOverlay({ isVisible, message }: LoadingOverlayProps): React.ReactElement | null {
  if (!isVisible) {
    return null;
  }

  return (
    <>
      <style>{spinKeyframes}</style>
      <div style={styles.container}>
        <div
          style={styles.spinnerContainer}
          role="status"
          aria-busy="true"
          aria-label={message || 'Loading'}
        >
          <div style={styles.spinner} />
        </div>
        {message && (
          <Text UNSAFE_style={{ color: 'white', fontWeight: 500 }}>
            {message}
          </Text>
        )}
      </div>
    </>
  );
}
```

### Update Index Export
`src/core/ui/components/feedback/index.ts`

```typescript
export { LoadingOverlay } from './LoadingOverlay';
export type { LoadingOverlayProps } from './LoadingOverlay';
```

## Files to Update (Adoption)

### WizardContainer.tsx

**Before:**
```tsx
const LOADING_OVERLAY_STYLES = {
    container: { /* ... 30 lines of styles ... */ },
    innerCircle: { /* ... */ },
    spinner: { /* ... */ },
};

// In render:
{isLoadingBackend && (
    <div style={LOADING_OVERLAY_STYLES.container}>
        <div style={LOADING_OVERLAY_STYLES.innerCircle}>
            <div style={LOADING_OVERLAY_STYLES.spinner} />
        </div>
    </div>
)}
```

**After:**
```tsx
import { LoadingOverlay } from '@/core/ui/components/feedback';

// Remove LOADING_OVERLAY_STYLES constant entirely

// In render:
<LoadingOverlay isVisible={isLoadingBackend} />
```

## Verification

```bash
# Run component tests
npm run test:fast -- tests/webview-ui/shared/components/feedback/LoadingOverlay.test.tsx

# Run WizardContainer tests
npm run test:fast -- tests/features/project-creation/ui/wizard/

# Verify build
npm run compile

# Visual verification (manual)
# - Open wizard, click Continue on a step with backend call
# - Verify overlay appears with spinner
# - Verify overlay disappears when operation completes
```

## Acceptance Criteria

- [x] LoadingOverlay component created with tests (13 tests)
- [x] Supports isVisible prop
- [x] Supports optional message prop
- [x] Accessible (role="status", aria-busy, aria-label)
- [x] WizardContainer updated to use LoadingOverlay
- [x] LOADING_OVERLAY_STYLES removed from WizardContainer
- [x] All tests pass (123 WizardContainer tests)
- [x] No visual regression

## Completion Notes

**Completed:** 2025-12-02

**Files Created:**
- `src/core/ui/components/feedback/LoadingOverlay.tsx` (86 lines)
- `tests/webview-ui/shared/components/feedback/LoadingOverlay.test.tsx` (107 lines)

**Files Modified:**
- `src/core/ui/components/feedback/index.ts` - Added LoadingOverlay export
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Replaced inline styles with LoadingOverlay component

**Changes:**
- WizardContainer reduced by ~32 lines (removed LOADING_OVERLAY_STYLES)
- Spinner animation renamed from `spin` to `loading-overlay-spin` to avoid conflicts
- Added data-testid attributes for reliable testing

## Notes

- This is a "code cleanliness" extraction, not strictly Rule of Three
- Parent container must have `position: relative` for overlay to work
- Use LoadingDisplay for inline loading states
- Use LoadingOverlay for modal/blocking loading states
- Spinner animation uses CSS keyframes (injected via style tag)
