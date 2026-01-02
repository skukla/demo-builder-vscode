# Step 3: Extract Spectrum Overrides

## Purpose

Extract all Adobe Spectrum component overrides from `custom-spectrum.css` into dedicated files under `spectrum/`.

## Prerequisites

- Step 2 complete (utility classes extracted)

## Implementation Details

### Button Overrides (~200 lines)
**File:** `spectrum/buttons.css`

Extract:
- `.spectrum-Button` size variants and overrides
- `.spectrum-ActionButton` customizations
- `.spectrum-ClearButton` styling
- CTA button styling (`.cta-button`, primary/secondary variants)
- Button state overrides (hover, active, disabled)
- Icon button variants
- Button group styling

### Component Overrides (~300 lines)
**File:** `spectrum/components.css`

Extract:
- `.spectrum-TextField` overrides (input styling, validation states)
- `.spectrum-Picker` customizations (dropdown styling, menu width)
- `.spectrum-Badge` variants (status badges, count badges)
- `.spectrum-Checkbox` styling
- `.spectrum-Radio` styling
- `.spectrum-Switch` styling
- `.spectrum-ProgressBar` customizations
- `.spectrum-Slider` styling
- `.spectrum-Tooltip` overrides
- `.spectrum-Dialog` and modal overrides
- `.spectrum-Menu` and dropdown styling
- `.spectrum-Tabs` customizations
- `.spectrum-Well` styling
- `.spectrum-Divider` overrides

## Tests to Write First

1. **Button extraction test**: Verify all button-related classes in buttons.css
2. **Component extraction test**: Verify Spectrum component overrides in components.css
3. **Selector specificity test**: Verify extracted selectors maintain original specificity
4. **No orphans test**: Verify extracted classes removed from custom-spectrum.css
5. **Build test**: Verify webpack compiles after extraction

## Expected Outcome

- 2 focused Spectrum override files created
- ~500 lines extracted from custom-spectrum.css
- Clear separation between button and component overrides
- Build passes with no regressions

## Acceptance Criteria

- [x] buttons.css contains all button/CTA overrides
- [x] components.css contains all other Spectrum overrides
- [x] Each file is <300 lines
- [x] Selector specificity unchanged
- [ ] Extracted classes removed from custom-spectrum.css (deferred to Step 5)
- [x] All existing CSS tests pass

## Completion Notes

**Completed**: 2026-01-01

**Files Populated**:
- `buttons.css` (79 lines) - Button cursor overrides, size variations (btn-compact/standard/large), CTA button overrides with hover/focus/active states
- `components.css` (53 lines) - Progress bar customizations (small-label, full-width), progress bar animations (fadeInUp keyframes, fill transitions)

**Total**: ~130 lines of Spectrum override styles, all files well under 300 lines

**Note**: Classes remain in custom-spectrum.css until Step 5 when entry point is updated.

**Tests**: 11 tests passing in `tests/core/ui/styles/spectrumExtraction.test.ts`
