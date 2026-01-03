# Step 3: Create Interactive Components

## Purpose

Create React Aria-compatible interactive components (Button, ActionButton, ProgressCircle) with full accessibility support and CSS Modules styling. These components handle user interactions with proper focus management, keyboard navigation, and ARIA attributes.

**Why this step?**
- Button (10 uses) and ActionButton (5 uses) are the primary interactive components
- ProgressCircle (7 uses) provides loading state feedback
- React Aria Button provides accessible focus management, keyboard support, and press states
- ProgressCircle requires custom SVG implementation (React Aria has no equivalent)
- CSS Modules enable clean styling without `!important` declarations

## Prerequisites

- [x] Step 1 complete: React Aria installed, `src/core/ui/components/aria/interactive/` exists
- [x] Step 2 complete: Primitive components (Text, Flex) available for composition
- [ ] Build passes (`npm run build`)
- [ ] Existing tests pass (`npm test`)

## Tests to Write First (RED Phase)

### Test File: `tests/core/ui/components/aria/interactive/Button.test.tsx`

- [ ] Test: Button renders children correctly
  - **Given:** A Button component with "Click Me" children
  - **When:** Component is rendered
  - **Then:** Text content "Click Me" is visible in the document

- [ ] Test: Button handles onPress callback
  - **Given:** A Button with onPress handler
  - **When:** Button is clicked
  - **Then:** onPress callback is invoked

- [ ] Test: Button handles keyboard activation (Enter)
  - **Given:** A Button with onPress handler, focused via Tab
  - **When:** Enter key is pressed
  - **Then:** onPress callback is invoked

- [ ] Test: Button handles keyboard activation (Space)
  - **Given:** A Button with onPress handler, focused via Tab
  - **When:** Space key is pressed
  - **Then:** onPress callback is invoked

- [ ] Test: Button supports variant="accent" (primary action)
  - **Given:** A Button with variant="accent"
  - **When:** Component is rendered
  - **Then:** Element has accent variant CSS class applied

- [ ] Test: Button supports variant="secondary"
  - **Given:** A Button with variant="secondary"
  - **When:** Component is rendered
  - **Then:** Element has secondary variant CSS class applied

- [ ] Test: Button supports variant="cta"
  - **Given:** A Button with variant="cta"
  - **When:** Component is rendered
  - **Then:** Element has cta variant CSS class applied

- [ ] Test: Button supports isDisabled prop
  - **Given:** A Button with isDisabled={true}
  - **When:** Component is rendered
  - **Then:** Button has disabled attribute and aria-disabled="true"

- [ ] Test: Button with isDisabled does not fire onPress
  - **Given:** A Button with isDisabled={true} and onPress handler
  - **When:** Button is clicked
  - **Then:** onPress callback is NOT invoked

- [ ] Test: Button supports isQuiet variant
  - **Given:** A Button with isQuiet={true}
  - **When:** Component is rendered
  - **Then:** Element has quiet variant CSS class

- [ ] Test: Button supports marginTop/marginBottom props
  - **Given:** A Button with marginTop="size-200"
  - **When:** Component is rendered
  - **Then:** Element has appropriate margin style

- [ ] Test: Button applies UNSAFE_className for Spectrum compatibility
  - **Given:** A Button with UNSAFE_className="custom-btn"
  - **When:** Component is rendered
  - **Then:** Element has "custom-btn" class applied

- [ ] Test: Button has correct accessibility attributes
  - **Given:** A Button component
  - **When:** Component is rendered
  - **Then:** Element has role="button" (native button element)

- [ ] Test: Button shows focus ring on focus
  - **Given:** A Button component
  - **When:** Button receives focus
  - **Then:** Focus styles are applied (verifiable via class or computed style)

### Test File: `tests/core/ui/components/aria/interactive/ActionButton.test.tsx`

- [ ] Test: ActionButton renders as quiet button by default
  - **Given:** An ActionButton component
  - **When:** Component is rendered
  - **Then:** Element has quiet styling class applied

