# Styling Guide for Demo Builder

## Overview

This guide documents the styling approach used in the Adobe Demo Builder VS Code Extension, particularly for React Spectrum components within webviews.

## CSS Architecture

### Why UNSAFE_className?

React Spectrum components don't provide a "safe" `className` prop by design - they want to maintain control over their design system. However, VS Code webviews require custom styling to match the editor's theme and provide proper visual integration.

The `UNSAFE_className` prop is the official way to apply custom CSS classes to React Spectrum components. The "unsafe" designation is meant to discourage overriding the design system, but it's necessary for our use case.

### File Structure

```
src/webviews/styles/
├── custom-spectrum.css    # All React Spectrum customizations
├── index.css              # Entry point that imports all styles
├── vscode-theme.css       # VS Code theme integration
└── wizard.css             # Wizard-specific styles
```

### Central CSS System

All custom styles are defined in `custom-spectrum.css` with clear sections:

```css
/* ===========================================
   Section Name
   =========================================== */
```

Major sections include:
- Layout utilities (flex, grid, spacing)
- Typography
- Colors and themes
- Component-specific styles
- State-based styles
- Utility classes

## Using the Class Name Utilities

### The cn() Function

Located in `src/webviews/utils/classNames.ts`, the `cn()` function helps compose CSS classes:

```typescript
import { cn } from '../utils/classNames';

// Basic usage
<View UNSAFE_className={cn('flex', 'p-4')}>

// Conditional classes
<View UNSAFE_className={cn(
  'base-class',
  isActive && 'active-class',
  isError ? 'error-class' : 'normal-class'
)}>
```

### Helper Functions

The utilities module provides specialized helpers:

```typescript
// For prerequisite items
const classes = getPrerequisiteItemClasses(status, isLast);

// For prerequisite messages  
const messageClasses = getPrerequisiteMessageClasses(status);

// For status badges
const badgeClasses = getStatusBadgeClasses(status);
```

## Common Patterns

### Layout Classes

```typescript
// Flexbox layouts
<Flex UNSAFE_className={cn('flex', 'flex-column', 'gap-4')}>

// Grid layouts
<View UNSAFE_className={cn('grid', 'grid-cols-3', 'grid-gap-4')}>

// Spacing
<View UNSAFE_className={cn('p-4', 'mt-2', 'mb-4')}>
```

### Component-Specific Classes

```typescript
// Prerequisite items
<View UNSAFE_className={cn('prerequisite-item', 'prerequisite-checking')}>

// Component cards
<View UNSAFE_className={cn('component-card', 'component-selected')}>

// Welcome screen
<View UNSAFE_className={cn('welcome-container', 'welcome-gradient')}>
```

### State-Based Styling

```typescript
// Dynamic states
<View UNSAFE_className={cn(
  'prerequisite-item',
  status === 'checking' && 'prerequisite-checking',
  status === 'error' && 'prerequisite-error',
  status === 'success' && 'prerequisite-success'
)}>
```

## Best Practices

### 1. Never Use Inline Styles

❌ **Don't:**
```typescript
<View UNSAFE_style={{ padding: '20px', display: 'flex' }}>
```

✅ **Do:**
```typescript
<View UNSAFE_className={cn('p-5', 'flex')}>
```

### 2. Create Reusable Classes

Instead of component-specific styles, create utility classes that can be reused:

```css
/* Reusable utility */
.text-muted {
  color: var(--spectrum-global-color-gray-600) !important;
}

/* Instead of component-specific */
.welcome-step-specific-text {
  color: var(--spectrum-global-color-gray-600) !important;
}
```

### 3. Use CSS Variables

Leverage Spectrum and VS Code CSS variables for consistency:

```css
.custom-element {
  background: var(--vscode-editor-background);
  color: var(--spectrum-global-color-gray-700);
  border: 1px solid var(--vscode-widget-border);
}
```

### 4. Important Flag Usage

Most custom styles need `!important` to override React Spectrum's inline styles:

```css
.custom-padding {
  padding: 20px !important; /* Required to override Spectrum */
}
```

### 5. Organize by Purpose

Group related classes together:

```css
/* ===========================================
   Prerequisite Styles
   =========================================== */
.prerequisite-container { }
.prerequisite-item { }
.prerequisite-message { }

/* ===========================================
   Component Card Styles
   =========================================== */
.component-card { }
.component-selected { }
.component-disabled { }
```

## Migration from UNSAFE_style

When migrating from inline styles to CSS classes:

