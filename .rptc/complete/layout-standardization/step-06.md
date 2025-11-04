# Step 6: Migrate ApiMeshStep to TwoColumnLayout

## Purpose

Replace manual two-column div implementation in ApiMeshStep with TwoColumnLayout component, eliminating ~20 lines of duplicate layout code. This is the second wizard step migration following the pattern from Step 4.

## Prerequisites

- [ ] Step 3 completed (TwoColumnLayout exists with token support)
- [ ] TwoColumnLayout component available at `webview-ui/src/shared/components/layout/TwoColumnLayout.tsx`
- [ ] Step 4 pattern validated (AdobeProjectStep successfully migrated)

## Tests to Write First

**Manual Visual Validation** (no automated tests for layout migration):

- [ ] **Test: Visual parity with original implementation**
  - **Given:** ApiMeshStep rendered with checking/error/success states
  - **When:** Component loads with left column (mesh status) and right column (ConfigurationSummary)
  - **Then:** Layout appears identical to original (800px left max-width, 24px padding, gray background on right, border between columns)
  - **Validation:** Side-by-side browser comparison before/after migration

- [ ] **Test: All mesh states render correctly**
  - **Given:** ApiMeshStep in different states (checking, API not enabled, mesh exists, mesh needs creation, mesh error)
  - **When:** Each state renders in new layout
  - **Then:** Content centered correctly in left column, ConfigurationSummary positioned correctly in right column
  - **Validation:** Manual testing of all 5 states

- [ ] **Test: Loading states display correctly**
  - **Given:** ApiMeshStep in checking mode with progress messages
  - **When:** LoadingDisplay component renders
  - **Then:** Centered in left column at 350px height container (unchanged from original)
  - **Validation:** Manual testing during mesh creation

- [ ] **Test: Modal interactions unchanged**
  - **Given:** "View Setup Instructions" modal triggered
  - **When:** User clicks modal button in error state
  - **Then:** Modal opens correctly, positioned properly over new layout
  - **Validation:** Manual testing of modal behavior

## Files to Modify

- [ ] `webview-ui/src/wizard/steps/ApiMeshStep.tsx` - Replace manual div structure with TwoColumnLayout

## Implementation Details

### BEFORE (Lines 162-481):

```tsx
return (
    <div style={{ display: 'flex', height: '100%', width: '100%', gap: '0' }}>
        {/* Left: Verification content area (max 800px) */}
        <div style={{
            maxWidth: '800px',
            width: '100%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0
        }}>
            <Heading level={2} marginBottom="size-300">API Mesh</Heading>
            <Text marginBottom="size-400">
                Verifying API Mesh API availability for your selected workspace.
            </Text>

            {isChecking ? (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <LoadingDisplay
                        size="L"
                        message={message}
                        subMessage={subMessage}
                        helperText={helperText}
                    />
                </Flex>
            ) : error ? (
                {/* ... error UI ... */}
            ) : meshData ? (
                {/* ... mesh exists UI ... */}
            ) : (
                {/* ... ready for creation UI ... */}
            )}
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
                <Heading level={2} marginBottom="size-300">API Mesh</Heading>
                <Text marginBottom="size-400">
                    Verifying API Mesh API availability for your selected workspace.
                </Text>

                {isChecking ? (
                    <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                        <LoadingDisplay
                            size="L"
                            message={message}
                            subMessage={subMessage}
                            helperText={helperText}
                        />
                    </Flex>
                ) : error ? (
                    {/* ... error UI ... */}
                ) : meshData ? (
                    {/* ... mesh exists UI ... */}
                ) : (
                    {/* ... ready for creation UI ... */}
                )}
            </>
        }
        rightContent={
            <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
        }
        leftMaxWidth="800px"
        leftPadding="24px"
        rightPadding="24px"
        gap="0"
    />
);
```

### Transformation Steps

1. **Import TwoColumnLayout**
   - Add import statement at top of file: `import { TwoColumnLayout } from '@/webview-ui/shared/components/layout/TwoColumnLayout';`
   - Verify TypeScript resolves import correctly (no errors)

2. **Extract left column content**
   - Copy everything between opening `<div style={{maxWidth: '800px'...}}>` (line 164) and its closing `</div>` (line 469)
   - Wrap in `<>...</>` fragment for leftContent prop
   - This includes:
     - Heading "API Mesh"
     - Description text
     - Conditional rendering: isChecking / error / meshData / ready states
     - All LoadingDisplay, error UI, success UI, and creation UI

3. **Extract right column content**
   - Copy `<ConfigurationSummary />` component (line 478)
   - Pass directly as rightContent prop

