# Step 2: Create Primitive Replacements

## Purpose

Create React Aria-compatible primitive components (Text, Heading, Flex, View, Divider) as styled HTML elements with CSS Modules. These primitives do not require React Aria library functionality - they are simple semantic HTML elements with styling that matches the Spectrum API surface.

**Why this step?**
- Text (33 uses), Flex (34 uses), Heading (7 uses), View (~20 uses), Divider (6 uses) are high-frequency primitives
- These components have no accessibility requirements beyond semantic HTML
- CSS Modules provide zero `!important` declarations via `@layer` cascade
- Creates foundation for migrating higher-complexity components in later steps

## Prerequisites

- [x] Step 1 complete: React Aria installed and directory structure created
- [ ] `src/core/ui/components/aria/primitives/` directory exists
- [ ] Build passes (`npm run build`)
- [ ] Existing tests pass (`npm test`)

## Tests to Write First (RED Phase)

### Test File: `tests/core/ui/components/aria/primitives/Text.test.tsx`

- [ ] Test: Text renders children correctly
  - **Given:** A Text component with "Hello World" children
  - **When:** Component is rendered
  - **Then:** Text content "Hello World" is visible in the document

- [ ] Test: Text renders as span by default
  - **Given:** A Text component
  - **When:** Component is rendered
  - **Then:** The HTML element is a `<span>`

- [ ] Test: Text applies CSS Module classes
  - **Given:** A Text component
  - **When:** Component is rendered
  - **Then:** The element has a scoped class name (contains underscore/hash pattern)

- [ ] Test: Text passes className prop to element
  - **Given:** A Text component with className="my-class"
  - **When:** Component is rendered
  - **Then:** The element has both module class and "my-class"

- [ ] Test: Text supports UNSAFE_className for Spectrum compatibility
  - **Given:** A Text component with UNSAFE_className="spectrum-compat"
  - **When:** Component is rendered
  - **Then:** The element has "spectrum-compat" class applied

### Test File: `tests/core/ui/components/aria/primitives/Heading.test.tsx`

- [ ] Test: Heading renders with correct level
  - **Given:** A Heading component with level={2} and children "Title"
  - **When:** Component is rendered
  - **Then:** The HTML element is an `<h2>` containing "Title"

- [ ] Test: Heading defaults to h2 when level omitted
  - **Given:** A Heading component without level prop
  - **When:** Component is rendered
  - **Then:** The HTML element is an `<h2>`

- [ ] Test: Heading supports all levels 1-6
  - **Given:** Heading components with levels 1, 2, 3, 4, 5, 6
  - **When:** Each is rendered
  - **Then:** Each renders as h1, h2, h3, h4, h5, h6 respectively

- [ ] Test: Heading applies marginBottom from Spectrum-style prop
  - **Given:** A Heading with marginBottom="size-200"
  - **When:** Component is rendered
  - **Then:** The element has appropriate CSS class for margin

### Test File: `tests/core/ui/components/aria/primitives/Flex.test.tsx`

- [ ] Test: Flex renders as div
  - **Given:** A Flex component with children
  - **When:** Component is rendered
  - **Then:** The HTML element is a `<div>`

- [ ] Test: Flex applies flexbox styles by default
  - **Given:** A Flex component
  - **When:** Component is rendered
  - **Then:** The element has `display: flex` style applied

- [ ] Test: Flex supports direction prop
  - **Given:** A Flex component with direction="column"
  - **When:** Component is rendered
  - **Then:** The element has `flex-direction: column` style

- [ ] Test: Flex supports gap prop with Spectrum tokens
  - **Given:** A Flex component with gap="size-100"
  - **When:** Component is rendered
  - **Then:** The element has appropriate gap style (8px)

- [ ] Test: Flex supports alignItems prop
  - **Given:** A Flex component with alignItems="center"
  - **When:** Component is rendered
  - **Then:** The element has `align-items: center` style

- [ ] Test: Flex supports justifyContent prop
  - **Given:** A Flex component with justifyContent="space-between"
  - **When:** Component is rendered
  - **Then:** The element has `justify-content: space-between` style

- [ ] Test: Flex supports flex prop for flex-grow
  - **Given:** A Flex component with flex={1}
  - **When:** Component is rendered
  - **Then:** The element has `flex: 1` style