1. **Identify the styles being used**
```typescript
// Before
UNSAFE_style={{ fontSize: '14px', fontWeight: 500 }}
```

2. **Create or find appropriate CSS class**
```css
.text-medium {
  font-size: 14px !important;
  font-weight: 500 !important;
}
```

3. **Replace with UNSAFE_className**
```typescript
// After
UNSAFE_className="text-medium"
```

4. **Use cn() for multiple classes**
```typescript
// Multiple classes
UNSAFE_className={cn('text-medium', 'text-muted')}
```

## Common Utility Classes

### Spacing
- `p-0` to `p-10`: Padding (0 to 40px)
- `m-0` to `m-10`: Margin
- `mt-`, `mb-`, `ml-`, `mr-`: Directional spacing
- `mx-`, `my-`: Axis spacing
- `gap-1` to `gap-10`: Gap for flex/grid containers

### Flexbox
- `flex`, `inline-flex`: Display types
- `flex-column`, `flex-row`: Direction
- `gap-1` to `gap-10`: Gap between items
- `items-center`, `items-start`, `items-end`: Alignment
- `justify-center`, `justify-between`, `justify-around`: Justification
- `flex-1`: Flex grow/shrink/basis shorthand

### Typography
- `text-xs` to `text-xl`: Font sizes
- `text-sm`: Small text (12px) - commonly used for sub-items
- `font-normal`, `font-medium`, `font-bold`: Font weights
- `text-muted`, `text-error`, `text-success`: Semantic colors
- `text-gray-500`, `text-gray-600`, `text-gray-700`: Gray scale colors
- `text-green-600`, `text-green-700`: Success colors
- `text-red-600`: Error colors
- `text-blue-600`: Info colors

### Layout
- `w-full`, `h-full`: Full width/height
- `min-w-0`, `max-w-full`: Width constraints
- `overflow-hidden`, `overflow-auto`: Overflow behavior
- `relative`, `absolute`: Positioning

### Prerequisites Specific
- `prerequisites-container`: Scrollable container for prerequisites list
- `prerequisite-item`: Individual prerequisite item
- `prerequisite-message`: Message display area
- `prerequisite-plugin-item`: Plugin sub-item styling
- `animate-fade-in`: Fade in animation for new content

### Animation Classes
- `animate-fade-in`: Smooth fade in with slight upward movement
- `animate-pulse`: Pulsing animation for active items
- `transition-all`: Smooth transitions for all properties

### Border Classes
- `border`: Default border
- `border-gray-400`: Gray border for light mode
- `border-radius`: Standard 4px border radius

## VS Code Theme Integration

The system automatically adapts to VS Code themes through CSS variables:

```css
/* Automatically adapts to light/dark themes */
.custom-container {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
}

/* Spectrum colors also adapt */
.custom-text {
  color: var(--spectrum-global-color-gray-700);
}
```

## Testing Styles

1. **Test in both light and dark themes**
2. **Verify in different VS Code color themes**
3. **Check responsive behavior at different panel sizes**
4. **Ensure accessibility with keyboard navigation**
5. **Validate in both development and production builds**

## Dark Mode Border Patterns

When creating borders for dark mode containers, use rgba values for better visibility:

```css
/* Good: Subtle border visible in dark mode */
.prerequisites-container {
    border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Avoid: Too bright in dark mode */
.container {
    border: 1px solid #e0e0e0;
}
```

## Scroll Container Patterns

For scrollable containers within the wizard, use these patterns:

```css
.scrollable-container {
    max-height: 360px;  /* Fixed height */
    overflow-y: auto;   /* Vertical scroll only */
    overflow-x: hidden; /* Prevent horizontal scroll */
    padding: 12px;
    
    /* Smooth scroll behavior */
    scroll-behavior: smooth;
    
    /* Custom scrollbar for better visibility */
    &::-webkit-scrollbar {
        width: 8px;
    }
    
    &::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
    }
    
    &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 4px;
    }
}
```

## Performance Considerations

1. **CSS classes are cached** by the browser, reducing re-render overhead
2. **Avoid complex selectors** that require extensive DOM traversal
3. **Group related style changes** to minimize reflows
4. **Use transform/opacity** for animations instead of position/size changes
5. **Use container queries** for responsive design within confined spaces

## Spectrum Design Token Integration

### Overview

As of v1.7.0, layout components support Adobe Spectrum design tokens for type-safe dimension values. This bridges the gap between React Spectrum components and custom layouts.

