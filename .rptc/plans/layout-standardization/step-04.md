# Step 4: Migrate AdobeProjectStep to TwoColumnLayout

## Purpose

Replace manual two-column div implementation in AdobeProjectStep with TwoColumnLayout component, eliminating ~40 lines of duplicate layout code. This is the first migration step demonstrating the pattern for subsequent migrations.

## Prerequisites

- [ ] Step 3 completed (TwoColumnLayout exists with token support)
- [ ] TwoColumnLayout component available at `webview-ui/src/shared/components/layout/TwoColumnLayout.tsx`

## Tests to Write First

**Manual Visual Validation** (no automated tests for layout migration):

- [ ] **Test: Visual parity with original implementation**
  - **Given:** AdobeProjectStep rendered with multiple projects available
  - **When:** Component loads with left column (project list) and right column (ConfigurationSummary)
  - **Then:** Layout appears identical to original (800px left max-width, 24px padding, gray background on right, border between columns)
  - **Validation:** Side-by-side browser comparison before/after migration

- [ ] **Test: Responsive behavior unchanged**
  - **Given:** Browser window resized to various widths
  - **When:** Width changes from 1200px → 900px → 600px
  - **Then:** Layout adjusts identically to original implementation
  - **Validation:** Manual resize testing

- [ ] **Test: Content overflow handling**
  - **Given:** Long project list (20+ projects) in left column
  - **When:** User scrolls within ListView
  - **Then:** Scrolling behavior unchanged, ConfigurationSummary remains fixed on right
  - **Validation:** Manual scroll testing

## Files to Modify

- [ ] `webview-ui/src/wizard/steps/AdobeProjectStep.tsx` - Replace manual div structure with TwoColumnLayout

## Implementation Details

### BEFORE (Lines 144-322):

```tsx
return (
    <div style={{ display: 'flex', height: '100%', width: '100%', gap: '0' }}>
        {/* Left: Project Selection - constrained to 800px like other steps */}
        <div style={{
            maxWidth: '800px',
            width: '100%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0
        }}>
            <Heading level={2} marginBottom="size-300">
                {state.adobeOrg?.name ? `Projects in ${state.adobeOrg.name}` : 'Select Adobe Project'}
            </Heading>
            {/* ... project selection UI ... */}
        </div>

        {/* Right: Summary Panel - positioned after main content */}
        <div style={{
            flex: '1',
            padding: '24px',
            backgroundColor: 'var(--spectrum-global-color-gray-75)',
            borderLeft: '1px solid var(--spectrum-global-color-gray-200)'
        }}>
            <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
        </div>
    </div>
);
```

### AFTER (Simplified):

```tsx
import { TwoColumnLayout } from '@/webview-ui/shared/components/layout/TwoColumnLayout';

// ... rest of component code ...

return (
    <TwoColumnLayout
        leftContent={
            <>
                <Heading level={2} marginBottom="size-300">
                    {state.adobeOrg?.name ? `Projects in ${state.adobeOrg.name}` : 'Select Adobe Project'}
                </Heading>
                {/* ... project selection UI ... */}
            </>
        }
        rightContent={
            <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
        }
        leftMaxWidth="800px"
        leftPadding="size-300"
        rightPadding="size-300"
        gap="0"
    />
);
```

### Transformation Steps

1. **Import TwoColumnLayout**
   - Add import statement at top of file
   - Verify TypeScript resolves import correctly

2. **Extract left column content**
   - Copy everything between opening `<div style={{maxWidth: '800px'...}}>` and its closing `</div>`
   - Wrap in `<>...</>` fragment for leftContent prop

3. **Extract right column content**
   - Copy `<ConfigurationSummary />` component
   - Pass directly as rightContent prop

4. **Map style props to component props**
   - `maxWidth: '800px'` → `leftMaxWidth="800px"`
   - `padding: '24px'` (left) → `leftPadding="size-300"`
   - `padding: '24px'` (right) → `rightPadding="size-300"`
   - `gap: '0'` → `gap="0"` (explicit, though default)

5. **Remove manual div structure**
   - Delete outer container div (lines 144, 322)
   - Delete left column div (lines 146-153, 311)
   - Delete right column div (lines 314-321)

## Expected Outcome

**After Migration:**

- AdobeProjectStep renders identically to original
- Code reduced from ~178 lines to ~160 lines (~18 line reduction)
- Layout logic centralized in TwoColumnLayout component
- Spectrum token support available (size-300 = 24px)
- No TypeScript errors
- No browser console warnings

**Visual Verification:**

- 800px max-width on left column maintained
- 24px padding on both columns maintained
- Gray background (#F5F5F5) on right column
- 1px gray border between columns
- ConfigurationSummary positioned correctly
- Project list scrolling works identically

## Acceptance Criteria

- [ ] TwoColumnLayout component imported correctly
- [ ] Left column content moved to leftContent prop
- [ ] Right column content moved to rightContent prop
- [ ] Visual parity confirmed (side-by-side comparison)
- [ ] No layout regressions (padding, spacing, colors identical)
- [ ] TypeScript compiles without errors
- [ ] No browser console warnings/errors
- [ ] Project list selection still functional
- [ ] ConfigurationSummary displays correctly
- [ ] Manual div structure removed (lines 144-322 replaced)

## Dependencies

**No new dependencies** - TwoColumnLayout created in Step 3

## Estimated Time

**30-45 minutes**

- Code transformation: 10 minutes
- Visual validation: 15 minutes (multiple test cases)
- Refinement if needed: 10 minutes
- Documentation: 5 minutes

---

**Migration Pattern Notes:**

This is the first of 5 migrations. Pattern established here:

1. Import TwoColumnLayout
2. Extract left/right content to separate props
3. Map inline styles to component props (using tokens where available)
4. Remove manual div structure
5. Manual visual validation (before/after comparison)

Subsequent migrations (Steps 6-10) follow identical pattern.
