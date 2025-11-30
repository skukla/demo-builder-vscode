# Step 7: Migrate ComponentConfigStep to TwoColumnLayout

## Purpose

Replace manual two-column div implementation in ComponentConfigStep with TwoColumnLayout component, eliminating ~50 lines of duplicate layout code while preserving complex navigation and scrolling behavior.

## Prerequisites

- [ ] Step 3 completed (TwoColumnLayout exists with token support)
- [ ] TwoColumnLayout component available at `webview-ui/src/shared/components/layout/TwoColumnLayout.tsx`

## Tests to Write First

**Manual Visual Validation** (no automated tests for layout migration):

- [ ] **Test: Visual parity with original implementation**
  - **Given:** ComponentConfigStep rendered with multiple service groups (Adobe Commerce, Catalog Service, API Mesh)
  - **When:** Component loads with left column (settings form) and right column (navigation panel)
  - **Then:** Layout appears identical to original (800px left max-width, 24px padding, gray background on right, border between columns)
  - **Validation:** Side-by-side browser comparison before/after migration

- [ ] **Test: Scrolling behavior preserved**
  - **Given:** Form with 15+ fields across multiple service groups
  - **When:** User scrolls within left column (form) and right column (navigation)
  - **Then:** Each column scrolls independently, overflow handling unchanged
  - **Validation:** Manual scroll testing in both columns

- [ ] **Test: Navigation highlighting and auto-scroll functional**
  - **Given:** User tabs through form fields across multiple sections
  - **When:** Focus moves from field to field (e.g., Adobe Commerce → Catalog Service)
  - **Then:** Navigation panel auto-expands sections, highlights active field, scrolls to show active item
  - **Validation:** Manual tab navigation testing

- [ ] **Test: Navigation click-to-navigate functional**
  - **Given:** User clicks section header or field name in right navigation panel
  - **When:** Click event triggers
  - **Then:** Left column scrolls to corresponding section/field, input receives focus
  - **Validation:** Manual click testing on navigation items

- [ ] **Test: Responsive behavior unchanged**
  - **Given:** Browser window resized to various widths
  - **When:** Width changes from 1400px → 1000px → 800px
  - **Then:** Layout adjusts identically to original implementation
  - **Validation:** Manual resize testing

- [ ] **Test: Form functionality unchanged**
  - **Given:** User fills out configuration fields (text, password, select, checkbox)
  - **When:** User types, selects, and toggles fields
  - **Then:** All form interactions work identically, validation triggers correctly
  - **Validation:** Manual form interaction testing

## Files to Modify

- [ ] `webview-ui/src/wizard/steps/ComponentConfigStep.tsx` - Replace manual div structure with TwoColumnLayout

## Implementation Details

### BEFORE (Lines 806-994):

