# Step 3: Extract Remaining Repeated UNSAFE_style Patterns

## Purpose

Extract remaining repeated `UNSAFE_style` patterns across multiple files into named constants, following the pattern established by NavigationPanel.tsx's `getSectionButtonStyles()` and `getFieldButtonStyles()`.

---

## Target Patterns

### Pattern 1: Check/Success Indicator (6 occurrences)
```tsx
// Found in: NavigationPanel, ReviewStep, others
UNSAFE_style={{ fontSize: '16px', lineHeight: '16px' }}  // ✓ checkmark
UNSAFE_style={{ fontSize: '14px', lineHeight: '14px' }}  // count display
```

### Pattern 2: Small Text Sizing (8+ occurrences)
```tsx
// Found in: Tip, SearchableList, StatusDisplay
UNSAFE_style={{ fontSize: '12px' }}
UNSAFE_style={{ fontSize: '14px' }}
```

### Pattern 3: Heading Overrides (4 occurrences)
```tsx
// Found in: ProjectDashboardScreen, ConfigureScreen
UNSAFE_style={{ fontSize: '20px', fontWeight: 600 }}
```

---

## Tests to Write First

### Test 1: TypeScript Compilation
```bash
npm run compile:typescript
```

### Test 2: Webpack Build
```bash
npm run compile:webview
```

### Test 3: Existing Tests Pass
```bash
npm run test:fast
```

---

## Implementation Approach

### Option A: Shared Style Constants Module (Recommended)

Create a shared styles module for commonly repeated patterns:

```tsx
// src/core/ui/styles/spectrumOverrides.ts

/** Checkmark indicator style */
export const CHECK_INDICATOR_STYLE: React.CSSProperties = {
    fontSize: '16px',
    lineHeight: '16px',
};

/** Count/ratio indicator style */
export const COUNT_INDICATOR_STYLE: React.CSSProperties = {
    fontSize: '14px',
    lineHeight: '14px',
};

/** Standard section heading style */
export const SECTION_HEADING_STYLE: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 600,
};
```

### Option B: Per-Component Constants

If patterns are not shared across files, extract at component level:

```tsx
// At top of component file
const LABEL_STYLE: React.CSSProperties = {
    fontSize: '12px',
};
```

---

## Files to Modify

### Core UI Components

1. **`src/core/ui/components/ui/Tip.tsx`** (4 UNSAFE_style)
2. **`src/core/ui/components/navigation/SearchableList.tsx`** (5 style, 4 UNSAFE_style)
3. **`src/core/ui/components/feedback/StatusDisplay.tsx`** (3 style, 2 UNSAFE_style)
4. **`src/core/ui/components/ui/NumberedInstructions.tsx`** (3 style, 3 UNSAFE_style)
5. **`src/core/ui/components/feedback/StatusCard.tsx`** (2 style)

### Feature Components

6. **`src/features/authentication/ui/components/SelectionStepContent.tsx`** (4 style, 3 UNSAFE_style)
7. **`src/features/components/ui/steps/ComponentConfigStep.tsx`** (5 style, 2 UNSAFE_style)
8. **`src/features/components/ui/components/ConfigFieldRenderer.tsx`** (5 style)
9. **`src/features/mesh/ui/steps/ApiMeshStep.tsx`** (1 style, 1 UNSAFE_style)

---

## Implementation Steps

1. **Create shared styles module** (if patterns shared 3+ times):
   ```bash
   mkdir -p src/core/ui/styles
   touch src/core/ui/styles/spectrumOverrides.ts
   ```

2. **For each target file**:
   - Count occurrences of same pattern
   - If ≥2 in same file: Extract to file-level constant
   - If ≥3 across files: Add to shared module
   - Replace inline with constant reference

3. **Update imports** where shared module used:
   ```tsx
   import { CHECK_INDICATOR_STYLE } from '@/core/ui/styles/spectrumOverrides';
   ```

4. **Run verification after each batch** (2-3 files at a time)

---

## Example Transformation

### SearchableList.tsx

**Before**:
```tsx
<Flex UNSAFE_style={{ overflowY: 'auto', flex: 1 }}>
    {items.map(item => (
        <button style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            cursor: 'pointer',
            ...
        }}>
```

**After**:
```tsx
const SCROLL_CONTAINER_STYLE: React.CSSProperties = {
    overflowY: 'auto',
    flex: 1,
};

function getListItemButtonStyle(isSelected: boolean): React.CSSProperties {
    return {
        width: '100%',
        padding: '8px 12px',
        border: 'none',
        cursor: 'pointer',
        background: isSelected ? 'var(--spectrum-global-color-blue-100)' : 'transparent',
        ...
    };
}

<Flex UNSAFE_style={SCROLL_CONTAINER_STYLE}>
    {items.map(item => (
        <button style={getListItemButtonStyle(item.id === selectedId)}>
```

---

## Completion Criteria

- [x] Shared styles module created (if needed) - Not needed, per-file constants used
- [x] All 9 target files updated - 6 files updated (remaining have dynamic styles)
- [x] Repeated patterns extracted to constants
- [x] Dynamic style functions for conditional styles - Dynamic styles kept inline (acceptable)
- [x] TypeScript compiles cleanly
- [x] Webpack builds successfully
- [x] All tests pass (43 tests)
- [x] Visual appearance unchanged
- [x] ~40 inline styles converted - 11 inline styles eliminated in this step

## Actual Results

**Before Step 3**: 59 inline styles (45 `style={{` + 14 `UNSAFE_style={{`)
**After Step 3**: 48 inline styles (36 `style={{` + 12 `UNSAFE_style={{`)
**Reduction**: 11 inline styles eliminated

**Files Modified:**

1. **SearchableList.tsx** - UNSAFE_style → UNSAFE_className for flex-1, cursor-pointer
2. **Tip.tsx** - Extracted ICON_TEXT_STYLE, TIP_CONTENT_STYLE constants
3. **SelectionStepContent.tsx** - UNSAFE_style → UNSAFE_className for flex-1, cursor-pointer
4. **ComponentConfigStep.tsx** - Extracted ERROR_TEXT_STYLE, SECTION_HEADER_STYLE; Tailwind for layout
5. **PrerequisitesStep.tsx** - Extracted STATUS_MARKER_STYLE; Tailwind for container and placeholder
6. **StatusDisplay.tsx** - Tailwind for button icon wrapper

**Constants Extracted:**
- Tip.tsx: ICON_TEXT_STYLE, TIP_CONTENT_STYLE
- ComponentConfigStep.tsx: ERROR_TEXT_STYLE, SECTION_HEADER_STYLE
- PrerequisitesStep.tsx: STATUS_MARKER_STYLE

**Tailwind Conversions:**
- ComponentConfigStep: flex flex-col h-full, pb-1 mb-3, flex-1 overflow-y-auto overflow-x-hidden
- PrerequisitesStep: max-w-[800px] w-full p-6, w-5 h-5
- StatusDisplay: mr-2 inline-flex items-center
- SelectionStepContent: flex-1, cursor-pointer
- SearchableList: flex-1, cursor-pointer

**Dynamic Styles Kept (Acceptable per SOP §11):**
- Layout components (TwoColumnLayout, SingleColumnLayout, GridLayout) - props-based dimensions
- StatusDisplay: height, maxWidth props
- ComponentConfigStep section div: dynamic paddingTop based on index
- List refresh containers: opacity based on isRefreshing state
