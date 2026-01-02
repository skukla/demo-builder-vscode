# Step 1: Separate FRONTEND_DEPENDENCIES from FRONTEND_ADDONS

## Purpose

Split the component options into separate arrays that mirror the `stacks.json` structure. This makes behavior self-documenting: array membership determines whether an item is required (locked) or optional (pre-selected).

**Key Distinction:**
- `FRONTEND_DEPENDENCIES` array = Locked checkboxes (cannot be unchecked, shows lock icon)
- `FRONTEND_ADDONS` array = Pre-checked but optional (user can still uncheck)

## Prerequisites

- [x] None

## Tests to Write First

- [x] **Test:** Verify existing ComponentSelectionStep tests pass
  - **File:** `tests/features/components/ui/steps/ComponentSelectionStep*.test.tsx`
  - **Action:** Run tests to confirm they pass with refactored structure

## Files to Modify

- [x] `src/features/components/ui/steps/ComponentSelectionStep.tsx`
  - Create separate `ComponentOption` and `PickerOption` interfaces
  - Split into `FRONTEND_DEPENDENCIES` array (commerce-mesh only)
  - Create `FRONTEND_ADDONS` array (demo-inspector only)
  - Update UI to render separate sections

- [x] `src/features/components/ui/hooks/useComponentSelection.ts`
  - Add `frontendAddons` prop to hook
  - Update initialization to add both dependencies and addons

## Implementation Details

**Interface Updates (ComponentSelectionStep.tsx):**

```typescript
/** Simple option for dependencies, addons, and services (no description needed) */
interface ComponentOption {
    id: string;
    name: string;
}

/** Picker option with description for frontend/backend selection */
interface PickerOption {
    id: string;
    name: string;
    description: string;
}

// Required frontend dependencies (always selected, locked)
const FRONTEND_DEPENDENCIES: ComponentOption[] = [
    { id: 'commerce-mesh', name: 'API Mesh' },
];

// Optional frontend addons (pre-selected by default, user can uncheck)
const FRONTEND_ADDONS: ComponentOption[] = [
    { id: 'demo-inspector', name: 'Demo Inspector' },
];
```

**Hook Update (useComponentSelection.ts):**

```typescript
interface UseComponentSelectionProps {
    // ...existing props
    /** Required frontend dependencies (always selected, locked) */
    frontendDependencies: ComponentOption[];
    /** Optional frontend addons (pre-selected by default, user can uncheck) */
    frontendAddons: ComponentOption[];
    /** Required backend services (always selected, locked) */
    backendServices: ComponentOption[];
}

// Initialize dependencies and addons when frontend changes
useEffect(() => {
    if (selectedFrontend) {
        // Add all required dependencies (locked) + all addons (pre-selected but optional)
        const depsToAdd = [
            ...frontendDependencies.map(d => d.id),
            ...frontendAddons.map(a => a.id),
        ];
        setSelectedDependencies(prev => {
            const newSet = new Set(prev);
            depsToAdd.forEach(dep => newSet.add(dep));
            return newSet;
        });
    }
}, [selectedFrontend, frontendDependencies, frontendAddons]);
```

## Expected Outcome

- Demo inspector checkbox is pre-checked when headless frontend is selected
- Demo inspector checkbox can still be unchecked by user (no lock icon)
- API Mesh remains required and locked (in `FRONTEND_DEPENDENCIES`)
- All existing tests pass
- Behavior determined by array membership, not boolean flags

## Acceptance Criteria

- [x] Separate `ComponentOption` and `PickerOption` interfaces created
- [x] `FRONTEND_DEPENDENCIES` contains commerce-mesh (locked)
- [x] `FRONTEND_ADDONS` contains demo-inspector (pre-selected, optional)
- [x] Hook accepts `frontendAddons` prop
- [x] All component UI tests pass (33 tests)
- [x] TypeScript compiles cleanly

## Estimated Time

15 minutes