- [ ] Test: ActionButton supports icon + text pattern
  - **Given:** An ActionButton with icon and text children
  - **When:** Component is rendered
  - **Then:** Both icon and text are visible

- [ ] Test: ActionButton supports icon-only with aria-label
  - **Given:** An ActionButton with only icon child and aria-label="Settings"
  - **When:** Component is rendered
  - **Then:** Button has accessible name "Settings"

- [ ] Test: ActionButton handles onPress callback
  - **Given:** An ActionButton with onPress handler
  - **When:** Button is clicked
  - **Then:** onPress callback is invoked

- [ ] Test: ActionButton supports isDisabled prop
  - **Given:** An ActionButton with isDisabled={true}
  - **When:** Component is rendered
  - **Then:** Button has disabled attribute

- [ ] Test: ActionButton uses React Aria Button for accessibility
  - **Given:** An ActionButton component
  - **When:** Rendered and focused
  - **Then:** Proper focus management and keyboard handling work

### Test File: `tests/core/ui/components/aria/interactive/ProgressCircle.test.tsx`

- [ ] Test: ProgressCircle renders SVG element
  - **Given:** A ProgressCircle component
  - **When:** Component is rendered
  - **Then:** An SVG element is in the document

- [ ] Test: ProgressCircle has correct accessibility role
  - **Given:** A ProgressCircle with aria-label="Loading"
  - **When:** Component is rendered
  - **Then:** Element has role="progressbar" and accessible name "Loading"

- [ ] Test: ProgressCircle supports size="S"
  - **Given:** A ProgressCircle with size="S"
  - **When:** Component is rendered
  - **Then:** SVG dimensions match small size (16x16)

- [ ] Test: ProgressCircle supports size="M"
  - **Given:** A ProgressCircle with size="M"
  - **When:** Component is rendered
  - **Then:** SVG dimensions match medium size (32x32)

- [ ] Test: ProgressCircle supports size="L"
  - **Given:** A ProgressCircle with size="L"
  - **When:** Component is rendered
  - **Then:** SVG dimensions match large size (64x64)

- [ ] Test: ProgressCircle isIndeterminate shows animation
  - **Given:** A ProgressCircle with isIndeterminate={true}
  - **When:** Component is rendered
  - **Then:** Element has animation class applied

- [ ] Test: ProgressCircle determinate shows progress
  - **Given:** A ProgressCircle with value={50} (not indeterminate)
  - **When:** Component is rendered
  - **Then:** aria-valuenow="50" is set on element

- [ ] Test: ProgressCircle supports UNSAFE_className
  - **Given:** A ProgressCircle with UNSAFE_className="custom-spinner"
  - **When:** Component is rendered
  - **Then:** Element has "custom-spinner" class applied

### Test File: `tests/core/ui/components/aria/interactive/index.test.ts`

- [ ] Test: All interactive components are exported from barrel
  - **Given:** The interactive barrel export
  - **When:** Importing { Button, ActionButton, ProgressCircle }
  - **Then:** All components are defined and are functions

## Files to Create/Modify

### New Files

- [ ] `src/core/ui/components/aria/interactive/Button.tsx` - Button component using React Aria
- [ ] `src/core/ui/components/aria/interactive/Button.module.css` - Button styles
- [ ] `src/core/ui/components/aria/interactive/ActionButton.tsx` - ActionButton variant
- [ ] `src/core/ui/components/aria/interactive/ActionButton.module.css` - ActionButton styles
- [ ] `src/core/ui/components/aria/interactive/ProgressCircle.tsx` - Custom SVG spinner
- [ ] `src/core/ui/components/aria/interactive/ProgressCircle.module.css` - ProgressCircle styles with animation
- [ ] `tests/core/ui/components/aria/interactive/Button.test.tsx` - Button tests
- [ ] `tests/core/ui/components/aria/interactive/ActionButton.test.tsx` - ActionButton tests
- [ ] `tests/core/ui/components/aria/interactive/ProgressCircle.test.tsx` - ProgressCircle tests
- [ ] `tests/core/ui/components/aria/interactive/index.test.ts` - Barrel export tests

