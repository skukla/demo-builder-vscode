# Step 2: Migrate Container Layout Styles to Tailwind

## Purpose

Replace inline container layout styles with Tailwind CSS classes. These are static styles that should use Tailwind for better performance and maintainability.

---

## Target Files

1. `src/core/ui/components/navigation/NavigationPanel.tsx` - Container div styles
2. `src/features/project-creation/ui/steps/ReviewStep.tsx` - Layout containers
3. `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` - Flex containers
4. `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Layout wrappers
5. `src/features/dashboard/ui/configure/ConfigureScreen.tsx` - Page layout

---

## Style Migration Map

| Inline Style | Tailwind Class |
|--------------|----------------|
| `display: 'flex'` | `flex` |
| `flexDirection: 'column'` | `flex-col` |
| `flexDirection: 'row'` | `flex-row` |
| `alignItems: 'center'` | `items-center` |
| `alignItems: 'flex-start'` | `items-start` |
| `justifyContent: 'center'` | `justify-center` |
| `justifyContent: 'space-between'` | `justify-between` |
| `width: '100%'` | `w-full` |
| `height: '100%'` | `h-full` |
| `height: '100vh'` | `h-screen` |
| `overflow: 'hidden'` | `overflow-hidden` |
| `overflowY: 'auto'` | `overflow-y-auto` |
| `flex: '1'` | `flex-1` |
| `gap: '4px'` | `gap-1` |
| `gap: '8px'` | `gap-2` |
| `padding: '12px'` | `p-3` |
| `padding: '24px'` | `p-6` |
| `marginTop: '4px'` | `mt-1` |
| `marginLeft: '12px'` | `ml-3` |
| `borderRadius: '4px'` | `rounded` |

---

## Tests to Write First

### Test 1: TypeScript Compilation
```bash
npm run compile:typescript
# Expected: Exit code 0
```

### Test 2: Webpack Build
```bash
npm run compile:webview
# Expected: Successful build
```

### Test 3: Tailwind Class Availability
```bash
# Verify Tailwind config includes required classes
# Check tailwind.config.js for any custom configuration
```

---

## File-by-File Changes

### NavigationPanel.tsx

**Before**:
```tsx
<div style={{
    flex: '1',
    padding: '24px',
    backgroundColor: 'var(--spectrum-global-color-gray-75)',
    borderLeft: '1px solid var(--spectrum-global-color-gray-200)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
}}>
```

**After**:
```tsx
// Extract non-Tailwind styles to constant
const NAVIGATION_PANEL_STYLE: React.CSSProperties = {
    backgroundColor: 'var(--spectrum-global-color-gray-75)',
    borderLeft: '1px solid var(--spectrum-global-color-gray-200)',
};

<div
    className="flex-1 p-6 flex flex-col overflow-hidden"
    style={NAVIGATION_PANEL_STYLE}
>
```

### Nested div styles

**Before**:
```tsx
<div style={{
    marginTop: '4px',
    marginLeft: '12px',
    paddingLeft: '12px',
    borderLeft: '2px solid var(--spectrum-global-color-gray-300)'
}}>
```

**After**:
```tsx
const FIELD_LIST_STYLE: React.CSSProperties = {
    borderLeft: '2px solid var(--spectrum-global-color-gray-300)',
};

<div className="mt-1 ml-3 pl-3" style={FIELD_LIST_STYLE}>
```

---

## Implementation Steps

1. **For each target file**:
   - Identify all `style={{...}}` on container divs
   - Separate Tailwind-compatible styles from CSS variable styles
   - Convert Tailwind-compatible to className
   - Extract remaining to named constant

2. **Pattern to follow**:
   ```tsx
   // Step 1: Identify inline style
   style={{ display: 'flex', flexDirection: 'column', gap: '8px',
            backgroundColor: 'var(--spectrum-color)' }}

   // Step 2: Separate Tailwind from CSS vars
   className="flex flex-col gap-2"
   style={{ backgroundColor: 'var(--spectrum-color)' }}

   // Step 3: Extract remaining to constant if >2 properties
   const CONTAINER_STYLE: React.CSSProperties = {
       backgroundColor: 'var(--spectrum-global-color-gray-75)',
   };
   className="flex flex-col gap-2"
   style={CONTAINER_STYLE}
   ```

3. **Run verification after each file**

---

## Files to Modify

1. `NavigationPanel.tsx` - ~3 inline styles
2. `ReviewStep.tsx` - ~6 inline styles
3. `ProjectCreationStep.tsx` - ~6 inline styles
4. `WizardContainer.tsx` - ~5 inline styles
5. `ConfigureScreen.tsx` - ~5 inline styles

---

## Completion Criteria

- [x] NavigationPanel.tsx uses Tailwind + extracted constants
- [x] ReviewStep.tsx uses Tailwind + extracted constants
- [x] ProjectCreationStep.tsx uses Tailwind + extracted constants
- [x] WizardContainer.tsx uses Tailwind + extracted constants
- [x] ConfigureScreen.tsx uses Tailwind + extracted constants
- [x] TypeScript compiles cleanly
- [x] Webpack builds successfully
- [x] Visual appearance unchanged
- [x] ~25 inline styles migrated to Tailwind

## Actual Results

**Before**: 39 inline style occurrences across 5 files
**After**: 0 inline style occurrences
**Reduction**: 39 inline styles eliminated (100%)

**Constants extracted:**
- NavigationPanel: 4 (PANEL_CONTAINER_STYLE, FIELD_LIST_BORDER_STYLE, CHECK_INDICATOR_STYLE, COUNT_INDICATOR_STYLE)
- ReviewStep: 5 (STATUS_TEXT_STYLE, PROJECT_NAME_STYLE, COMPONENT_NAME_STYLE, CHILD_ARROW_STYLE, CHILD_TEXT_STYLE)
- ProjectCreationStep: 1 (FOOTER_STYLE)
- ConfigureScreen: 1 (CONTAINER_BG_STYLE)
- WizardContainer: Already had LOADING_OVERLAY_STYLES

**Tailwind migrations:**
- Layout: flex, flex-col, flex-1, h-full, w-full, h-screen
- Overflow: overflow-hidden, overflow-y-auto, overflow-x-hidden
- Spacing: p-4, p-6, mt-1, ml-3, pl-3
- Width: max-w-[800px]
- Position: relative
