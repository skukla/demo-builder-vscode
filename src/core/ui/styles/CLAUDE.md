# CSS Architecture

## Overview

The `styles/` directory contains the CSS architecture for the Demo Builder webviews. This follows a **hybrid approach** combining semantic component classes with utility classes, aligned with 2024-2025 industry best practices.

## Philosophy

**Hybrid Pattern**: Semantic classes for components + utility classes for layout/spacing.

This approach is recommended by CUBE CSS, MaintainableCSS, and works cleanly with React Aria Components (unstyled by default).

## React Aria Integration

The project uses React Aria Components instead of Adobe React Spectrum. This enables:

- **Zero `!important` declarations** in component CSS Modules
- **Clean `@layer` cascade** without inline style conflicts
- **CSS Modules** for component-scoped styling
- **Spectrum design tokens** for consistency

React Aria component styles: `src/core/ui/components/aria/*.module.css`

## Directory Structure

```
styles/
├── index.css                    # Master entry point with @layer declarations
├── reset.css                    # Browser resets
├── tokens.css                   # Design tokens (CSS variables)
├── vscode-theme.css             # VS Code theme integration (--vscode-* vars)
├── wizard.css                   # Wizard-specific styles
├── custom-spectrum.css          # Stub re-exporting modular imports
│
├── utilities/                   # Low-specificity, reusable utilities
│   ├── index.css               # Barrel import
│   ├── typography.css          # Font sizes, weights, alignment
│   ├── layout.css              # Flexbox, grid, display, overflow
│   ├── spacing.css             # Padding, margin, gap
│   ├── colors.css              # Text/background colors
│   ├── borders.css             # Border styles, radius
│   ├── buttons.css             # Button size variations, action pills
│   └── animations.css          # Centralized @keyframes definitions
│
└── components/                  # Semantic component styles (shared/global only)
    ├── index.css               # Barrel import with migration notes
    └── common.css              # Containers, loading, empty states
```

**Feature CSS Modules** (migrated from global components/):
```
src/features/projects-dashboard/ui/styles/projects-dashboard.module.css  # Project cards, rows
src/features/dashboard/ui/styles/dashboard.module.css                     # Dashboard grid, buttons
src/core/ui/components/TimelineNav.module.css                             # Timeline navigation
```

## @layer Cascade System

The CSS uses `@layer` for explicit cascade control with 4 layers:

```css
@layer reset, vscode-theme, components, utilities;
```

**Layer Order** (lowest to highest priority):
1. `reset` - Browser resets (index.css)
2. `vscode-theme` - VS Code theme integration (tokens.css, vscode-theme.css)
3. `components` - Semantic component styles (components/*.css)
4. `utilities` - Utility classes with highest priority (utilities/*.css)

This cascade order ensures utilities always override component styles without needing `!important`.

**Note**: CSS Modules don't use `@layer` - they're scoped by hashed class names instead.

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

### Utilities Use @layer (No !important)

Utility classes rely on `@layer utilities` cascade priority to override Spectrum defaults. This is cleaner and more maintainable than `!important`:

```css
@layer utilities {
  .flex {
    display: flex;
  }
}
```

Since `utilities` is declared last in the layer order, it has highest priority and overrides all other layers naturally.

## CSS Modules

Feature-scoped CSS Modules are used for complex UIs:

```
features/prerequisites/ui/styles/prerequisites.module.css
features/project-creation/ui/styles/project-creation.module.css
features/projects-dashboard/ui/styles/projects-dashboard.module.css
features/dashboard/ui/styles/dashboard.module.css
core/ui/components/TimelineNav.module.css
```

**Naming Convention**: Use camelCase for module class names (e.g., `.projectCard`, `.actionButton`).

**Migration Complete**: Feature-specific component styles have been migrated from global CSS to CSS Modules:
- `cards.css` → `projects-dashboard.module.css`
- `dashboard.css` → `dashboard.module.css`
- `timeline.css` → `TimelineNav.module.css`

## Animation Keyframes

**Canonical Location:** `utilities/animations.css`

Common keyframes are centralized there:
- `spin` - Loading spinners
- `pulse` - Status indicators
- `fadeIn` - Element appearance
- `fadeInUp` - Subtle entrance effects

**Exceptions (acceptable):**

1. **Component-specific animations** in their CSS Modules:
   - `TimelineNav.module.css`: `timelineEnter`, `timelineExit`
   - CSS Modules may have local keyframes (e.g., `expandIn` in project-creation.module.css)

2. **VS Code providers** (unavoidable):
   - `sidebarProvider.ts` has inline `@keyframes spin` because VS Code WebviewViewProviders inject styles differently

**Convention:**
- New common keyframes → `utilities/animations.css`
- Component-specific keyframes → Component's CSS Module
- Reference existing keyframes via class (`.animate-fade-in`) instead of duplicating

## React Aria Component Styling

**Philosophy**: CSS Modules for component styling, no inline styles.

- Components in `src/core/ui/components/aria/` have co-located `.module.css` files
- Zero `!important` declarations - relies on `@layer` cascade
- Uses data-* attributes for state styling (pressed, focused, disabled)
- Spectrum design tokens for colors and spacing
- Test with all theme modes (light, dark, high-contrast)

**CSS Module Pattern:**
```css
/* Button.module.css */
.button {
    padding: var(--spectrum-global-dimension-size-150);
    background: var(--spectrum-accent-background-color-default);
}

.button[data-pressed] {
    background: var(--spectrum-accent-background-color-down);
}
```

## React Aria Migration Complete

All Spectrum components have been migrated to React Aria:
- All components now use `className` (not `UNSAFE_className`)
- `Tooltip`, `TooltipTrigger` - Migrated to React Aria
- `RadioGroup`, `Radio` - Migrated to React Aria
- `List`, `ListItem` - Migrated to React Aria

The `spectrum/` directory has been removed as all components now use React Aria with CSS Modules.

## VS Code Webview Requirements

- Use `--vscode-*` CSS variables for theme compatibility
- Content Security Policy requires external CSS files (no inline `<style>`)
- Test with light, dark, and high-contrast themes

## Usage Distribution

```
Utility Classes:     ~46%  (global, reusable, single-concern)
Semantic Components: ~20%  (global common.css only)
CSS Modules:         ~34%  (feature-scoped, complex UIs, React Aria)
Inline Styles:       <1%   (dynamic values only)
```

## Adding New Styles

1. **Utility class needed?** → Add to appropriate `utilities/*.css`
2. **Feature-specific component?** → Create CSS Module in feature's `ui/styles/` directory
3. **Shared layout/container?** → Add to `components/common.css`
4. **React Aria component?** → Create CSS Module in `components/aria/`
5. **New keyframe animation?** → Add to `utilities/animations.css` (or CSS Module if component-specific)

## Related Documentation

- Research: `.rptc/research/css-utility-pattern-best-practices/research.md`
- Tests: `tests/core/ui/styles/`
- Core UI: `src/core/ui/CLAUDE.md`
