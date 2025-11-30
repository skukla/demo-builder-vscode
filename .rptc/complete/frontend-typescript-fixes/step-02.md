# Step 2: Add Missing Type Exports

## Objective

Export Props interfaces from components that declare them but don't export them, resolving **8 type export errors**.

## Errors Addressed

From `webview-ui/src/shared/components/ui/index.ts`:

1. Line 31: `ModalProps` is not exported from `./Modal`
2. Line 34: `NumberedInstructionsProps` doesn't exist (should be `NumberedInstructions` without Props suffix)
3. Line 37: `TipProps` is not exported from `./Tip`
4. Line 40: `CompactOptionProps` doesn't exist (should be `CompactOption`)
5. Line 43: `ComponentCardProps` doesn't exist (should be `ComponentCard`)
6. Line 46: `ConfigurationSummaryProps` doesn't exist (should be `ConfigurationSummary`)
7. Line 49: `DependencyItemProps` doesn't exist (should be `DependencyItem`)
8. Line 52: `SelectionSummaryProps` and `SelectionItem` don't exist

## Root Cause Analysis

The `ui/index.ts` barrel export file tries to export Props types that either:
1. **Don't exist** - Component uses inline prop types without a named interface
2. **Exist but aren't exported** - Interface declared but not exported
3. **Have wrong names** - Export expects `*Props` suffix but component uses different naming

## Investigation Required

Before implementation, check each component file:

```bash
# Check what's actually exported from each file
grep -n "^export.*Props" webview-ui/src/shared/components/ui/Modal.tsx
grep -n "^export.*Props" webview-ui/src/shared/components/ui/Tip.tsx
grep -n "^export.*Props" webview-ui/src/shared/components/ui/NumberedInstructions.tsx
grep -n "^export.*Props" webview-ui/src/shared/components/ui/CompactOption.tsx
grep -n "^export.*Props" webview-ui/src/shared/components/ui/ComponentCard.tsx
grep -n "^export.*Props" webview-ui/src/shared/components/ui/ConfigurationSummary.tsx
grep -n "^export.*Props" webview-ui/src/shared/components/ui/DependencyItem.tsx
grep -n "^export.*Props" webview-ui/src/shared/components/ui/SelectionSummary.tsx
```

## Implementation Strategy

For each component, follow this pattern:

### Pattern A: Interface exists but not exported
```typescript
// BEFORE:
interface ModalProps {
    // ...
}

export function Modal(props: ModalProps) {
    // ...
}

// AFTER:
export interface ModalProps {  // ← Add 'export'
    // ...
}

export function Modal(props: ModalProps) {
    // ...
}
```

### Pattern B: No interface, using inline types
```typescript
// BEFORE:
export function Tip({ variant, children }: {
    variant: 'info' | 'warning';
    children: ReactNode;
}) {
    // ...
}

// AFTER:
export interface TipProps {
    variant: 'info' | 'warning';
    children: ReactNode;
}

export function Tip({ variant, children }: TipProps) {
    // ...
}
```

### Pattern C: Wrong name in barrel export
```typescript
// If component exports 'NumberedInstructions' but barrel expects 'NumberedInstructionsProps':

// Fix the barrel export:
// BEFORE:
export type { NumberedInstructionsProps } from './NumberedInstructions';

// AFTER:
// Either add the Props export to the component, or fix the barrel import:
export { NumberedInstructions } from './NumberedInstructions';
export type { NumberedInstructionsProps } from './NumberedInstructions';  // if it exists
```

## Detailed Implementation

### File 1: `webview-ui/src/shared/components/ui/Modal.tsx`

**Action**: Export the ModalProps interface

```typescript
// Find the interface declaration (likely near top of file)
// Add 'export' keyword if missing

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    // ... other props
}
```

### File 2: `webview-ui/src/shared/components/ui/Tip.tsx`

**Action**: Export the TipProps interface (or create it if using inline types)

### File 3: `webview-ui/src/shared/components/ui/NumberedInstructions.tsx`

**Action**: Check if `NumberedInstructionsProps` exists
- If yes: Add export
- If no: Either create it or fix barrel export to match actual export name

### Files 4-8: Repeat pattern for remaining components

For each of:
- `CompactOption.tsx`
- `ComponentCard.tsx`
- `ConfigurationSummary.tsx`
- `DependencyItem.tsx`
- `SelectionSummary.tsx`

Check actual exports and either:
1. Add missing `export` keyword to Props interface
2. Create Props interface from inline types
3. Fix barrel export to match actual export name

### File 9: `webview-ui/src/shared/components/ui/SelectionSummary.tsx`

**Special case**: This file needs to export both `SelectionSummaryProps` AND `SelectionItem`

```typescript
export interface SelectionItem {
    id: string;
    name: string;
    // ... other properties
}

export interface SelectionSummaryProps {
    items: SelectionItem[];
    // ... other props
}
```

## Test Strategy

### Pre-Implementation Test
```bash
# Verify current error count
npm run compile:webview 2>&1 | grep "src/shared/components/ui/index.ts.*error TS" | wc -l
# Expected: 8 errors
```

### Post-Implementation Test
```bash
# Test: TypeScript compilation
npm run compile:webview

# Expected: 8 fewer errors (from ui/index.ts)
# Look for: No errors in ui/index.ts related to missing type exports
```

### Verification
```bash
# Verify all Props types are properly exported
grep -r "^export.*Props" webview-ui/src/shared/components/ui/*.tsx

# Should show all 8 Props interfaces exported
```

## Acceptance Criteria

- [ ] All 8 Props interfaces exported from their respective component files
- [ ] `webview-ui/src/shared/components/ui/index.ts` compiles without type export errors
- [ ] TypeScript error count reduced by 8
- [ ] No NEW errors introduced
- [ ] All exported Props interfaces match their component's actual prop types

## Estimated Time

**10 minutes** (straightforward export additions)

## Risk Level

**Low** - Adding type exports doesn't affect runtime behavior, only improves type safety for consumers of these components.

## Dependencies

- **Depends on**: Step 1 (barrel export structural fixes)
- **Blocks**: None (independent fix)

## Notes

- These Props exports enable better TypeScript autocomplete for component consumers
- After this fix, any files importing these Props types will get proper type checking
- This is a best practice for React component libraries (export both component and props type)