### Modified Files

- [ ] `src/core/ui/components/aria/interactive/index.ts` - Export all interactive components

## Implementation Details

### Sub-step 3.1: Implement Button Component

React Aria's Button provides accessibility out-of-the-box: focus management, keyboard activation (Enter/Space), and press states.

```typescript
// src/core/ui/components/aria/interactive/Button.tsx
import { Button as AriaButton } from 'react-aria-components';
import type { ButtonProps as AriaButtonProps } from 'react-aria-components';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { resolveSize } from '../primitives/spectrumTokens';
import styles from './Button.module.css';

export type ButtonVariant = 'accent' | 'secondary' | 'cta' | 'negative';

export interface ButtonProps {
    children?: React.ReactNode;
    /** Visual variant */
    variant?: ButtonVariant;
    /** Quiet/borderless style */
    isQuiet?: boolean;
    /** Disabled state */
    isDisabled?: boolean;
    /** Press handler (Spectrum-compatible naming) */
    onPress?: () => void;
    /** Spectrum size token for margin */
    marginTop?: string;
    marginBottom?: string;
    /** Additional CSS class */
    className?: string;
    /** Spectrum compatibility shim */
    UNSAFE_className?: string;
    /** Accessible label for icon-only buttons */
    'aria-label'?: string;
}

/**
 * Button - Interactive button using React Aria
 * Replaces @adobe/react-spectrum Button component
 *
 * Provides:
 * - Accessible focus management
 * - Keyboard activation (Enter/Space)
 * - Press state handling
 * - Disabled state
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({
        children,
        variant = 'secondary',
        isQuiet = false,
        isDisabled = false,
        onPress,
        marginTop,
        marginBottom,
        className,
        UNSAFE_className,
        'aria-label': ariaLabel,
    }, ref) => {
        const style: React.CSSProperties = {};
        if (marginTop) style.marginTop = resolveSize(marginTop);
        if (marginBottom) style.marginBottom = resolveSize(marginBottom);

        return (
            <AriaButton
                ref={ref}
                className={cn(
                    styles.button,
                    styles[variant],
                    isQuiet && styles.quiet,
                    className,
                    UNSAFE_className
                )}
                isDisabled={isDisabled}
                onPress={onPress}
                style={Object.keys(style).length > 0 ? style : undefined}
                aria-label={ariaLabel}
            >
                {children}
            </AriaButton>
        );
    }
);

Button.displayName = 'Button';
```

```css
/* src/core/ui/components/aria/interactive/Button.module.css */

/* Base button styles */
.button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    border: 2px solid transparent;
    transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
    outline: none;
}

/* Focus visible ring */
.button:focus-visible {
    outline: 2px solid var(--spectrum-global-color-blue-500, #1473e6);
    outline-offset: 2px;
}

/* Disabled state */
.button[data-disabled] {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Pressed state */
.button[data-pressed] {
    transform: scale(0.98);
}

/* Variant: secondary (default) */
.secondary {
    background-color: var(--spectrum-global-color-gray-200, #e6e6e6);
    color: var(--spectrum-global-color-gray-800, #4b4b4b);
}

.secondary:hover:not([data-disabled]) {
    background-color: var(--spectrum-global-color-gray-300, #d3d3d3);
}

/* Variant: accent (primary) */
.accent {
    background-color: var(--spectrum-global-color-blue-500, #1473e6);
    color: white;
}

.accent:hover:not([data-disabled]) {
    background-color: var(--spectrum-global-color-blue-600, #0d66d0);
}

/* Variant: cta (call-to-action) */
.cta {
    background-color: var(--spectrum-global-color-blue-600, #0d66d0);
    color: white;
}

.cta:hover:not([data-disabled]) {
    background-color: var(--spectrum-global-color-blue-700, #095aba);
}

/* Variant: negative (destructive) */
.negative {
    background-color: var(--spectrum-global-color-red-500, #e34850);
    color: white;
}

.negative:hover:not([data-disabled]) {
    background-color: var(--spectrum-global-color-red-600, #d7373f);
}

/* Quiet style - borderless/transparent */
.quiet {
    background-color: transparent;
    padding: 4px 8px;
}

.quiet.secondary {
    color: var(--spectrum-global-color-gray-700, #6e6e6e);
}

.quiet.secondary:hover:not([data-disabled]) {
    background-color: var(--spectrum-global-color-gray-100, #f5f5f5);
}

.quiet.accent {
    color: var(--spectrum-global-color-blue-500, #1473e6);
}

.quiet.accent:hover:not([data-disabled]) {
    background-color: var(--spectrum-global-color-blue-100, #e5f2ff);
}
```

