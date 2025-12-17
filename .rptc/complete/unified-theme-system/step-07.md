# Step 7: Verify Theme Isolation

## Purpose
Validate that the unified theme system successfully isolates extension appearance from VS Code theme changes.

## Prerequisites
- [ ] Steps 1-6 completed
- [ ] Extension builds without errors

## Verification Tests

### Theme Isolation Tests
- [ ] **VS Code Default Dark**: Baseline - extension renders correctly
- [ ] **VS Code Default Light**: Extension remains dark (no light theme bleed)
- [ ] **VS Code High Contrast**: Extension remains dark
- [ ] **VS Code High Contrast Light**: Extension remains dark

### Visual Regression Check
- [ ] Wizard steps render correctly
- [ ] Dashboard components display properly
- [ ] Sidebar maintains dark appearance
- [ ] All buttons, inputs, and text are legible

### Hard-coded Color Audit
- [ ] Run grep audit: `grep -rn "rgb\|rgba\|#[0-9a-fA-F]" src/webviews --include="*.css" --include="*.tsx"`
- [ ] Verify all colors use CSS variables or Spectrum tokens
- [ ] Document any intentional exceptions

## Acceptance Criteria
- [ ] Extension appearance identical across all VS Code themes
- [ ] No visual regressions in existing components
- [ ] Grep audit shows zero unauthorized hard-coded colors

## Estimated Time
1 hour (manual testing)
