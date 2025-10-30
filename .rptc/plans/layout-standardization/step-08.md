# Step 8: Migrate ConfigureScreen to TwoColumnLayout

## Purpose

Replace manual two-column div implementation in ConfigureScreen with TwoColumnLayout component, eliminating ~60 lines of duplicate layout code. ConfigureScreen uses a two-column layout for configuration settings (left) and navigation panel (right), identical to the pattern in wizard steps.

## Prerequisites

- [ ] Step 3 completed (TwoColumnLayout exists with token support)
- [ ] TwoColumnLayout component available at `webview-ui/src/shared/components/layout/TwoColumnLayout.tsx`
- [ ] Step 4 pattern established (first migration reference)

## Tests to Write First

**Manual Visual Validation** (no automated tests for layout migration):

- [ ] **Test: Visual parity with original implementation**
  - **Given:** ConfigureScreen rendered with multiple service groups (Adobe Commerce, Catalog Service, etc.)
  - **When:** Component loads with left column (configuration form) and right column (NavigationPanel)
  - **Then:** Layout appears identical to original (800px left max-width, 24px padding on both columns, gray background on right, border between columns)
  - **Validation:** Side-by-side browser comparison before/after migration

- [ ] **Test: Scrolling behavior unchanged**
  - **Given:** Long configuration form (8+ service groups with multiple fields each)
  - **When:** User scrolls within Form (left column)
  - **Then:** Left column scrolls independently, NavigationPanel remains visible on right
  - **Validation:** Manual scroll testing with multi-group configuration

- [ ] **Test: Navigation panel interactions work**
  - **Given:** NavigationPanel with expandable sections
  - **When:** User clicks section headers, navigates to fields
  - **Then:** Navigation functions identically (expand/collapse, field highlighting, scroll sync)
  - **Validation:** Click through all navigation interactions

- [ ] **Test: Responsive behavior unchanged**
  - **Given:** Browser window resized to various widths
  - **When:** Width changes from 1400px → 1000px → 800px
  - **Then:** Layout adjusts identically to original implementation
  - **Validation:** Manual resize testing

- [ ] **Test: Footer positioning unchanged**
  - **Given:** Footer with Save/Cancel buttons below two-column content
  - **When:** Component renders and user scrolls
  - **Then:** Footer remains at bottom (not part of TwoColumnLayout), buttons aligned with left content
  - **Validation:** Visual check footer remains outside layout component

## Files to Modify

- [ ] `webview-ui/src/configure/ConfigureScreen.tsx` - Replace manual div structure with TwoColumnLayout (lines 588-656)

## Implementation Details

### BEFORE (Lines 588-656):

```tsx
{/* Content */}
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
        <Heading level={2} marginBottom="size-300">Configuration Settings</Heading>
        <Text marginBottom="size-300" UNSAFE_className="text-gray-700">
            Update the settings for your project components. Required fields are marked with an asterisk.
        </Text>

        {serviceGroups.length === 0 ? (
            <Text UNSAFE_className="text-gray-600">
                No components requiring configuration were found.
            </Text>
        ) : (
            <Form UNSAFE_style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                {serviceGroups.map((group, index) => (
                    <ConfigSection
                        key={group.id}
                        id={group.id}
                        label={group.label}
                        showDivider={index > 0}
                    >
                        {/* ... field rendering ... */}
                    </ConfigSection>
                ))}
            </Form>
        )}
    </div>

    {/* Right: Navigation Panel */}
    <NavigationPanel
        sections={navigationSections}
        activeSection={activeSection}
        activeField={activeField}
        expandedSections={expandedNavSections}
        onToggleSection={toggleNavSection}
        onNavigateToField={navigateToField}
    />
</div>
```

### AFTER (Simplified):

```tsx
import { TwoColumnLayout } from '@/webview-ui/shared/components/layout/TwoColumnLayout';

// ... rest of component code ...

{/* Content */}
<TwoColumnLayout
    leftContent={
        <>
            <Heading level={2} marginBottom="size-300">Configuration Settings</Heading>
            <Text marginBottom="size-300" UNSAFE_className="text-gray-700">
                Update the settings for your project components. Required fields are marked with an asterisk.
            </Text>

            {serviceGroups.length === 0 ? (
                <Text UNSAFE_className="text-gray-600">
                    No components requiring configuration were found.
                </Text>
            ) : (
                <Form UNSAFE_style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                    {serviceGroups.map((group, index) => (
                        <ConfigSection
                            key={group.id}
                            id={group.id}
                            label={group.label}
                            showDivider={index > 0}
                        >
                            {group.fields.map(field => {
                                const value = getFieldValue(field);
                                const error = validationErrors[field.key];
                                const showError = error && touchedFields.has(field.key);
                                const hasDefault = value && field.default && value === field.default;

                                return (
                                    <FormField
                                        key={field.key}
                                        fieldKey={field.key}
                                        label={field.label}
                                        type={field.type as any}
                                        value={value !== undefined && value !== null ? String(value) : ''}
                                        onChange={(val) => updateField(field, val)}
                                        placeholder={field.placeholder}
                                        description={field.description}
                                        required={field.required}
                                        error={error}
                                        showError={!!showError}
                                        options={field.options}
                                        selectableDefaultProps={hasDefault ? selectableDefaultProps : undefined}
                                    />
                                );
                            })}
                        </ConfigSection>
                    ))}
                </Form>
            )}
        </>
    }
    rightContent={
        <NavigationPanel
            sections={navigationSections}
            activeSection={activeSection}
            activeField={activeField}
            expandedSections={expandedNavSections}
            onToggleSection={toggleNavSection}
            onNavigateToField={navigateToField}
        />
    }
    leftMaxWidth="800px"
    leftPadding="size-300"
    rightPadding="size-300"
    gap="0"
/>
```