### Sub-step 3.2: Implement ActionButton Component

ActionButton is a variant of Button with quiet styling by default, commonly used for icon-only or icon+text toolbar actions.

```typescript
// src/core/ui/components/aria/interactive/ActionButton.tsx
import { Button as AriaButton } from 'react-aria-components';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import styles from './ActionButton.module.css';

export interface ActionButtonProps {
    children?: React.ReactNode;
    /** Quiet style (default: true for ActionButton) */
    isQuiet?: boolean;
    /** Disabled state */
    isDisabled?: boolean;
    /** Press handler */
    onPress?: () => void;
    /** Additional CSS class */
    className?: string;
    /** Spectrum compatibility shim */
    UNSAFE_className?: string;
    /** Required for icon-only buttons */
    'aria-label'?: string;
}

/**
 * ActionButton - Quiet action button for toolbars/icon actions
 * Replaces @adobe/react-spectrum ActionButton component
 *
 * Key differences from Button:
 * - isQuiet=true by default
 * - Optimized for icon-only or icon+text patterns
 * - Smaller padding for compact layouts
 */
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
    ({
        children,
        isQuiet = true,
        isDisabled = false,
        onPress,
        className,
        UNSAFE_className,
        'aria-label': ariaLabel,
    }, ref) => {
        return (
            <AriaButton
                ref={ref}
                className={cn(
                    styles.actionButton,
                    isQuiet && styles.quiet,
                    className,
                    UNSAFE_className
                )}
                isDisabled={isDisabled}
                onPress={onPress}
                aria-label={ariaLabel}
            >
                {children}
            </AriaButton>
        );
    }
);

ActionButton.displayName = 'ActionButton';
```

```css
/* src/core/ui/components/aria/interactive/ActionButton.module.css */

.actionButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    border: none;
    background-color: var(--spectrum-global-color-gray-200, #e6e6e6);
    color: var(--spectrum-global-color-gray-800, #4b4b4b);
    transition: background-color 0.15s ease, opacity 0.15s ease;
    outline: none;
}

/* Focus visible ring */
.actionButton:focus-visible {
    outline: 2px solid var(--spectrum-global-color-blue-500, #1473e6);
    outline-offset: 2px;
}

/* Hover state */
.actionButton:hover:not([data-disabled]) {
    background-color: var(--spectrum-global-color-gray-300, #d3d3d3);
}

/* Disabled state */
.actionButton[data-disabled] {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Pressed state */
.actionButton[data-pressed] {
    transform: scale(0.97);
}

/* Quiet style (default for ActionButton) */
.quiet {
    background-color: transparent;
    padding: 4px 6px;
}

.quiet:hover:not([data-disabled]) {
    background-color: var(--spectrum-global-color-gray-100, #f5f5f5);
}
```

### Sub-step 3.3: Implement ProgressCircle Component

Custom SVG implementation since React Aria doesn't provide a progress circle. Uses CSS animations for the indeterminate spinner.