### Using Tokens in Custom Components

The `translateSpectrumToken()` utility (from `webview-ui/src/shared/utils/spectrumTokens.ts`) converts Spectrum tokens to CSS pixel values:

```typescript
import { translateSpectrumToken, DimensionValue } from '@/webview-ui/shared/utils/spectrumTokens';

interface CustomLayoutProps {
  gap?: DimensionValue;  // Accepts tokens, pixel strings, or numbers
  padding?: DimensionValue;
}

export const CustomLayout: React.FC<CustomLayoutProps> = ({ gap, padding }) => {
  return (
    <div style={{
      display: 'flex',
      gap: translateSpectrumToken(gap),         // "size-300" → "24px"
      padding: translateSpectrumToken(padding)  // 16 → "16px"
    }}>
      {children}
    </div>
  );
};
```

### Type-Safe Token Usage

The `DimensionValue` type provides compile-time validation:

```typescript
// ✅ Valid: Spectrum token
<CustomLayout gap="size-300" />

// ✅ Valid: Pixel string (backward compatible)
<CustomLayout gap="24px" />

// ✅ Valid: Number (backward compatible)
<CustomLayout gap={24} />

// ❌ Compile error: Invalid token
<CustomLayout gap="size-999" />
// Error: Type '"size-999"' is not assignable to type 'DimensionValue'
```

### Supported Tokens

13 Spectrum size tokens are currently supported (YAGNI principle - only tokens actually used in the codebase):

- **Common**: `size-300` (24px), `size-400` (32px), `size-200` (16px)
- **Small**: `size-50` (4px), `size-100` (8px), `size-150` (12px)
- **Large**: `size-500` (40px), `size-600` (48px), `size-1000` (80px)
- **Constraints**: `size-6000` (480px)
- **Rare**: `size-115`, `size-130`, `size-160` (specific component needs)

See `webview-ui/src/shared/utils/spectrumTokens.ts` for complete mapping.

### When to Use Tokens vs CSS Classes

**Use Spectrum Tokens When:**
- Building layout components (gap, padding, width constraints)
- Values need to align with Adobe Spectrum design system
- You want compile-time type safety
- Component props need flexible dimension values

**Use CSS Classes When:**
- Styling presentational aspects (colors, borders, typography)
- Complex responsive layouts requiring media queries
- State-based styling (hover, active, error states)
- Reusable utility classes across many components

**Example: Combining Both Approaches**

```tsx
// Token for layout dimension (type-safe, design-aligned)
<View
  UNSAFE_className={cn('flex', 'flex-column', 'border')}
  style={{
    gap: translateSpectrumToken('size-300'),
    padding: translateSpectrumToken('size-400')
  }}
>
  {/* CSS classes for visual styling */}
  <Text UNSAFE_className={cn('text-medium', 'text-muted')}>
    Label
  </Text>
</View>
```

### Migration Pattern

When refactoring existing components to use tokens:

1. **Identify dimension properties**: gap, padding, margin, width, height
2. **Check token table**: Does a token match the pixel value?
3. **Replace hardcoded values**: Use token if available, keep pixel value if not
4. **Add type annotation**: Use `DimensionValue` for prop types

```typescript
// Before
interface OldLayoutProps {
  gap?: number | string;  // Loose typing
}

const OldLayout = ({ gap = 24 }) => (
  <div style={{ gap: typeof gap === 'number' ? `${gap}px` : gap }}>
    {children}
  </div>
);

// After
import { DimensionValue, translateSpectrumToken } from '@/webview-ui/shared/utils/spectrumTokens';

interface NewLayoutProps {
  gap?: DimensionValue;  // Type-safe
}

const NewLayout = ({ gap = 'size-300' }) => (
  <div style={{ gap: translateSpectrumToken(gap) }}>
    {children}
  </div>
);
```

### Token Utility Implementation

The translation function handles three input types:

```typescript
translateSpectrumToken('size-300')  // → "24px" (token lookup)
translateSpectrumToken('24px')      // → "24px" (pass-through)
translateSpectrumToken(24)          // → "24px" (add unit)
translateSpectrumToken(undefined)   // → undefined (preserve optional)
```

This ensures backward compatibility while enabling modern token-based design.

## Future Improvements

- Consider CSS Modules for better scoping
- Evaluate CSS-in-JS solutions that work with React Spectrum
- Create a visual style guide component
- Add CSS linting rules for consistency
- Expand token support as new Spectrum sizes are needed (follow YAGNI principle)