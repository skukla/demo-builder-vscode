# Step 2: Extract Utility Classes

## Purpose

Extract all utility classes from `custom-spectrum.css` into categorized files under `utilities/`.

## Prerequisites

- Step 1 complete (directory structure exists)

## Implementation Details

### Typography Utilities (~150 lines)
**File:** `utilities/typography.css`

Extract:
- `.text-xs` through `.text-5xl` - Font size utilities
- `.font-normal`, `.font-medium`, `.font-semibold`, `.font-bold` - Font weight
- `.text-left`, `.text-center`, `.text-right` - Text alignment
- `.uppercase`, `.lowercase`, `.capitalize` - Text transform
- `.truncate`, `.line-clamp-*` - Text overflow
- `.leading-*` - Line height utilities

### Color Utilities (~100 lines)
**File:** `utilities/colors.css`

Extract:
- `.text-gray-*`, `.text-blue-*`, etc. - Text colors
- `.bg-gray-*`, `.bg-blue-*`, etc. - Background colors
- `.text-success`, `.text-error`, `.text-warning` - Semantic text colors
- `.bg-success`, `.bg-error`, `.bg-warning` - Semantic background colors

### Layout Utilities (~200 lines)
**File:** `utilities/layout.css`

Extract:
- `.flex`, `.inline-flex` - Display flex
- `.flex-row`, `.flex-column`, `.flex-wrap` - Flex direction
- `.items-start`, `.items-center`, `.items-end` - Align items
- `.justify-start`, `.justify-center`, `.justify-between`, `.justify-end` - Justify content
- `.grid`, `.grid-cols-*` - Grid utilities
- `.block`, `.inline-block`, `.hidden` - Display utilities
- `.w-*`, `.h-*`, `.min-w-*`, `.min-h-*`, `.max-w-*`, `.max-h-*` - Dimensions
- `.overflow-*` - Overflow utilities
- `.relative`, `.absolute`, `.fixed`, `.sticky` - Position utilities

### Spacing Utilities (~150 lines)
**File:** `utilities/spacing.css`

Extract:
- `.p-*`, `.px-*`, `.py-*`, `.pt-*`, `.pr-*`, `.pb-*`, `.pl-*` - Padding
- `.m-*`, `.mx-*`, `.my-*`, `.mt-*`, `.mr-*`, `.mb-*`, `.ml-*` - Margin
- `.gap-*`, `.gap-x-*`, `.gap-y-*` - Gap utilities
- `.space-x-*`, `.space-y-*` - Space between

### Border Utilities (~80 lines)
**File:** `utilities/borders.css`

Extract:
- `.border`, `.border-*` - Border width
- `.border-gray-*`, `.border-blue-*` - Border colors
- `.rounded`, `.rounded-*` - Border radius
- `.shadow`, `.shadow-*` - Box shadow

## Tests to Write First

1. **Typography extraction test**: Verify all text-* classes in typography.css
2. **Color extraction test**: Verify all color utilities in colors.css
3. **Layout extraction test**: Verify flex/grid utilities in layout.css
4. **Spacing extraction test**: Verify p-*/m-* utilities in spacing.css
5. **Border extraction test**: Verify border/rounded utilities in borders.css
6. **No orphans test**: Verify extracted classes removed from custom-spectrum.css
7. **Build test**: Verify webpack compiles after extraction

## Expected Outcome

- 5 focused utility CSS files created
- ~680 lines extracted from custom-spectrum.css
- All utility classes organized by category
- Build passes with no regressions

## Acceptance Criteria

- [x] typography.css contains all text size/weight/alignment utilities
- [x] colors.css contains all color utilities
- [x] layout.css contains all flex/grid/dimension utilities
- [x] spacing.css contains all padding/margin/gap utilities
- [x] borders.css contains all border/radius/shadow utilities
- [x] Each file is <300 lines
- [ ] Extracted classes removed from custom-spectrum.css (deferred to Step 5)
- [x] All existing CSS tests pass

## Completion Notes

**Completed**: 2026-01-01

**Files Populated**:
- `typography.css` (44 lines) - 21 utility classes: text sizes, font weights, text alignment, text transform
- `colors.css` (41 lines) - 18 utility classes: text colors, background colors, opacity
- `layout.css` (119 lines) - 48 utility classes: dimensions, flexbox, grid, display, overflow, position, z-index, cursor, transitions
- `spacing.css` (48 lines) - 22 utility classes: padding, margin, gap
- `borders.css` (30 lines) - 12 utility classes: borders, border radius

**Total**: ~109 utility classes extracted, all files under 300 lines

**Note**: Classes remain in custom-spectrum.css until Step 5 when entry point is updated. This ensures application continues to work during migration.

**Tests**: 25 tests passing in `tests/core/ui/styles/utilityExtraction.test.ts`