- [ ] Test: Flex supports marginTop/marginBottom props
  - **Given:** A Flex with marginTop="size-100"
  - **When:** Component is rendered
  - **Then:** The element has appropriate margin applied

### Test File: `tests/core/ui/components/aria/primitives/View.test.tsx`

- [ ] Test: View renders as div
  - **Given:** A View component with children
  - **When:** Component is rendered
  - **Then:** The HTML element is a `<div>`

- [ ] Test: View applies margin props
  - **Given:** A View with marginBottom="size-200"
  - **When:** Component is rendered
  - **Then:** The element has appropriate margin style

- [ ] Test: View supports UNSAFE_className for Spectrum compat
  - **Given:** A View with UNSAFE_className="prereq-message"
  - **When:** Component is rendered
  - **Then:** The element has "prereq-message" class applied

### Test File: `tests/core/ui/components/aria/primitives/Divider.test.tsx`

- [ ] Test: Divider renders as hr
  - **Given:** A Divider component
  - **When:** Component is rendered
  - **Then:** The HTML element is an `<hr>`

- [ ] Test: Divider applies size styling
  - **Given:** A Divider with size="S"
  - **When:** Component is rendered
  - **Then:** The element has appropriate height/border style

- [ ] Test: Divider supports marginBottom prop
  - **Given:** A Divider with marginBottom="size-200"
  - **When:** Component is rendered
  - **Then:** The element has appropriate margin style

- [ ] Test: Divider has correct accessibility role
  - **Given:** A Divider component
  - **When:** Component is rendered
  - **Then:** The element has role="separator" (native hr behavior)

### Test File: `tests/core/ui/components/aria/primitives/index.test.ts`

- [ ] Test: All primitives are exported from barrel
  - **Given:** The primitives barrel export
  - **When:** Importing { Text, Heading, Flex, View, Divider }
  - **Then:** All components are defined and are functions

## Files to Create/Modify

### New Files

- [ ] `src/core/ui/components/aria/primitives/Text.tsx` - Text primitive component
- [ ] `src/core/ui/components/aria/primitives/Text.module.css` - Text styles
- [ ] `src/core/ui/components/aria/primitives/Heading.tsx` - Heading primitive component
- [ ] `src/core/ui/components/aria/primitives/Heading.module.css` - Heading styles
- [ ] `src/core/ui/components/aria/primitives/Flex.tsx` - Flex primitive component
- [ ] `src/core/ui/components/aria/primitives/Flex.module.css` - Flex styles
- [ ] `src/core/ui/components/aria/primitives/View.tsx` - View primitive component
- [ ] `src/core/ui/components/aria/primitives/View.module.css` - View styles
- [ ] `src/core/ui/components/aria/primitives/Divider.tsx` - Divider primitive component
- [ ] `src/core/ui/components/aria/primitives/Divider.module.css` - Divider styles
- [ ] `tests/core/ui/components/aria/primitives/Text.test.tsx` - Text tests
- [ ] `tests/core/ui/components/aria/primitives/Heading.test.tsx` - Heading tests
- [ ] `tests/core/ui/components/aria/primitives/Flex.test.tsx` - Flex tests
- [ ] `tests/core/ui/components/aria/primitives/View.test.tsx` - View tests
- [ ] `tests/core/ui/components/aria/primitives/Divider.test.tsx` - Divider tests
- [ ] `tests/core/ui/components/aria/primitives/index.test.ts` - Barrel export tests

### Modified Files

- [ ] `src/core/ui/components/aria/primitives/index.ts` - Export all primitive components

## Implementation Details

### Sub-step 2.1: Create Spectrum Token Map

Create a shared utility for converting Spectrum size tokens to CSS values:

