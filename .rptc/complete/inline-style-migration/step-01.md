# Step 1: Extract Repeated Icon Label Styles in ProjectDashboardScreen

## Purpose

Extract the most egregious SOP violation: 11 identical `UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}` inline styles for button labels in ProjectDashboardScreen.tsx.

This single file has 29 inline style occurrences (highest impact).

---

## Current State

```tsx
// REPEATED 11 TIMES - violates SOP §11
<ActionButton onPress={handleStartDemo} isQuiet>
    <PlayCircle size="L" />
    <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Start</Text>
</ActionButton>

<ActionButton onPress={handleStopDemo} isQuiet>
    <StopCircle size="L" />
    <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Stop</Text>
</ActionButton>

// ... 9 more identical patterns
```

---

## Target State

```tsx
// Style constant extracted once at top of file
const ICON_BUTTON_LABEL_STYLE: React.CSSProperties = {
    fontSize: '12px',
    marginTop: '4px',
};

// Clean, DRY usage
<ActionButton onPress={handleStartDemo} isQuiet>
    <PlayCircle size="L" />
    <Text UNSAFE_style={ICON_BUTTON_LABEL_STYLE}>Start</Text>
</ActionButton>

<ActionButton onPress={handleStopDemo} isQuiet>
    <StopCircle size="L" />
    <Text UNSAFE_style={ICON_BUTTON_LABEL_STYLE}>Stop</Text>
</ActionButton>
```

---

## Tests to Write First

### Test 1: TypeScript Compilation
```bash
# Run TypeScript compiler
npm run compile:typescript

# Expected: Exit code 0, no errors
```

### Test 2: Webpack Build
```bash
# Build webview bundle
npm run compile:webview

# Expected: Successful build, all bundles generated
```

### Test 3: Visual Baseline Verification
```bash
# Run extension in development mode
# Navigate to Project Dashboard
# Verify button labels are styled correctly:
#   - Font size: 12px
#   - Margin top: 4px
#   - Text appears below icon
```

---

## Files to Modify

1. **`src/features/dashboard/ui/ProjectDashboardScreen.tsx`**
   - Add `ICON_BUTTON_LABEL_STYLE` constant at top
   - Replace all 11 inline `UNSAFE_style` with constant reference
   - Also extract container styles to constant

---

## Implementation Steps

1. **Add style constants at top of file** (after imports):
   ```tsx
   /** Shared style for icon button labels (SOP §11 compliant) */
   const ICON_BUTTON_LABEL_STYLE: React.CSSProperties = {
       fontSize: '12px',
       marginTop: '4px',
   };

   /** Container layout styles */
   const DASHBOARD_CONTAINER_STYLE: React.CSSProperties = {
       padding: 'var(--spectrum-global-dimension-size-400)',
       height: '100vh',
       maxWidth: '500px',
       margin: '0 auto',
       display: 'flex',
       alignItems: 'center',
       justifyContent: 'center',
   };
   ```

2. **Replace all inline styles with constants**:
   - Find all `UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}`
   - Replace with `UNSAFE_style={ICON_BUTTON_LABEL_STYLE}`
   - Find container div style
   - Replace with `style={DASHBOARD_CONTAINER_STYLE}`

3. **Also extract ProgressCircle style**:
   ```tsx
   const SMALL_PROGRESS_STYLE: React.CSSProperties = {
       width: '16px',
       height: '16px',
   };
   ```

4. **Run verification**:
   - `npm run compile:typescript`
   - `npm run compile:webview`
   - Test in extension host

---

## Expected Outcome

**Before**: 29 inline style occurrences
**After**: ~15 inline style occurrences (dynamic values + Heading style)

**Reduction**: ~14 inline styles removed from this file alone

---

## Completion Criteria

- [x] `ICON_BUTTON_LABEL_STYLE` constant extracted
- [x] `DASHBOARD_CONTAINER_STYLE` constant extracted
- [x] `SMALL_PROGRESS_STYLE` constant extracted
- [x] `SECTION_HEADING_STYLE` constant extracted (additional)
- [x] `SIGN_IN_BUTTON_STYLE` constant extracted (additional)
- [x] All 11 button label styles use constant
- [x] Container div uses constant
- [x] ProgressCircle uses constant
- [x] TypeScript compiles cleanly
- [x] Webpack builds successfully
- [x] Visual appearance unchanged in VS Code webview

## Actual Results

**Before**: 29 inline style occurrences (15 `style={{` + 14 `UNSAFE_style={{`)
**After**: 0 inline style occurrences
**Reduction**: 29 inline styles eliminated (100%)

**Additional improvements:**
- Converted Flex `width: '100%'` to Tailwind `UNSAFE_className="w-full"`
- Extracted 5 style constants total (exceeding original 3)
