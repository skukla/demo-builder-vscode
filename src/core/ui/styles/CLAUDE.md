# CSS Architecture

## Overview

The `styles/` directory contains the CSS architecture for the Demo Builder webviews. This follows a **hybrid approach** combining semantic component classes with utility classes, aligned with 2024-2025 industry best practices.

## Philosophy

**Hybrid Pattern**: Semantic classes for components + utility classes for layout/spacing.

This approach is recommended by CUBE CSS, MaintainableCSS, and aligns with Adobe Spectrum's philosophy of minimal overrides.

## Directory Structure

```
styles/
├── index.css                    # Master entry point with @layer declarations
├── reset.css                    # Browser resets
├── tokens.css                   # Design tokens (CSS variables)
├── vscode-theme.css             # VS Code theme integration (--vscode-* vars)
├── wizard.css                   # Wizard-specific Spectrum overrides
├── custom-spectrum.css          # Stub re-exporting modular imports
│
├── utilities/                   # Low-specificity, reusable utilities
│   ├── index.css               # Barrel import
│   ├── typography.css          # Font sizes, weights, alignment
│   ├── layout.css              # Flexbox, grid, display, overflow
│   ├── spacing.css             # Padding, margin, gap
│   ├── colors.css              # Text/background colors
│   ├── borders.css             # Border styles, radius
│   └── animations.css          # Centralized @keyframes definitions
│
├── spectrum/                    # Spectrum component overrides
│   ├── index.css               # Barrel import
│   ├── buttons.css             # Button styling
│   └── components.css          # ProgressBar, TextField, etc.
│
└── components/                  # Semantic component styles
    ├── index.css               # Barrel import
    ├── cards.css               # Card layouts
    ├── common.css              # Containers, loading, empty states
    ├── dashboard.css           # Dashboard-specific styles
    └── timeline.css            # Timeline navigation
```

## @layer Cascade System

The CSS uses `@layer` for explicit cascade control:

```css
@layer reset, theme, overrides;
```

**Layer Order** (lowest to highest specificity):
1. `reset` - Browser resets
2. `theme` - Base theming
3. `overrides` - Component overrides

## Pattern Guidelines

### When to Use Semantic/Functional Classes

Use for component styling:
- `.wizard-step`, `.form-field-group`
- States and variants: `.wizard-step--active`
- Testable hooks for automation
- Design system integration

### When to Use Utility Classes

Use for layout and spacing:
- Spacing between components: `.mb-4`, `.gap-3`
- One-off layout adjustments: `.flex`, `.items-center`
- Context-specific overrides

### Utilities Use `!important`

Utility classes use `!important` to reliably override Spectrum defaults:
```css
.flex {
    display: flex !important;
}
```

## CSS Modules

Feature-scoped CSS Modules are used for complex UIs:

```
features/prerequisites/ui/styles/prerequisites.module.css
features/project-creation/ui/styles/project-creation.module.css
```

**Naming Convention**: Use camelCase for module class names.

## Animation Keyframes

Common keyframes are centralized in `utilities/animations.css`:

- `spin` - Loading spinners
- `pulse` - Status indicators
- `fadeIn` - Element appearance
- `fadeInUp` - Subtle entrance effects

**Component-specific keyframes** (e.g., `timeline-enter`) remain in their component files.

## Adobe Spectrum Integration

**Philosophy**: Create wrapper components with layout styling, not internal overrides.

- Use Spectrum components as intended
- Add layout wrappers for positioning
- Minimize `UNSAFE_className` usage
- Test with all theme modes (light, dark, high-contrast)

## VS Code Webview Requirements

- Use `--vscode-*` CSS variables for theme compatibility
- Content Security Policy requires external CSS files (no inline `<style>`)
- Test with light, dark, and high-contrast themes

## Usage Distribution

```
Utility Classes:     ~40%  (global, reusable, single-concern)
Semantic Components: ~27%  (page-level, contextual)
CSS Modules:         ~20%  (feature-scoped, complex UIs)
Spectrum Overrides:  ~13%  (component library integration)
Inline Styles:       <1%   (dynamic values only)
```

## Adding New Styles

1. **Utility class needed?** → Add to appropriate `utilities/*.css`
2. **Component styling?** → Add to `components/*.css`
3. **Spectrum override?** → Add to `spectrum/*.css`
4. **Feature-specific complex UI?** → Create CSS Module in feature directory
5. **New keyframe animation?** → Add to `utilities/animations.css`

## Related Documentation

- Research: `.rptc/research/css-utility-pattern-best-practices/research.md`
- Tests: `tests/core/ui/styles/`
- Core UI: `src/core/ui/CLAUDE.md`
