# Step 3: Add @layer Declarations to Existing CSS

## Purpose
Establish CSS cascade layer ordering and wrap critical style sections to ensure predictable specificity. The layer order (reset, theme, overrides) ensures proper cascade control.

## Prerequisites
- [ ] Step 1 complete (tokens.css with `@layer theme`)
- [ ] Step 2 complete (reset.css with `@layer reset`)

## Tests to Write First
- [ ] Test: Layer order declaration exists in index.css
  - **Given:** index.css is loaded
  - **When:** Inspecting CSS content
  - **Then:** File contains `@layer reset, theme, overrides;` at top
  - **File:** Manual CSS inspection

- [ ] Test: CTA overrides wrapped in overrides layer
  - **Given:** custom-spectrum.css loaded
  - **When:** CTA button rendered
  - **Then:** Orange CTA styles apply via `@layer overrides`
  - **File:** Visual verification in wizard

## Files to Modify

### 1. `src/core/ui/styles/index.css`
Add layer order declaration at top (before any other rules):
```css
/* Layer order - controls cascade priority */
@layer reset, theme, overrides;
```

Wrap base styles (body, html, #root, scrollbar) in `@layer theme`:
```css
@layer theme {
  body, html { ... }
  #root { ... }
  ::-webkit-scrollbar { ... }
  /* Other base styles */
}
```

### 2. `src/core/ui/styles/custom-spectrum.css`
Wrap ONLY the CTA button overrides (lines 168-191) in `@layer overrides`:
```css
@layer overrides {
  /* Override React Spectrum CTA button variant */
  .spectrum-Button--cta,
  .spectrum-Button[data-variant="cta"],
  button[class*="spectrum-Button"][class*="cta"] {
    background-color: #f97316 !important;
    border-color: #f97316 !important;
  }
  /* ...hover, focus, active states... */
}
```

Do NOT wrap utility classes - they need `!important` to work.

### 3. `src/core/ui/styles/wizard.css`
Wrap wizard-specific structural styles in `@layer theme`:
```css
@layer theme {
  .wizard-container { ... }
  .step-content-wrapper { ... }
  .prerequisites-container { ... }
}
```

Keep animations and input overrides outside layers.

## Implementation Details

**RED Phase:** Verify CTA buttons currently show orange color.

**GREEN Phase:**
1. Add `@layer reset, theme, overrides;` to index.css line 1
2. Wrap index.css base styles in `@layer theme { }`
3. Wrap CTA overrides in custom-spectrum.css with `@layer overrides { }`
4. Wrap wizard structural styles in wizard.css with `@layer theme { }`

**REFACTOR Phase:** Verify styles still apply correctly, no visual regressions.

## Expected Outcome
- Layer order established for cascade control
- CTA overrides reliably win over Spectrum defaults
- Base styles organized in theme layer
- No visual changes to existing UI

## Acceptance Criteria
- [ ] `@layer reset, theme, overrides;` present in index.css
- [ ] CTA button overrides wrapped in `@layer overrides`
- [ ] No visual regressions in wizard UI
- [ ] CTA buttons still display tangerine orange

## Estimated Time
30 minutes