4. **Map style props to component props**
   - `maxWidth: '800px'` → `leftMaxWidth="800px"`
   - `padding: '24px'` (left) → `leftPadding="24px"`
   - `padding: '24px'` (right) → `rightPadding="24px"`
   - `gap: '0'` → `gap="0"` (explicit, though default)
   - Default values used:
     - `rightBackgroundColor` → uses default `var(--spectrum-global-color-gray-75)`
     - `showBorder` → uses default `true` (border-left: 1px solid gray-200)

5. **Remove manual div structure**
   - Delete outer container div (line 162)
   - Delete left column div (lines 164-171, closing at 469)
   - Delete right column div (lines 472-479)
   - Keep closing tag for component (line 481)

## Expected Outcome

**After Migration:**

- ApiMeshStep renders identically to original across all states
- Code reduced from ~320 lines to ~300 lines (~20 line reduction)
- Layout logic centralized in TwoColumnLayout component
- Spectrum token support available (size-300 = 24px) for future enhancements
- No TypeScript errors
- No browser console warnings

**Visual Verification Across States:**

1. **Checking State:**
   - 800px max-width on left column maintained
   - LoadingDisplay centered in 350px height container
   - ConfigurationSummary positioned correctly in right column
   - 24px padding on both columns
   - Gray background on right column
   - 1px gray border between columns

2. **API Not Enabled State:**
   - Error icon and message centered in left column
   - "View Setup Instructions" modal opens correctly
   - Retry and Back buttons positioned correctly
   - ConfigurationSummary unaffected

3. **Mesh Exists State:**
   - Success/warning icon centered
   - Status message displays correctly
   - "Recreate Mesh" button (if error state) positioned correctly
   - ConfigurationSummary displays current mesh info

4. **Ready for Creation State:**
   - Info icon centered
   - "Create Mesh" button positioned correctly
   - Description text wrapped properly
   - ConfigurationSummary shows pending status

5. **During Mesh Creation:**
   - Progress messages update correctly
   - LoadingDisplay remains centered
   - No layout shift during state transitions

## Acceptance Criteria

- [ ] TwoColumnLayout component imported correctly
- [ ] Left column content moved to leftContent prop (lines 172-468)
- [ ] Right column content moved to rightContent prop (ConfigurationSummary)
- [ ] Visual parity confirmed across all 5 mesh states (side-by-side comparison)
- [ ] No layout regressions (padding, spacing, colors identical)
- [ ] LoadingDisplay centered correctly in all states
- [ ] Modal interactions work identically
- [ ] TypeScript compiles without errors
- [ ] No browser console warnings/errors
- [ ] Progress updates during mesh creation display correctly
- [ ] ConfigurationSummary displays correctly in all states
- [ ] Manual div structure removed (lines 162-481 replaced)
- [ ] All interactive elements (buttons, modals) function identically

## State-Specific Testing Checklist

**Manual testing required for each state:**

- [ ] **Initial Load (Checking)**: Spinner centered, messages update, ConfigurationSummary on right
- [ ] **API Not Enabled**: Error message centered, modal opens, Retry/Back buttons work
- [ ] **Mesh Exists (Deployed)**: Success message centered, ConfigurationSummary shows mesh ID
- [ ] **Mesh Exists (Error)**: Warning message centered, Recreate button works, ConfigurationSummary shows error
- [ ] **Ready for Creation**: Info message centered, Create button works, ConfigurationSummary shows pending
- [ ] **During Creation**: Progress messages update, spinner centered, ConfigurationSummary updates on completion

## Dependencies

**No new dependencies** - TwoColumnLayout created in Step 3

## Estimated Time

**45-60 minutes**

- Code transformation: 10 minutes
- Visual validation (5 states): 25 minutes
- Testing edge cases (modals, progress updates): 15 minutes
- Documentation: 5 minutes

---

**Migration Notes:**

This is the second wizard step migration following Step 4's pattern. Key differences from AdobeProjectStep:

1. **More complex state management**: ApiMeshStep has 5 distinct UI states vs 2 in AdobeProjectStep
2. **Progress updates**: Live progress messages during mesh creation require validation
3. **Modal interactions**: "View Setup Instructions" modal needs testing
4. **Async operations**: Mesh creation/deletion operations need testing for layout stability

Pattern consistency with Step 4:
- Same import path
- Same prop mapping (leftMaxWidth, leftPadding, rightPadding, gap)
- Same removal of manual div structure
- Same manual visual validation approach

This migration validates that TwoColumnLayout handles complex, stateful content correctly and remains stable during async operations with progress updates.
