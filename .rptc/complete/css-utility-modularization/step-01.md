# Step 1: Create Directory Structure

## Purpose

Set up the new directory structure with barrel imports for organizing CSS utilities, Spectrum overrides, and component styles.

## Prerequisites

- CSS Architecture Improvement complete (confirmed)
- Access to `src/core/ui/styles/` directory

## Implementation Details

### Create Directories

```
src/core/ui/styles/
├── utilities/      # Utility classes (typography, colors, layout, spacing, borders)
├── spectrum/       # Spectrum component overrides (buttons, components)
└── components/     # Semantic component styles (cards, timeline, dashboard, common)
```

### Create Barrel Imports

Each directory needs an `index.css` that imports all files in that directory.

**utilities/index.css:**
```css
/* Utility Classes - Extracted from custom-spectrum.css */
@import './typography.css';
@import './colors.css';
@import './layout.css';
@import './spacing.css';
@import './borders.css';
```

**spectrum/index.css:**
```css
/* Spectrum Component Overrides */
@import './buttons.css';
@import './components.css';
```

**components/index.css:**
```css
/* Semantic Component Styles */
@import './cards.css';
@import './timeline.css';
@import './dashboard.css';
@import './common.css';
```

## Tests to Write First

1. **Directory structure test**: Verify all directories exist
2. **Barrel import test**: Verify each index.css imports expected files
3. **Build test**: Verify webpack compiles without errors after structure created

## Expected Outcome

- Three new directories created
- Three barrel index.css files created
- Empty placeholder files for each category
- Build still passes (no functional changes yet)

## Acceptance Criteria

- [x] `utilities/` directory exists with index.css
- [x] `spectrum/` directory exists with index.css
- [x] `components/` directory exists with index.css
- [x] All placeholder CSS files created
- [x] `npm run compile:webview` passes

## Completion Notes

**Completed**: 2026-01-01

**Files Created**:
- `utilities/index.css` - Barrel importing typography, colors, layout, spacing, borders
- `utilities/typography.css` - Placeholder for Step 2
- `utilities/colors.css` - Placeholder for Step 2
- `utilities/layout.css` - Placeholder for Step 2
- `utilities/spacing.css` - Placeholder for Step 2
- `utilities/borders.css` - Placeholder for Step 2
- `spectrum/index.css` - Barrel importing buttons, components
- `spectrum/buttons.css` - Placeholder for Step 3
- `spectrum/components.css` - Placeholder for Step 3
- `components/index.css` - Barrel importing cards, timeline, dashboard, common
- `components/cards.css` - Placeholder for Step 4
- `components/timeline.css` - Placeholder for Step 4
- `components/dashboard.css` - Placeholder for Step 4
- `components/common.css` - Placeholder for Step 4

**Tests**: 15 tests passing in `tests/core/ui/styles/directoryStructure.test.ts`
