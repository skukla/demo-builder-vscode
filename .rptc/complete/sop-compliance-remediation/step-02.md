# Step 2: Inline Style Migration

## Purpose

Fix 7 MEDIUM priority inline style violations per SOP code-patterns.md Section 11. After analysis, **5 are dynamic** (keep with SOP comments) and **2 are static** (convert to utility classes).

## Prerequisites

- [ ] Step 1 complete (magic timeouts fixed)
- [ ] Understanding of utility class pattern in `custom-spectrum.css`

## Violation Analysis

| File | Line | Current Style | Evaluation | Action |
|------|------|---------------|------------|--------|
| `WizardProgress.tsx` | 92 | `cursor: onClick ? 'pointer' : 'default'` | **DYNAMIC** (onClick prop) | Keep + SOP comment |
| `WizardProgress.tsx` | 96 | `color: indicatorColor` | **DYNAMIC** (computed from state) | Keep + SOP comment |
| `WizardProgress.tsx` | 102 | `UNSAFE_style color` | **DYNAMIC** (isCurrent prop) | Keep + SOP comment |
| `SidebarNav.tsx` | 56 | `background: item.active ? ...` | **DYNAMIC** (item.active prop) | Keep + SOP comment |
| `TimelineNav.tsx` | 137 | `marginBottom: index < ... ? ...` | **DYNAMIC** (last-item conditional) | Keep + SOP comment |
| `ReviewStep.tsx` | 45 | `minWidth: LABEL_MIN_WIDTH` | **STATIC** ('100px' constant) | Use `.min-w-100` (exists) |
| `WelcomeStep.tsx` | 106 | `minHeight: '96px'` | **STATIC** (hardcoded value) | Add + use `.min-h-96` |

## Tests to Write First (RED phase)

### Test 2.1: Visual regression tests (manual verification)

No automated tests for CSS changes - verify visually in extension:
- [ ] ReviewStep label alignment unchanged
- [ ] WelcomeStep project name field spacing unchanged
- [ ] WizardProgress step indicators render correctly
- [ ] SidebarNav active state highlighting works
- [ ] TimelineNav step spacing unchanged

## Files to Modify

### Static Style Conversions (2 files)

1. **`src/core/ui/styles/custom-spectrum.css`** - Add `.min-h-96` utility class
2. **`src/features/project-creation/ui/steps/ReviewStep.tsx`** - Line 45: Use existing `.min-w-100`
3. **`src/features/project-creation/ui/steps/WelcomeStep.tsx`** - Line 106: Use new `.min-h-96`

### Dynamic Style Documentation (4 files)

4. **`src/features/sidebar/ui/components/WizardProgress.tsx`** - Lines 92, 96, 102: Add SOP comments
5. **`src/features/sidebar/ui/components/SidebarNav.tsx`** - Line 56: Add SOP comment
6. **`src/features/project-creation/ui/wizard/TimelineNav.tsx`** - Line 137: Add SOP comment

## Implementation Details

### RED Phase

No code tests needed for CSS changes - visual verification only.

### GREEN Phase

#### 1. Add `.min-h-96` utility class to custom-spectrum.css

Location: `src/core/ui/styles/custom-spectrum.css` (near line 614 with other min-h utilities)

```css
.min-h-96 { min-height: 96px !important; }
```

#### 2. Fix ReviewStep.tsx:45 - Use existing utility class

```typescript
// Before (line 45)
<Text UNSAFE_className={cn('text-md', 'text-gray-500')} UNSAFE_style={{ minWidth: LABEL_MIN_WIDTH }}>{label}</Text>

// After - use existing .min-w-100 utility class
<Text UNSAFE_className={cn('text-md', 'text-gray-500', 'min-w-100')}>{label}</Text>
```

Also remove the unused constant:
```typescript
// Line 30 - can be removed if no longer used
const LABEL_MIN_WIDTH = '100px';
```

#### 3. Fix WelcomeStep.tsx:106 - Use new utility class

```typescript
// Before (line 106)
<div className="mb-8" style={{ minHeight: '96px' }}>

// After - use new .min-h-96 utility class
<div className="mb-8 min-h-96">
```

#### 4. Add SOP comments to WizardProgress.tsx (lines 92, 96, 102)

```typescript
// Line 92 - add comment above style
{/* SOP: Dynamic style - cursor depends on onClick prop (clickable vs non-clickable step) */}
style={{ cursor: onClick ? 'pointer' : 'default' }}

// Line 96 - add comment above style
{/* SOP: Dynamic style - color computed from isCompleted/isCurrent state */}
style={{ color: indicatorColor }}

// Line 102-106 - add comment above UNSAFE_style
{/* SOP: Dynamic style - color depends on isCurrent prop for visual emphasis */}
UNSAFE_style={{
    color: isCurrent
        ? 'var(--spectrum-global-color-gray-800)'
        : 'var(--spectrum-global-color-gray-600)',
}}
```

#### 5. Add SOP comment to SidebarNav.tsx (line 56)

```typescript
// Line 56 - add comment above style object
{/* SOP: Dynamic style - background depends on item.active prop for selection state */}
style={{
    background: item.active
        ? 'var(--spectrum-global-color-gray-200)'
        : 'transparent',
}}
```

#### 6. Add SOP comment to TimelineNav.tsx (line 137)

```typescript
// Line 137 - add comment above style object
{/* SOP: Dynamic style - marginBottom conditional for last-item handling (SOP section 11 allows this pattern) */}
style={{
    marginBottom: index < steps.length - 1 ? 'var(--spectrum-global-dimension-size-400)' : undefined,
}}
```

### REFACTOR Phase

- [ ] Verify LABEL_MIN_WIDTH constant in ReviewStep.tsx can be removed (not used elsewhere)
- [ ] Run TypeScript compilation: `npm run compile`
- [ ] Run webpack build: `npm run build`
- [ ] Visual verification in extension (F5)

## Expected Outcome

- 2 static inline styles converted to utility classes
- 5 dynamic inline styles documented with SOP comments explaining why inline is acceptable
- 1 new utility class (`.min-h-96`) added to custom-spectrum.css
- 1 unused constant (LABEL_MIN_WIDTH) removed

## Acceptance Criteria

- [ ] `.min-h-96` utility class added to `custom-spectrum.css`
- [ ] `ReviewStep.tsx` uses `.min-w-100` instead of inline style
- [ ] `WelcomeStep.tsx` uses `.min-h-96` instead of inline style
- [ ] `LABEL_MIN_WIDTH` constant removed from ReviewStep.tsx (if unused)
- [ ] WizardProgress.tsx dynamic styles have SOP comments (3 locations)
- [ ] SidebarNav.tsx dynamic style has SOP comment (1 location)
- [ ] TimelineNav.tsx dynamic style has SOP comment (1 location)
- [ ] TypeScript compilation succeeds (`npm run compile`)
- [ ] Webpack build succeeds (`npm run build`)
- [ ] Visual verification passes - no layout regressions

## Dependencies

- Step 1 (timeouts) should be complete first
- No external dependencies

## Estimated Time

- 30-45 minutes