```typescript
// src/core/ui/components/aria/primitives/spectrumTokens.ts

/**
 * Map Spectrum size tokens to CSS values
 * Based on Spectrum design system spacing scale
 */
export const sizeTokens: Record<string, string> = {
    'size-0': '0',
    'size-25': '2px',
    'size-40': '3px',
    'size-50': '4px',
    'size-65': '5px',
    'size-75': '6px',
    'size-85': '7px',
    'size-100': '8px',
    'size-115': '9px',
    'size-125': '10px',
    'size-130': '11px',
    'size-150': '12px',
    'size-160': '13px',
    'size-175': '14px',
    'size-200': '16px',
    'size-225': '18px',
    'size-250': '20px',
    'size-275': '22px',
    'size-300': '24px',
    'size-350': '28px',
    'size-400': '32px',
    'size-450': '36px',
    'size-500': '40px',
    'size-550': '44px',
    'size-600': '48px',
    'size-675': '54px',
    'size-700': '56px',
    'size-800': '64px',
    'size-900': '72px',
    'size-1000': '80px',
    'size-1200': '96px',
    'size-1250': '100px',
    'size-1600': '128px',
    'size-1700': '136px',
    'size-2000': '160px',
    'size-2400': '192px',
    'size-3000': '240px',
    'size-3400': '272px',
    'size-3600': '288px',
    'size-4600': '368px',
    'size-5000': '400px',
    'size-6000': '480px',
};

/**
 * Convert a Spectrum size token to CSS value
 * Falls back to the value itself if not a recognized token
 */
export function resolveSize(size: string | number | undefined): string | undefined {
    if (size === undefined) return undefined;
    if (typeof size === 'number') return `${size}px`;
    return sizeTokens[size] || size;
}
```

### Sub-step 2.2: Implement Text Component

```typescript
// src/core/ui/components/aria/primitives/Text.tsx
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import styles from './Text.module.css';

export interface TextProps {
    children?: React.ReactNode;
    className?: string;
    /** Spectrum compatibility shim */
    UNSAFE_className?: string;
}

/**
 * Text - Inline text primitive
 * Replaces @adobe/react-spectrum Text component
 */
export const Text = React.forwardRef<HTMLSpanElement, TextProps>(
    ({ children, className, UNSAFE_className }, ref) => {
        return (
            <span
                ref={ref}
                className={cn(styles.text, className, UNSAFE_className)}
            >
                {children}
            </span>
        );
    }
);

Text.displayName = 'Text';
```

```css
/* src/core/ui/components/aria/primitives/Text.module.css */
.text {
    /* Base text styles - inherits from parent */
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    line-height: inherit;
}
```

### Sub-step 2.3: Implement Heading Component

```typescript
// src/core/ui/components/aria/primitives/Heading.tsx
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { resolveSize } from './spectrumTokens';
import styles from './Heading.module.css';

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingProps {
    children?: React.ReactNode;
    level?: HeadingLevel;
    className?: string;
    UNSAFE_className?: string;
    marginBottom?: string;
}

/**
 * Heading - Semantic heading primitive
 * Replaces @adobe/react-spectrum Heading component
 */
export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
    ({ children, level = 2, className, UNSAFE_className, marginBottom }, ref) => {
        const Tag = `h${level}` as const;
        const style = marginBottom ? { marginBottom: resolveSize(marginBottom) } : undefined;

        return (
            <Tag
                ref={ref}
                className={cn(styles.heading, styles[`level${level}`], className, UNSAFE_className)}
                style={style}
            >
                {children}
            </Tag>
        );
    }
);

Heading.displayName = 'Heading';
```

```css
/* src/core/ui/components/aria/primitives/Heading.module.css */
.heading {
    font-family: inherit;
    color: inherit;
    margin: 0;
}

.level1 { font-size: 2rem; font-weight: 700; }
.level2 { font-size: 1.5rem; font-weight: 600; }
.level3 { font-size: 1.25rem; font-weight: 600; }
.level4 { font-size: 1rem; font-weight: 600; }
.level5 { font-size: 0.875rem; font-weight: 600; }
.level6 { font-size: 0.75rem; font-weight: 600; }
```

### Sub-step 2.4: Implement Flex Component

