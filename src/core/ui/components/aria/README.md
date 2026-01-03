# React Aria Components

## Overview

This directory contains React Aria-based UI components that replace Adobe React Spectrum. These components provide the same accessibility features as Spectrum but use CSS Modules for styling instead of inline styles, enabling proper CSS cascade control via `@layer`.

## Why React Aria?

**Problem:** Adobe React Spectrum injects inline styles that cannot be overridden by CSS `@layer` declarations, requiring 525+ `!important` declarations.

**Solution:** React Aria Components are unstyled by default, allowing full CSS control:
- Zero `!important` declarations
- Clean `@layer` cascade
- CSS Modules for encapsulation
- Same accessibility (ARIA) as Spectrum

## Directory Structure

```
aria/
├── index.ts                  # Main barrel export
├── README.md                 # This file
├── primitives/               # Layout & typography
│   ├── index.ts
│   ├── Text.tsx              # Text with semantic styling
│   ├── Text.module.css
│   ├── Heading.tsx           # H1-H6 headings
│   ├── Heading.module.css
│   ├── Flex.tsx              # Flexbox container
│   ├── Flex.module.css
│   ├── View.tsx              # Generic container
│   ├── View.module.css
│   ├── Divider.tsx           # Horizontal/vertical divider
│   └── Divider.module.css
├── interactive/              # Buttons & indicators
│   ├── index.ts
│   ├── Button.tsx            # Primary/secondary buttons
│   ├── Button.module.css
│   ├── ActionButton.tsx      # Icon/quiet buttons
│   ├── ActionButton.module.css
│   ├── ProgressCircle.tsx    # Circular spinner
│   └── ProgressCircle.module.css
├── forms/                    # Form inputs
│   ├── index.ts
│   ├── TextField.tsx         # Text input with label
│   ├── TextField.module.css
│   ├── SearchField.tsx       # Search input with clear
│   ├── SearchField.module.css
│   ├── Checkbox.tsx          # Checkbox with label
│   ├── Checkbox.module.css
│   ├── Select.tsx            # Dropdown picker
│   ├── Select.module.css
│   ├── ProgressBar.tsx       # Linear progress
│   └── ProgressBar.module.css
└── overlays/                 # Dialogs & menus
    ├── index.ts
    ├── Dialog.tsx            # Modal dialog
    ├── Dialog.module.css
    ├── Menu.tsx              # Dropdown menu
    └── Menu.module.css
```

## Usage

### Basic Import

```tsx
import { Button, Text, Flex } from '@/core/ui/components/aria';

function MyComponent() {
    return (
        <Flex gap="size-200" alignItems="center">
            <Text>Hello World</Text>
            <Button variant="primary" onPress={() => alert('Clicked!')}>
                Click Me
            </Button>
        </Flex>
    );
}
```

### Available Components

#### Primitives

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `Text` | Typography with variants | `variant`, `color`, `size` |
| `Heading` | Semantic headings (h1-h6) | `level`, `marginBottom` |
| `Flex` | Flexbox container | `direction`, `gap`, `alignItems`, `justifyContent` |
| `View` | Generic container | `padding`, `backgroundColor`, `borderRadius` |
| `Divider` | Visual separator | `size`, `marginTop`, `marginBottom` |

#### Interactive

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `Button` | Primary action button | `variant`, `onPress`, `isDisabled`, `isPending` |
| `ActionButton` | Icon/secondary button | `isQuiet`, `isSelected`, `onPress` |
| `ProgressCircle` | Circular spinner | `size`, `isIndeterminate`, `value` |

#### Forms

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `TextField` | Text input with label | `label`, `value`, `onChange`, `isRequired`, `validationState` |
| `SearchField` | Search with clear button | `value`, `onChange`, `onClear`, `placeholder` |
| `Checkbox` | Checkbox with label | `isSelected`, `onChange`, `isIndeterminate` |
| `Select` | Dropdown picker | `label`, `items`, `selectedKey`, `onSelectionChange` |
| `ProgressBar` | Linear progress bar | `value`, `label`, `isIndeterminate` |

#### Overlays

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `Dialog` | Modal dialog | `isOpen`, `onClose`, `title`, `size` |
| `DialogTrigger` | Dialog trigger wrapper | `children` (trigger + dialog) |
| `Menu` | Dropdown menu | `items`, `onAction`, `selectionMode` |
| `MenuTrigger` | Menu trigger wrapper | `children` (trigger + menu) |

## Spectrum Token Compatibility

Components accept Spectrum design token values for spacing and sizing:

```tsx
// All valid gap values
<Flex gap="size-100">    // 8px
<Flex gap="size-200">    // 16px
<Flex gap="size-300">    // 24px
<Flex gap={16}>          // 16px (number)
<Flex gap="16px">        // 16px (string)
```

Common tokens:
- `size-50` = 4px
- `size-100` = 8px
- `size-200` = 16px
- `size-300` = 24px
- `size-400` = 32px
- `size-500` = 40px

## className Support

All components support the standard `className` prop for custom styling:

```tsx
<Button
    variant="primary"
    className="my-custom-class"
>
    Custom Styled
</Button>
```

**Recommendation:** Use CSS Modules for new styling rather than inline `className`.

## Accessibility

All components maintain ARIA parity with React Spectrum:

- **Keyboard navigation:** Tab, Enter, Escape, Arrow keys
- **ARIA attributes:** role, aria-label, aria-describedby
- **Focus management:** Focus traps in dialogs, focus restoration
- **Screen reader support:** Announcements via aria-live

## CSS Architecture

### Zero !important Pattern

CSS Modules use `@layer` cascade instead of `!important`:

```css
/* Component CSS Module */
.button {
    /* No !important needed - relies on @layer cascade */
    padding: var(--spectrum-global-dimension-size-150);
    background: var(--spectrum-accent-background-color-default);
}

/* State styling via data attributes */
.button[data-pressed] {
    background: var(--spectrum-accent-background-color-down);
}
```

### Layer Order

Components integrate with the 4-layer CSS architecture:

```css
@layer reset, vscode-theme, components, utilities;
```

CSS Modules load in the `components` layer, while utility classes in `utilities` can override.

## Testing

Components include comprehensive test coverage:

```bash
# Run component tests
npm test -- tests/core/ui/components/aria/

# Coverage target: 80%+
```

Test categories:
- **Rendering:** Component mounts with correct props
- **Accessibility:** ARIA attributes, keyboard navigation
- **Interactions:** Click, focus, keyboard events
- **States:** Disabled, loading, selected states

## Migration from Spectrum

### Quick Reference

| Spectrum | React Aria |
|----------|------------|
| `import { Button } from '@adobe/react-spectrum'` | `import { Button } from '@/core/ui/components/aria'` |
| `UNSAFE_className="..."` | `className="..."` |
| `variant="cta"` | `variant="primary"` |
| `variant="overBackground"` | Not yet supported |

### Remaining Spectrum Components

Some Spectrum components do not yet have React Aria replacements:

- `Well`, `Content` - Layout containers (use CSS classes)

## Related Documentation

- CSS Architecture: `src/core/ui/styles/CLAUDE.md`
- Research: `.rptc/research/css-architecture-audit/research.md`
- Migration Plan: `.rptc/plans/full-react-aria-migration/`
