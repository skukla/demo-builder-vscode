# Step 4: Replace Hard-Coded Values in Components

## Purpose

Update React components to use semantic CSS variables instead of hard-coded colors. This step migrates 5 components to use the design token system created in Step 1.

**Why Now:** Tokens exist (Step 1), CSS cascade configured (Step 3). Components can now reference semantic variables.

---

## Prerequisites

- [ ] Step 1: tokens.css created with all semantic tokens
- [ ] Step 3: @layer declarations added to CSS files
- [ ] Project builds successfully

---

## Tests to Write First

### Visual Regression (Manual)

- [ ] **Test: StatusDot renders all variants correctly**
  - **Given:** StatusDot component with each variant (success, error, warning, info, neutral)
  - **When:** Rendered in webview
  - **Then:** Colors match previous hard-coded values exactly

- [ ] **Test: Badge renders all variants with correct bg/text colors**
  - **Given:** Badge component with each variant
  - **When:** Rendered in webview
  - **Then:** Background and text colors match previous appearance

- [ ] **Test: NumberedInstructions code snippets styled correctly**
  - **Given:** NumberedInstructions with quoted code
  - **When:** Rendered in webview
  - **Then:** Code background and border match previous dark theme

- [ ] **Test: Tip variants display correct backgrounds**
  - **Given:** Tip component with info and success variants
  - **When:** Rendered in webview
  - **Then:** Background tints and borders match previous appearance

- [ ] **Test: LoadingOverlay backdrop and text visible**
  - **Given:** LoadingOverlay with message
  - **When:** Displayed during loading
  - **Then:** Dark overlay and white text visible

---

## Files to Modify

- [ ] `src/core/ui/components/ui/StatusDot.tsx` - Replace 5 hard-coded hex values
- [ ] `src/core/ui/components/ui/Badge.tsx` - Replace 10 hard-coded color values
- [ ] `src/core/ui/components/ui/NumberedInstructions.tsx` - Replace 2 hard-coded values
- [ ] `src/core/ui/components/ui/Tip.tsx` - Replace 4 hard-coded rgba values
- [ ] `src/core/ui/components/feedback/LoadingOverlay.tsx` - Replace 3 hard-coded values

---

## Implementation Details

### RED Phase

Visual regression tests - verify current appearance before changes.

### GREEN Phase

**StatusDot.tsx** - Update `getColor()` switch statement:
```typescript
case 'success': return 'var(--db-status-dot-success)';
case 'error': return 'var(--db-status-dot-error)';
case 'warning': return 'var(--db-status-dot-warning)';
case 'info': return 'var(--db-status-dot-info)';
case 'neutral': return 'var(--db-status-dot-neutral)';
default: return 'var(--db-status-dot-neutral)';
```

**Badge.tsx** - Update `getStyles()` switch statement:
```typescript
case 'success': return {
    ...baseStyles,
    backgroundColor: 'var(--db-badge-success-bg)',
    color: 'var(--db-badge-success-text)'
};
// Similar for error, warning, info, neutral
```

**NumberedInstructions.tsx** - Update `CODE_SNIPPET_STYLES`:
```typescript
backgroundColor: 'var(--db-code-background)',
border: '1px solid var(--db-code-border)',
```

**Tip.tsx** - Update `getBackgroundColor()` and `getBorderColor()`:
```typescript
case 'info': return 'var(--db-tip-info-bg)';
case 'success': return 'var(--db-tip-success-bg)';
// Border functions similarly
```

**LoadingOverlay.tsx** - Update styles object:
```typescript
backgroundColor: 'var(--db-loading-overlay-bg)',
boxShadow: '0 4px 12px var(--db-loading-overlay-shadow)',
color: 'var(--db-loading-text)'
```

### REFACTOR Phase

1. Verify no duplicate token references
2. Ensure consistent variable naming pattern
3. Remove obsolete color comments (e.g., `// green-500`)

---

## Expected Outcome

- 5 components updated to use CSS variables
- 24 hard-coded color values replaced with semantic tokens
- Zero visual changes from previous appearance
- Components now theme-aware via centralized tokens

---

## Acceptance Criteria

- [ ] All hard-coded hex colors replaced with `var(--db-*)` references
- [ ] All hard-coded rgba colors replaced with token references
- [ ] Visual appearance identical to before migration
- [ ] No CSS parsing errors in browser console
- [ ] Build completes without TypeScript errors

---

## Dependencies from Other Steps

**Requires:**
- Step 1: tokens.css with all `--db-*` tokens
- Step 3: @layer declarations for proper cascade

**Enables:**
- Step 7: Final verification of theme consistency

---

## Estimated Time

**2-3 hours**

- StatusDot + Badge: 45 minutes
- NumberedInstructions + Tip: 45 minutes
- LoadingOverlay: 30 minutes
- Visual regression testing: 1 hour