```tsx
return (
    <div style={{ display: 'flex', height: '100%', width: '100%', gap: '0', overflow: 'hidden' }}>
        {/* Left: Settings Configuration */}
        <div style={{
            maxWidth: '800px',
            width: '100%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            overflow: 'hidden'
        }}>
            <Heading level={2} marginBottom="size-300">Settings Collection</Heading>
            <Text marginBottom="size-300" UNSAFE_className="text-gray-700">
                Configure the settings for your selected components. Required fields are marked with an asterisk.
            </Text>
            {/* ... form content ... */}
        </div>

        {/* Right: Navigation Panel */}
        <div style={{
            flex: '1',
            padding: '24px',
            backgroundColor: 'var(--spectrum-global-color-gray-75)',
            borderLeft: '1px solid var(--spectrum-global-color-gray-200)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            <Heading level={3} marginBottom="size-200">Configuration</Heading>
            {/* ... navigation content ... */}
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
                <Heading level={2} marginBottom="size-300">Settings Collection</Heading>
                <Text marginBottom="size-300" UNSAFE_className="text-gray-700">
                    Configure the settings for your selected components. Required fields are marked with an asterisk.
                </Text>

                {isLoading ? (
                    <Flex justifyContent="center" alignItems="center" height="350px">
                        <LoadingDisplay
                            size="L"
                            message="Loading component configurations..."
                        />
                    </Flex>
                ) : serviceGroups.length === 0 ? (
                    <Text UNSAFE_className="text-gray-600">
                        No components requiring configuration were selected.
                    </Text>
                ) : (
                    <Form UNSAFE_style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        {/* ... form fields ... */}
                    </Form>
                )}
            </>
        }
        rightContent={
            <>
                <Heading level={3} marginBottom="size-200">Configuration</Heading>

                <Flex direction="column" gap="size-150" UNSAFE_style={{ overflowY: 'auto', flex: 1 }}>
                    {serviceGroups.map((group) => {
                        // ... navigation rendering ...
                    })}
                </Flex>
            </>
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
   - Add import statement at top of file (after React/Spectrum imports)
   - Verify TypeScript resolves import correctly

2. **Extract left column content**
   - Copy everything between opening `<div style={{maxWidth: '800px'...}}>` (line 809) and its closing `</div>` (line 871)
   - Wrap in `<>...</>` fragment for leftContent prop
   - Preserve all existing elements: Heading, Text, loading state, empty state, Form

3. **Extract right column content**
   - Copy everything between opening `<div style={{flex: '1'...}}>` (line 874) and its closing `</div>` (line 992)
   - Wrap in `<>...</>` fragment for rightContent prop
   - Preserve all existing elements: Heading, navigation flex container

4. **Map style props to component props**
   - `maxWidth: '800px'` → `leftMaxWidth="800px"`
   - `padding: '24px'` (left) → `leftPadding="24px"`
   - `padding: '24px'` (right) → `rightPadding="24px"`
   - `gap: '0'` → `gap="0"` (explicit, though default)
   - `overflow: 'hidden'` handled internally by TwoColumnLayout

5. **Preserve critical overflow styles**
   - Left column: `<Form UNSAFE_style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>` remains unchanged
   - Right column: `<Flex ... UNSAFE_style={{ overflowY: 'auto', flex: 1 }}>` remains unchanged
   - These control internal scrolling within each column

6. **Remove manual div structure**
   - Delete outer container div (line 807, 994)
   - Delete left column div (lines 808-817, 871)
   - Delete right column div (lines 873-882, 992)

7. **Verify TypeScript compilation**
   - Run `npm run build` or watch mode
   - Confirm no type errors

## Expected Outcome

**After Migration:**

- ComponentConfigStep renders identically to original
- Code reduced from ~188 lines (return statement) to ~170 lines (~18 line reduction)
- Layout logic centralized in TwoColumnLayout component
- Spectrum token support available (size-300 = 24px)
- No TypeScript errors
- No browser console warnings

**Visual Verification:**

- 800px max-width on left column maintained
- 24px padding on both columns maintained
- Gray background (#F5F5F5) on right column
- 1px gray border between columns
- Independent scrolling in left (form) and right (navigation) columns
- Navigation highlighting and auto-scroll functional
- Click-to-navigate from navigation panel works
- Form validation and interactions unchanged

**Functional Verification:**

- Tab navigation through fields triggers navigation highlighting
- Section headers auto-expand on field focus
- Navigation scrolls to show active section/field
- Clicking navigation items scrolls and focuses corresponding field
- Form submission blocked correctly when required fields empty
- All field types (text, password, select, checkbox) functional

## Acceptance Criteria

- [ ] TwoColumnLayout component imported correctly
- [ ] Left column content moved to leftContent prop (wrapped in fragment)
- [ ] Right column content moved to rightContent prop (wrapped in fragment)
- [ ] Internal UNSAFE_style props preserved (flex, overflowY for scrolling)
- [ ] Visual parity confirmed (side-by-side comparison)
- [ ] No layout regressions (padding, spacing, colors identical)
- [ ] Scrolling behavior identical (independent column scrolling)
- [ ] Navigation highlighting functional (active section/field highlighted)
- [ ] Navigation auto-scroll functional (tab navigation triggers scroll)
- [ ] Click-to-navigate functional (navigation items scroll to fields)
- [ ] Form validation unchanged (required fields checked correctly)
- [ ] TypeScript compiles without errors
- [ ] No browser console warnings/errors
- [ ] Manual div structure removed (lines 807-994 replaced with TwoColumnLayout)

## Dependencies

**No new dependencies** - TwoColumnLayout created in Step 3

## Estimated Time

**45-60 minutes**

- Code transformation: 15 minutes
- Visual validation: 20 minutes (multiple test cases - layout, scrolling, navigation)
- Functional validation: 15 minutes (tab navigation, click navigation, form interactions)
- Refinement if needed: 10 minutes

---

**Migration Pattern Notes:**

This step is more complex than previous migrations due to:

1. **Dual scrolling regions**: Both columns have independent scroll containers
2. **Complex navigation logic**: Auto-scroll, auto-expand, click-to-navigate, highlighting
3. **Focus management**: Focus listeners drive navigation state

**Critical preservation requirements**:

- Internal `UNSAFE_style` props for flex/overflow must be preserved (TwoColumnLayout handles outer structure only)
- Focus event listeners remain unchanged (control navigation behavior)
- Navigation state management unchanged (activeSection, activeField, expandedNavSections)

**Testing priority**:

1. Visual parity (most critical - ensure layout identical)
2. Scrolling behavior (independent column scrolling)
3. Navigation highlighting (active section/field visual feedback)
4. Navigation auto-scroll (scroll-on-focus behavior)
5. Click-to-navigate (navigation panel interaction)
6. Form validation (required field checking)

**If issues arise**:

- Check that internal UNSAFE_style props are preserved
- Verify focus listeners still fire correctly
- Confirm navigation element IDs unchanged (`nav-${group.id}`, `nav-field-${field.key}`, etc.)
- Test with browser DevTools open to catch console errors

---

**Follows migration pattern established in Step 4 (AdobeProjectStep).**
