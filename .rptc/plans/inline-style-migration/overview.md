# Inline Style Migration - SOP §11 Compliance

**Status**: In Progress (Reset after incorrect approach)
**Created**: 2025-11-28
**SOP Reference**: §11 Minimize Inline Styles

---

## Summary

Refactor inline style objects to follow SOP §11 compliance. This addresses 99+ inline style occurrences across 31 TSX files where static styles are recreated on every render instead of using utility classes.

**Problems with Current State**:
1. **Performance**: Style objects recreated every render
2. **No pseudo-selectors**: Cannot use `:hover`, `:focus` states with inline styles
3. **Maintenance burden**: Styles scattered across components, hard to maintain consistency
4. **SOP Violation**: §11 explicitly requires minimizing inline styles

**Initial State**: 99 `style={{` + 47 `UNSAFE_style={{` = 146 inline style occurrences
**Target State**: Reduce to ~40 (dynamic values only)

---

## Critical Context

### ⚠️ This Project Does NOT Use Tailwind

This project uses **Adobe Spectrum** with a custom utility class system:
- **Utility classes defined in**: `src/core/ui/styles/custom-spectrum.css`
- **Class naming differs from Tailwind**: e.g., `flex-column` not `flex-col`
- **CSS variables work in utility classes**: Add them to custom-spectrum.css

### Previous Attempt (REVERTED)

The first implementation attempt incorrectly assumed Tailwind CSS was available:
- Used non-existent classes like `flex-col`, `p-6`, `max-w-[800px]`
- Broke layouts across the application
- All changes reverted via `git checkout -- .`

### Correct Approach

1. **Check `custom-spectrum.css`** for existing utility classes first
2. **Add missing utility classes** to `custom-spectrum.css` for repeated patterns
3. **Use `UNSAFE_className`** for Spectrum components (official API)
4. **Keep inline styles** only for truly dynamic values (props/state dependent)

---

## Available Utility Classes

Check `src/core/ui/styles/custom-spectrum.css` for the full list. Key classes:

| Category | Available Classes |
|----------|-------------------|
| **Layout** | `flex`, `flex-column`, `flex-1`, `items-center`, `justify-between`, `h-full`, `w-full` |
| **Spacing** | `p-2` to `p-5`, `px-3`, `px-4`, `py-2`, `py-3`, `m-0`, `mb-1` to `mb-5`, `mt-1`, `mt-2` |
| **Text** | `text-xs` to `text-5xl`, `font-normal`, `font-medium`, `font-semibold`, `font-bold` |
| **Colors** | `text-gray-500` to `text-gray-800`, `bg-gray-50` to `bg-gray-100` |
| **Border** | `border`, `border-t`, `border-b`, `rounded`, `rounded-lg` |
| **Width** | `w-3`, `w-4`, `w-6`, `max-w-800`, `max-w-600` |

### Classes That Need To Be Added

Based on usage patterns found in the codebase:

```css
/* Missing spacing */
.p-6 { padding: 24px !important; }
.pt-1 { padding-top: 4px !important; }
.pb-1 { padding-bottom: 4px !important; }
.mr-2 { margin-right: 8px !important; }

/* Missing layout */
.shrink-0 { flex-shrink: 0 !important; }

/* Missing dimensions */
.w-5 { width: 20px !important; }
.h-5 { height: 20px !important; }

/* Missing scroll */
.scroll-mt-4 { scroll-margin-top: 16px !important; }
.-scroll-mt-4 { scroll-margin-top: -16px !important; }
```

---

## Implementation Steps

| Step | Description | Files | Status |
|------|-------------|-------|--------|
| 0 | Add missing utility classes to custom-spectrum.css | 1 file | 🔄 In Progress |
| 1 | Migrate ProjectDashboardScreen (highest impact) | 1 file | ⏳ Pending |
| 2 | Migrate NavigationPanel, ReviewStep | 2 files | ⏳ Pending |
| 3 | Migrate remaining high-impact files | 5 files | ⏳ Pending |
| 4 | Final verification | All files | ⏳ Pending |

---

## Test Strategy

### Automated Tests
1. **TypeScript compilation** - Must pass after each file change
2. **Webpack build** - Must complete without errors
3. **Existing tests** - All component tests must pass

### Manual Verification
1. Run webview in VS Code extension host
2. Verify visual appearance unchanged
3. Test hover/focus states (new functionality!)

### Acceptance Criteria
- [ ] No inline style objects with only static values
- [ ] Repeated styles use utility classes from custom-spectrum.css
- [ ] Dynamic styles remain inline (acceptable per §11)
- [ ] All existing tests pass
- [ ] Visual appearance unchanged
- [ ] TypeScript compiles cleanly
- [ ] Webpack builds successfully

---

## Configuration

**Efficiency Review**: enabled
**Security Review**: disabled (no security-relevant changes)