```typescript
// src/core/ui/components/aria/primitives/Flex.tsx
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { resolveSize } from './spectrumTokens';
import styles from './Flex.module.css';

export interface FlexProps {
    children?: React.ReactNode;
    direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    gap?: string | number;
    alignItems?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
    justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
    wrap?: boolean | 'wrap' | 'nowrap' | 'wrap-reverse';
    flex?: number | string;
    marginTop?: string;
    marginBottom?: string;
    className?: string;
    UNSAFE_className?: string;
}

/**
 * Flex - Flexbox container primitive
 * Replaces @adobe/react-spectrum Flex component
 */
export const Flex = React.forwardRef<HTMLDivElement, FlexProps>(
    ({
        children,
        direction = 'row',
        gap,
        alignItems,
        justifyContent,
        wrap,
        flex,
        marginTop,
        marginBottom,
        className,
        UNSAFE_className,
    }, ref) => {
        const style: React.CSSProperties = {};

        if (direction !== 'row') style.flexDirection = direction;
        if (gap) style.gap = resolveSize(gap);
        if (alignItems) style.alignItems = alignItems;
        if (justifyContent) style.justifyContent = justifyContent;
        if (wrap === true) style.flexWrap = 'wrap';
        else if (typeof wrap === 'string') style.flexWrap = wrap;
        if (flex !== undefined) style.flex = flex;
        if (marginTop) style.marginTop = resolveSize(marginTop);
        if (marginBottom) style.marginBottom = resolveSize(marginBottom);

        return (
            <div
                ref={ref}
                className={cn(styles.flex, className, UNSAFE_className)}
                style={style}
            >
                {children}
            </div>
        );
    }
);

Flex.displayName = 'Flex';
```

```css
/* src/core/ui/components/aria/primitives/Flex.module.css */
.flex {
    display: flex;
}
```

### Sub-step 2.5: Implement View Component

```typescript
// src/core/ui/components/aria/primitives/View.tsx
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { resolveSize } from './spectrumTokens';
import styles from './View.module.css';

export interface ViewProps {
    children?: React.ReactNode;
    marginTop?: string;
    marginBottom?: string;
    marginStart?: string;
    marginEnd?: string;
    padding?: string;
    className?: string;
    UNSAFE_className?: string;
}

/**
 * View - Generic container primitive
 * Replaces @adobe/react-spectrum View component
 */
export const View = React.forwardRef<HTMLDivElement, ViewProps>(
    ({
        children,
        marginTop,
        marginBottom,
        marginStart,
        marginEnd,
        padding,
        className,
        UNSAFE_className,
    }, ref) => {
        const style: React.CSSProperties = {};

        if (marginTop) style.marginTop = resolveSize(marginTop);
        if (marginBottom) style.marginBottom = resolveSize(marginBottom);
        if (marginStart) style.marginInlineStart = resolveSize(marginStart);
        if (marginEnd) style.marginInlineEnd = resolveSize(marginEnd);
        if (padding) style.padding = resolveSize(padding);

        return (
            <div
                ref={ref}
                className={cn(styles.view, className, UNSAFE_className)}
                style={Object.keys(style).length > 0 ? style : undefined}
            >
                {children}
            </div>
        );
    }
);

View.displayName = 'View';
```

```css
/* src/core/ui/components/aria/primitives/View.module.css */
.view {
    /* Generic block container - no default styles */
    display: block;
}
```

### Sub-step 2.6: Implement Divider Component

```typescript
// src/core/ui/components/aria/primitives/Divider.tsx
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { resolveSize } from './spectrumTokens';
import styles from './Divider.module.css';

export interface DividerProps {
    size?: 'S' | 'M' | 'L';
    orientation?: 'horizontal' | 'vertical';
    marginTop?: string;
    marginBottom?: string;
    className?: string;
    UNSAFE_className?: string;
}

/**
 * Divider - Visual separator primitive
 * Replaces @adobe/react-spectrum Divider component
 */
export const Divider = React.forwardRef<HTMLHRElement, DividerProps>(
    ({
        size = 'M',
        orientation = 'horizontal',
        marginTop,
        marginBottom,
        className,
        UNSAFE_className,
    }, ref) => {
        const style: React.CSSProperties = {};

        if (marginTop) style.marginTop = resolveSize(marginTop);
        if (marginBottom) style.marginBottom = resolveSize(marginBottom);

        return (
            <hr
                ref={ref}
                className={cn(
                    styles.divider,
                    styles[`size${size}`],
                    orientation === 'vertical' && styles.vertical,
                    className,
                    UNSAFE_className
                )}
                style={Object.keys(style).length > 0 ? style : undefined}
            />
        );
    }
);

Divider.displayName = 'Divider';
```

