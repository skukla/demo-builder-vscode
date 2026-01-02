# Step 4: Extract Component Styles

## Purpose

Extract all semantic component styles from `custom-spectrum.css` into dedicated files under `components/`.

## Prerequisites

- Step 3 complete (Spectrum overrides extracted)

## Implementation Details

### Card Styles (~300 lines)
**File:** `components/cards.css`

Extract:
- `.card` base styles and variants
- `.project-card` styling (used in projects dashboard)
- `.template-card` styling (used in wizard)
- `.brand-card` styling (brand selection cards)
- `.stack-card` styling (stack selection cards)
- Card hover states and animations
- Card grid layouts
- Card content sections (header, body, footer)

### Timeline Styles (~150 lines)
**File:** `components/timeline.css`

Extract:
- `.timeline-nav` container styles
- `.timeline-step` individual step styling
- `.timeline-connector` line between steps
- Step states (completed, active, pending)
- Step animations and transitions
- Timeline responsive behavior

### Dashboard Styles (~200 lines)
**File:** `components/dashboard.css`

Extract:
- `.dashboard-grid` layout
- `.dashboard-header` styling
- `.dashboard-actions` button container
- `.status-header` component
- `.mesh-status` indicator
- Dashboard section styles
- Action button groups

### Common Component Styles (~400 lines)
**File:** `components/common.css`

Extract:
- `.container` and wrapper classes
- `.empty-state` styling
- `.loading-*` indicator styles
- `.error-*` message styling
- `.success-*` message styling
- `.icon-*` utility classes
- `.divider` and separator styles
- `.scrollable` container styles
- Miscellaneous component styles not fitting other categories

## Tests to Write First

1. **Card extraction test**: Verify all card-related classes in cards.css
2. **Timeline extraction test**: Verify timeline classes in timeline.css
3. **Dashboard extraction test**: Verify dashboard classes in dashboard.css
4. **Common extraction test**: Verify remaining component styles in common.css
5. **No orphans test**: Verify extracted classes removed from custom-spectrum.css
6. **Build test**: Verify webpack compiles after extraction

## Expected Outcome

- 4 focused component CSS files created
- ~1,050 lines extracted from custom-spectrum.css
- Clear semantic organization
- Build passes with no regressions

## Acceptance Criteria

- [x] cards.css contains all card variant styles
- [x] timeline.css contains all timeline/step styles
- [x] dashboard.css contains all dashboard-specific styles
- [x] common.css contains remaining component styles
- [x] Each file is <500 lines
- [ ] Extracted classes removed from custom-spectrum.css (deferred to Step 5)
- [x] All existing CSS tests pass

## TDD Completion Notes

**Completed**: 2025-01-01

### Files Created

| File | Lines | Contents |
|------|-------|----------|
| `cards.css` | 34 | Card container, hover effects, bordered-container |
| `timeline.css` | 114 | Timeline container, step dots (states), connectors, enter/exit animations |
| `dashboard.css` | 125 | Status header, grid layout, action buttons with hover/focus states |
| `common.css` | 162 | Container classes, wizard layout, loading overlays, empty states, status indicators, sidebar |

### Test Coverage

Created `tests/core/ui/styles/componentExtraction.test.ts` with 20 tests:
- Card Styles: 3 tests
- Timeline Styles: 4 tests
- Dashboard Styles: 4 tests
- Common Styles: 5 tests
- File Size Constraints: 4 tests

All tests passing. Build verified with webpack.