```typescript
// src/core/ui/components/aria/interactive/ProgressCircle.tsx
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import styles from './ProgressCircle.module.css';

type ProgressCircleSize = 'S' | 'M' | 'L';

export interface ProgressCircleProps {
    /** Size of the progress circle */
    size?: ProgressCircleSize;
    /** Whether the progress is indeterminate (spinning) */
    isIndeterminate?: boolean;
    /** Progress value (0-100) for determinate mode */
    value?: number;
    /** Accessible label (required for accessibility) */
    'aria-label'?: string;
    /** Additional CSS class */
    className?: string;
    /** Spectrum compatibility shim */
    UNSAFE_className?: string;
}

/** Size configurations matching Spectrum */
const sizeConfig: Record<ProgressCircleSize, { diameter: number; strokeWidth: number }> = {
    S: { diameter: 16, strokeWidth: 2 },
    M: { diameter: 32, strokeWidth: 3 },
    L: { diameter: 64, strokeWidth: 4 },
};

/**
 * ProgressCircle - Loading spinner / progress indicator
 * Replaces @adobe/react-spectrum ProgressCircle component
 *
 * Custom SVG implementation with CSS animation.
 * React Aria doesn't provide this component.
 */
export const ProgressCircle = React.forwardRef<SVGSVGElement, ProgressCircleProps>(
    ({
        size = 'M',
        isIndeterminate = true,
        value = 0,
        'aria-label': ariaLabel = 'Loading',
        className,
        UNSAFE_className,
    }, ref) => {
        const { diameter, strokeWidth } = sizeConfig[size];
        const radius = (diameter - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const center = diameter / 2;

        // For determinate mode, calculate stroke offset
        const progress = Math.min(100, Math.max(0, value));
        const strokeDashoffset = circumference - (progress / 100) * circumference;

        return (
            <svg
                ref={ref}
                className={cn(
                    styles.progressCircle,
                    styles[`size${size}`],
                    isIndeterminate && styles.indeterminate,
                    className,
                    UNSAFE_className
                )}
                width={diameter}
                height={diameter}
                viewBox={`0 0 ${diameter} ${diameter}`}
                role="progressbar"
                aria-label={ariaLabel}
                aria-valuenow={isIndeterminate ? undefined : progress}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                {/* Background track */}
                <circle
                    className={styles.track}
                    cx={center}
                    cy={center}
                    r={radius}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {/* Progress arc */}
                <circle
                    className={styles.fill}
                    cx={center}
                    cy={center}
                    r={radius}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={isIndeterminate ? circumference * 0.75 : strokeDashoffset}
                    transform={`rotate(-90 ${center} ${center})`}
                />
            </svg>
        );
    }
);

ProgressCircle.displayName = 'ProgressCircle';
```

```css
/* src/core/ui/components/aria/interactive/ProgressCircle.module.css */

.progressCircle {
    display: inline-block;
}

/* Track (background circle) */
.track {
    stroke: var(--spectrum-global-color-gray-300, #d3d3d3);
}

/* Fill (progress arc) */
.fill {
    stroke: var(--spectrum-global-color-blue-500, #1473e6);
    transition: stroke-dashoffset 0.3s ease;
}

/* Indeterminate spinning animation */
.indeterminate {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

/* Size variants - used for class-based targeting if needed */
.sizeS {
    /* 16x16 */
}

.sizeM {
    /* 32x32 */
}

.sizeL {
    /* 64x64 */
}
```

### Sub-step 3.4: Update Barrel Export

```typescript
// src/core/ui/components/aria/interactive/index.ts
/**
 * Interactive Components
 *
 * User interaction primitives: Button, ActionButton, ProgressCircle
 * CSS Modules for styling - zero !important declarations.
 */

export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

export { ActionButton } from './ActionButton';
export type { ActionButtonProps } from './ActionButton';

export { ProgressCircle } from './ProgressCircle';
export type { ProgressCircleProps } from './ProgressCircle';
```

## Expected Outcome

After this step:

- Three interactive components available: Button, ActionButton, ProgressCircle
- All use CSS Modules (zero `!important` declarations)
- Button and ActionButton use React Aria for accessibility:
  - Proper focus management
  - Keyboard activation (Enter/Space)
  - Press states (data-pressed attribute)
  - Disabled states (data-disabled attribute)
- ProgressCircle provides accessible SVG spinner:
  - role="progressbar" with ARIA attributes
  - Indeterminate (spinning) and determinate modes
  - Size variants matching Spectrum (S/M/L)