```css
/* src/core/ui/components/aria/primitives/Divider.module.css */
.divider {
    border: none;
    background-color: var(--spectrum-global-color-gray-300, #d3d3d3);
    margin: 0;
}

/* Horizontal (default) */
.divider:not(.vertical) {
    width: 100%;
}

.sizeS:not(.vertical) { height: 1px; }
.sizeM:not(.vertical) { height: 2px; }
.sizeL:not(.vertical) { height: 4px; }

/* Vertical */
.vertical {
    height: 100%;
}

.sizeS.vertical { width: 1px; }
.sizeM.vertical { width: 2px; }
.sizeL.vertical { width: 4px; }
```

### Sub-step 2.7: Update Barrel Export

```typescript
// src/core/ui/components/aria/primitives/index.ts
/**
 * Primitive Components
 *
 * Basic building blocks: Text, Heading, Flex, View, Divider
 * CSS Modules for styling - zero !important declarations.
 */

export { Text } from './Text';
export type { TextProps } from './Text';

export { Heading } from './Heading';
export type { HeadingProps } from './Heading';

export { Flex } from './Flex';
export type { FlexProps } from './Flex';

export { View } from './View';
export type { ViewProps } from './View';

export { Divider } from './Divider';
export type { DividerProps } from './Divider';

// Internal utilities - not exported
// spectrumTokens.ts is internal to primitives
```

## Expected Outcome

After this step:

- Five primitive components available: Text, Heading, Flex, View, Divider
- All use CSS Modules (zero `!important` declarations)
- API surface matches Spectrum for common props (children, className, margin props)
- UNSAFE_className compatibility shim supports gradual migration
- Spectrum size tokens (size-100, size-200, etc.) work correctly
- All tests passing with proper isolation

## Acceptance Criteria

- [x] All tests passing for Text, Heading, Flex, View, Divider (97 tests)
- [x] CSS Modules generate scoped class names (verified via test)
- [x] No `!important` declarations in any CSS Module files (0 !important)
- [x] Components match Spectrum API for common props
- [x] UNSAFE_className prop works (Spectrum compatibility)
- [x] Spectrum size tokens resolve correctly
- [x] forwardRef implemented for all components
- [x] displayName set for React DevTools
- [x] Build passes (`npm run build`)
- [x] Coverage >= 80% for new components (89.31% statements, 91.22% lines)

## Dependencies from Other Steps

- **Step 1**: Directory structure must exist at `src/core/ui/components/aria/primitives/`
- **Step 1**: react-aria-components installed (not used directly in this step but establishes pattern)

## Estimated Complexity

**Medium** - Straightforward component implementation but requires careful API matching with Spectrum.

**Time Estimate:** 4-6 hours

---

## Rollback Instructions

If this step needs to be reverted:

1. **Delete primitive components:** `rm -rf src/core/ui/components/aria/primitives/*.tsx src/core/ui/components/aria/primitives/*.css`
2. **Restore empty barrel:** Reset `src/core/ui/components/aria/primitives/index.ts` to empty stub
3. **Delete tests:** `rm -rf tests/core/ui/components/aria/primitives/`
4. **Verify:** `npm run build && npm test`

**Rollback Impact:** Low - no consumers yet (Steps 6-8 use these components).

---

## Notes for TDD Sub-Agent

### API Surface Reference

Based on codebase analysis, these are the most commonly used props:

**Text**: children, UNSAFE_className
**Heading**: children, level, marginBottom
**Flex**: direction, gap, alignItems, justifyContent, flex, marginTop, marginBottom, UNSAFE_className
**View**: marginBottom, UNSAFE_className
**Divider**: size, marginBottom

### Testing Strategy

- Use `@testing-library/react` for component tests
- CSS Module class verification via `className` inspection
- Style verification via computed styles or inline style object
- Test ref forwarding for all components

### CSS Module Verification

CSS Modules generate class names like `Text_text__abc123`. Tests should verify:
1. Class exists on element
2. Class contains underscore (indicating module scoping)

### Spectrum Token Testing

For props like `gap="size-100"`, verify the component either:
1. Applies inline style `gap: 8px`
2. Or applies a CSS class that sets the correct value

The inline style approach is simpler and more testable.