### Transformation Steps

1. **Import TwoColumnLayout**
   - Add import statement at top of file (after existing layout imports)
   - Verify TypeScript resolves import correctly: `import { TwoColumnLayout } from '@/webview-ui/shared/components/layout/TwoColumnLayout';`

2. **Extract left column content**
   - Copy everything from line 599 (`<Heading level={2}...`) through line 644 (`</Form>`)
   - Includes: Heading, Text description, conditional rendering (empty state OR Form with ConfigSections)
   - Wrap in `<>...</>` fragment for leftContent prop
   - **Note:** Keep `UNSAFE_style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}` on Form (internal scrolling)

3. **Extract right column content**
   - Copy `<NavigationPanel />` component (lines 647-655)
   - Pass directly as rightContent prop (no wrapper needed)

4. **Map style props to component props**
   - Outer container `display: 'flex', height: '100%', width: '100%', gap: '0', overflow: 'hidden'` → Handled by TwoColumnLayout internally
   - Left column `maxWidth: '800px'` → `leftMaxWidth="800px"`
   - Left column `padding: '24px'` → `leftPadding="size-300"` (use Spectrum token)
   - Right column `padding: '24px'` → `rightPadding="size-300"` (use Spectrum token)
   - Left column `overflow: 'hidden'` → Handled by TwoColumnLayout `minWidth: 0`
   - Gap `gap: '0'` → `gap="0"` (explicit, though default)
   - **Note:** Right column background and border handled by TwoColumnLayout defaults

5. **Remove manual div structure**
   - Delete outer container div (line 588)
   - Delete left column div (lines 590-598, 645)
   - Delete manual right column wrapper (NavigationPanel is standalone, no wrapper to remove)
   - Delete closing divs (line 656)

6. **Verify footer unchanged**
   - Footer (lines 658-683) remains OUTSIDE TwoColumnLayout (should still be direct child of outer View)
   - No changes needed to footer structure

## Expected Outcome

**After Migration:**

- ConfigureScreen renders identically to original
- Code reduced from ~687 lines to ~640 lines (~47 line reduction from layout consolidation)
- Layout logic centralized in TwoColumnLayout component
- Spectrum token support available (size-300 = 24px)
- No TypeScript errors
- No browser console warnings

**Visual Verification:**

- 800px max-width on left column maintained
- 24px padding on both columns maintained
- Gray background (#F5F5F5) on right column
- 1px gray border between columns
- NavigationPanel positioned correctly on right
- Form scrolling works identically (internal scroll container preserved)
- Footer aligned with left content area (800px constraint)
- Navigation interactions (expand/collapse, field highlighting) unchanged

## Acceptance Criteria

- [ ] TwoColumnLayout component imported correctly
- [ ] Left column content moved to leftContent prop (includes Heading, Text, Form with all ConfigSections)
- [ ] Right column content moved to rightContent prop (NavigationPanel)
- [ ] Form internal scrolling preserved (`UNSAFE_style` on Form element kept)
- [ ] Footer remains outside TwoColumnLayout (positioned below two-column content)
- [ ] Visual parity confirmed (side-by-side comparison with before state)
- [ ] No layout regressions (padding, spacing, colors, scrolling identical)
- [ ] Navigation panel fully functional (section toggle, field navigation, scroll sync)
- [ ] TypeScript compiles without errors
- [ ] No browser console warnings/errors
- [ ] Configuration form interactions still work (field editing, validation, save/cancel)
- [ ] Manual div structure removed (lines 588-656 replaced)

## Risk Mitigation

**Risk:** NavigationPanel scroll synchronization might break if layout structure changes

**Mitigation:**
- NavigationPanel uses getElementById for scroll targets (DOM IDs unchanged)
- TwoColumnLayout maintains same DOM hierarchy (direct parent-child relationships)
- Test all navigation interactions explicitly during validation

**Risk:** Form internal scrolling might not work if flexbox context changes

**Mitigation:**
- Preserve `UNSAFE_style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}` on Form element
- TwoColumnLayout left column uses `display: flex, flexDirection: column` (same as original)
- Test scrolling with long form (8+ service groups) during validation

## Dependencies

**No new dependencies** - TwoColumnLayout created in Step 3

## Estimated Time

**45-60 minutes**

- Code transformation: 15 minutes
- Visual validation: 20 minutes (comprehensive testing of form, navigation, scrolling)
- Refinement if needed: 15 minutes
- Documentation: 10 minutes

---

**Migration Pattern Notes:**

This is the third view migration (after Step 4: AdobeProjectStep, Step 6: ComponentSelectionStep). ConfigureScreen has additional complexity:

1. **Internal scrolling preservation**: Form has `flex: 1, overflowY: auto` for internal scroll container
2. **Navigation synchronization**: NavigationPanel scroll sync must continue working
3. **Footer positioning**: Footer must remain outside TwoColumnLayout (unlike wizard steps with Continue buttons inside left content)

Pattern consistency maintained:
1. Import TwoColumnLayout
2. Extract left/right content to separate props
3. Map inline styles to component props (using tokens where available)
4. Remove manual div structure
5. Manual visual validation (before/after comparison)

**Testing Priority: HIGH** - ConfigureScreen has most complex interactions (navigation sync, form scrolling, field validation) of all migrations.
