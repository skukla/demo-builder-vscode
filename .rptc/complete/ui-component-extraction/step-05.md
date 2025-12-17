# Step 5: Remove Unused Components

## Summary

Delete 5 UI components that have been confirmed to have 0 imports across the codebase. These components are exported from the barrel file (`index.ts`) but are never actually used anywhere. Removing them reduces code maintenance burden and bundle size.

**Components to Remove:**
| Component | File | Status |
|-----------|------|--------|
| Icon | `Icon.tsx` | 0 imports - delete |
| Badge | `Badge.tsx` | 0 imports - delete |
| Tip | `Tip.tsx` | 0 imports - delete |
| CompactOption | `CompactOption.tsx` | 0 imports - delete |
| ComponentCard | `ComponentCard.tsx` | 0 imports - delete |

**Impact**: Removes ~5 files and ~15 export lines from index.ts

---

## Prerequisites

- [ ] Step 1 (ProjectStatusUtils) complete - ensures no new status utilities use these components
- [ ] Step 2 (CenteredFeedbackContainer) complete - ensures no new feedback components use these
- [ ] Step 3 (Loading states refactoring) complete - ensures no new loading patterns use these
- [ ] Step 4 (SuccessStateDisplay) complete - ensures all extractions are done before cleanup

**Why Prerequisites Matter**: Previous steps may have introduced new component usages. Complete all extractions first to ensure no accidental dependencies were added.

---

## Verification Steps (Execute Before Deletion)

### Safety Check 1: Verify Zero Imports

Run these grep commands to confirm no imports exist (excluding the index.ts exports themselves):

```bash
# Check for Icon imports (excluding index.ts)
grep -r "from.*Icon" --include="*.tsx" --include="*.ts" src/ | grep -v "index.ts" | grep -v "node_modules"

# Check for Badge imports (excluding index.ts)
grep -r "from.*Badge" --include="*.tsx" --include="*.ts" src/ | grep -v "index.ts" | grep -v "node_modules"

# Check for Tip imports (excluding index.ts)
grep -r "from.*Tip" --include="*.tsx" --include="*.ts" src/ | grep -v "index.ts" | grep -v "node_modules"

# Check for CompactOption imports (excluding index.ts)
grep -r "from.*CompactOption" --include="*.tsx" --include="*.ts" src/ | grep -v "index.ts" | grep -v "node_modules"

# Check for ComponentCard imports (excluding index.ts)
grep -r "from.*ComponentCard" --include="*.tsx" --include="*.ts" src/ | grep -v "index.ts" | grep -v "node_modules"
```

**Expected Result**: Each command should return no matches (empty output).

### Safety Check 2: Verify No JSX Usage

```bash
# Check for direct component usage in JSX
grep -rE "<(Icon|Badge|Tip|CompactOption|ComponentCard)" --include="*.tsx" src/ | grep -v "node_modules"
```

**Expected Result**: No matches found.

### Safety Check 3: Verify No Type-Only Imports

```bash
# Check for type imports
grep -rE "(IconProps|BadgeProps|TipProps|CompactOptionProps|ComponentCardProps)" --include="*.ts" --include="*.tsx" src/ | grep -v "index.ts"
```

**Expected Result**: No matches found (or only in the component files themselves).

---

## Files to Delete

### Component Files

- [ ] `src/core/ui/components/ui/Icon.tsx` - Unused icon wrapper component
- [ ] `src/core/ui/components/ui/Badge.tsx` - Unused badge component
- [ ] `src/core/ui/components/ui/Tip.tsx` - Unused tip/tooltip component
- [ ] `src/core/ui/components/ui/CompactOption.tsx` - Unused compact option component
- [ ] `src/core/ui/components/ui/ComponentCard.tsx` - Unused component card

### Test Files

No test files exist for these components (verified via glob search).

---

## Files to Modify

### Update Barrel File

**File**: `src/core/ui/components/ui/index.ts`

**Remove these exports:**

```typescript
// DELETE these lines:
export { Badge } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';

export { Icon } from './Icon';
export type { IconProps, IconSize } from './Icon';

export { Tip } from './Tip';
export type { TipProps } from './Tip';

export { CompactOption } from './CompactOption';
export type { CompactOptionProps } from './CompactOption';

export { ComponentCard } from './ComponentCard';
export type { ComponentCardProps } from './ComponentCard';
```

**Resulting index.ts should contain only:**

```typescript
/**
 * UI Components
 *
 * Basic UI elements (badges, icons, spinners, transitions, etc.)
 * These are simple, single-purpose components.
 *
 * Migration from atomic design: atoms/ -> ui/
 */

export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';

export { StatusDot } from './StatusDot';
export type { StatusDotProps, StatusDotVariant } from './StatusDot';

export { FadeTransition } from './FadeTransition';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { NumberedInstructions } from './NumberedInstructions';
export type { NumberedInstructionsProps } from './NumberedInstructions';
```

---

## Implementation Details

### Deletion Order

1. **First**: Run all verification checks (Safety Check 1-3)
2. **Second**: Update `index.ts` to remove exports (prevents TypeScript errors during deletion)
3. **Third**: Delete component files one by one
4. **Fourth**: Run build to verify no broken imports

### Commands for Deletion

```bash
# After verification passes, delete files:
rm src/core/ui/components/ui/Icon.tsx
rm src/core/ui/components/ui/Badge.tsx
rm src/core/ui/components/ui/Tip.tsx
rm src/core/ui/components/ui/CompactOption.tsx
rm src/core/ui/components/ui/ComponentCard.tsx
```

### Build Verification

```bash
# Verify TypeScript compilation
npm run build

# Expected: No errors related to missing components
```

---

## Rollback Plan

If any issues discovered after deletion:

1. **Git Recovery**: Files can be recovered with `git checkout HEAD -- <filepath>`
2. **Re-add Exports**: Add exports back to index.ts if needed
3. **Document Usage**: If a usage is found, document it and remove from deletion list

---

## Expected Outcome

After this step:

- [ ] 5 unused component files deleted
- [ ] `index.ts` barrel file updated with reduced exports
- [ ] TypeScript build passes with no errors
- [ ] No runtime errors in extension
- [ ] Reduced bundle size (estimated ~2-5KB)

---

## Acceptance Criteria

- [ ] All 5 verification checks pass (no imports found)
- [ ] All 5 component files deleted
- [ ] `index.ts` updated - no exports for deleted components
- [ ] `npm run build` passes without errors
- [ ] No TypeScript errors in IDE
- [ ] Git shows 5 deleted files and 1 modified file (index.ts)

---

## Notes

### Why These Components Are Unused

These components were likely:
1. Created during initial development but never integrated
2. Replaced by Adobe Spectrum equivalents
3. Remnants from an abandoned feature

### Impact on Future Development

If any of these components are needed in the future:
- They can be recreated based on requirements
- Adobe Spectrum has equivalent components (Badge, Icon, etc.)
- Consider using Spectrum components first before creating custom ones

---

## Estimated Time

**15-30 minutes**

- Verification checks: 5 minutes
- Update index.ts: 5 minutes
- Delete files: 2 minutes
- Build verification: 5-10 minutes
- Documentation: 5 minutes