- API surface matches Spectrum for common props (onPress, isDisabled, variant, size)
- UNSAFE_className compatibility shim supports gradual migration
- All tests passing with proper isolation

## Acceptance Criteria

- [x] All tests passing for Button, ActionButton, ProgressCircle (67 tests)
- [x] CSS Modules generate scoped class names (verified via test)
- [x] No `!important` declarations in any CSS Module files
- [x] Button handles keyboard activation (Enter/Space keys)
- [x] Button shows focus ring on keyboard focus
- [x] Button variants match Spectrum visual appearance
- [x] ActionButton is quiet by default (transparent background)
- [x] ProgressCircle has role="progressbar" with proper ARIA
- [x] ProgressCircle animates in indeterminate mode
- [x] ProgressCircle sizes match Spectrum (16/32/64px)
- [x] forwardRef implemented for all components
- [x] displayName set for React DevTools
- [x] Build passes (`npm run build`)
- [x] Coverage >= 80% for new components (88.97% statements, 90.9% lines)

## Dependencies from Other Steps

- **Step 1**: react-aria-components package installed
- **Step 1**: Directory structure at `src/core/ui/components/aria/interactive/` exists
- **Step 2**: `spectrumTokens.ts` and `cn()` utility available from primitives

## Estimated Complexity

**Medium** - Button and ActionButton are straightforward React Aria wrappers. ProgressCircle requires custom SVG implementation with CSS animations.

**Time Estimate:** 4-6 hours

---

## Rollback Instructions

If this step needs to be reverted:

1. **Delete interactive components:** `rm -rf src/core/ui/components/aria/interactive/*.tsx src/core/ui/components/aria/interactive/*.css`
2. **Restore empty barrel:** Reset `src/core/ui/components/aria/interactive/index.ts` to empty stub
3. **Delete tests:** `rm -rf tests/core/ui/components/aria/interactive/`
4. **Verify:** `npm run build && npm test`

**Rollback Impact:** Low - no consumers yet (Steps 6-8 use these components).

---

## Notes for TDD Sub-Agent

### React Aria Button Integration

React Aria's Button component provides:
- `onPress` handler (not onClick - fires on pointer and keyboard activation)
- `isDisabled` prop (sets data-disabled attribute)
- `data-pressed` attribute during press
- `data-focused` and `data-focus-visible` for focus states
- Automatic keyboard handling (Enter/Space activation)

### Testing React Aria Components

Use `@testing-library/react` with `userEvent` for interaction testing:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

test('Button handles keyboard activation', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Click</Button>);

    const button = screen.getByRole('button');
    await user.tab(); // Focus the button
    await user.keyboard('{Enter}'); // Press Enter

    expect(onPress).toHaveBeenCalledTimes(1);
});
```

### ProgressCircle SVG Math

The ProgressCircle uses standard SVG circle math:
- `circumference = 2 * PI * radius`
- `strokeDasharray = circumference` (full dash pattern)
- `strokeDashoffset = circumference - (progress/100) * circumference`
- Rotation transform starts arc from top: `rotate(-90 cx cy)`

### Spectrum Color Variables

Use Spectrum CSS custom properties for theme compatibility:
- `--spectrum-global-color-blue-500` - Primary blue
- `--spectrum-global-color-gray-200/300/800` - Neutral grays
- `--spectrum-global-color-red-500` - Destructive red

These should work with VS Code's theme integration.

### Common Spectrum Button Props to Support

Based on codebase analysis:
- `variant="accent"|"secondary"|"cta"` (common)
- `onPress` (all buttons)
- `isDisabled` (conditional)
- `isQuiet` (ActionButton pattern)
- `marginTop/marginBottom` (spacing)
- `UNSAFE_className` (migration compatibility)

### ActionButton Patterns in Codebase

Common patterns found:
1. Icon-only with aria-label: `<ActionButton aria-label="Settings"><SettingsIcon/></ActionButton>`
2. Icon + text: `<ActionButton><ChevronLeft/><Text>Back</Text></ActionButton>`
3. Toolbar actions: Multiple ActionButtons in a Flex container
