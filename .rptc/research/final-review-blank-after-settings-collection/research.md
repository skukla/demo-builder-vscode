# Research: Final Review Blank After Settings Collection

**Research Date**: 2025-11-15
**Research Scope**: Codebase Analysis
**Research Depth**: Quick

---

## Summary

The Final Review step displays blank because **WizardContainer loads simplified component data** (`loadComponents`), but **ReviewStep requires the full component data** (`get-components-data`) that includes all the configuration details needed to display the summary. The data mismatch results in ReviewStep having insufficient information to render the component sections.

---

## Codebase Analysis

### Relevant Files

**1. WizardContainer.tsx** - Wizard orchestration
- `src/features/project-creation/ui/wizard/WizardContainer.tsx:213-221` - Message listener for component data loading
- **Problem**: Listens for `'componentsLoaded'` and sends `'loadComponents'` (simplified data)

**2. ReviewStep.tsx** - Final Review display component
- `src/features/project-creation/ui/steps/ReviewStep.tsx:37` - Expects `componentsData?: ComponentsData` prop
- `src/features/project-creation/ui/steps/ReviewStep.tsx:52-163` - `getComponentSections()` function builds display using componentsData
- **Problem**: Receives insufficient data, returns empty arrays

**3. ComponentConfigStep.tsx** - Settings Collection component
- `src/features/components/ui/steps/ComponentConfigStep.tsx:76-100` - Fetches full component data via `get-components-data`
- `src/features/components/ui/steps/ComponentConfigStep.tsx:61-62` - Stores data in local state
- **Problem**: Full data stays in local state, never passed to wizard state

**4. componentHandlers.ts** - Backend message handlers
- `src/features/components/handlers/componentHandlers.ts:72-132` - `handleLoadComponents` (simplified data)
- `src/features/components/handlers/componentHandlers.ts:139-202` - `handleGetComponentsData` (full data with envVars)
- **Problem**: Two different data structures for same conceptual data

---

## Data Flow Analysis

### Current (Broken) Flow

```
1. WizardContainer.tsx:213-221
   ↓ Sends 'loadComponents' message

2. componentHandlers.ts:72-132 (handleLoadComponents)
   ↓ Returns SIMPLIFIED ComponentRegistry
   {
     components: {
       frontends: [...],  // Missing envVars, dependencies
       backends: [...]
     }
   }

3. WizardContainer.tsx:426
   ↓ Passes componentsData?.components to ReviewStep

4. ReviewStep.tsx:37, 52-163
   ✗ Receives insufficient data
   ✗ getComponentSections() returns empty arrays
   ✗ Only project name displays
```

### What ComponentConfigStep Does (Works Correctly)

```
1. ComponentConfigStep.tsx:76-100
   ↓ Sends 'get-components-data' message

2. componentHandlers.ts:139-202 (handleGetComponentsData)
   ↓ Returns FULL ComponentsData
   {
     frontends: [...],
     backends: [...],
     dependencies: [...],
     envVars: { ... }  // ← This is what ReviewStep needs!
   }

3. ComponentConfigStep.tsx:61-62
   ✓ Stores in local state
   ✓ Displays fields correctly
```

---

## Root Cause

**Type Mismatch and Data Insufficiency**:

1. **WizardContainer** fetches `ComponentRegistry` (simplified structure)
2. **ComponentConfigStep** fetches `ComponentsData` (full structure with envVars)
3. **ReviewStep** expects `ComponentsData` (same as ComponentConfigStep)
4. **Result**: ReviewStep receives simplified data without the configuration details needed to display the summary

The environment variable values are stored in `state.componentConfigs`, but the **component metadata** (names, descriptions, which components are selected) is missing because WizardContainer loaded the wrong data structure.

---

## Implementation Options

### **Option 1: Fix WizardContainer to Load Full Data** ⭐ **Recommended**

**Change**: `WizardContainer.tsx:213-221`

**Before**:
```typescript
useEffect(() => {
    const handler = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'componentsLoaded') {
            vscode.postMessage({ type: 'loadComponents' });
        }
    };
    // ...
}, []);
```

**After**:
```typescript
useEffect(() => {
    const handler = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'components-data') {
            // componentsData will now have full structure
        }
    };
    // ...
}, []);

// On mount, send:
vscode.request('get-components-data')
```

**Pros**:
- Single source of truth for component data
- All steps get consistent, complete data
- Minimal changes (one file)

**Cons**:
- Need to verify all other steps still work with this data structure

---

### **Option 2: ReviewStep Fetches Its Own Data**

**Change**: `ReviewStep.tsx` - Add useEffect to fetch `get-components-data`

```typescript
const [localComponentsData, setLocalComponentsData] = useState<ComponentsData>();

useEffect(() => {
    vscode.request('get-components-data').then(data => {
        setLocalComponentsData(data);
    });
}, []);

// Use localComponentsData instead of props.componentsData
```

**Pros**:
- No changes to WizardContainer
- ReviewStep controls its own data

**Cons**:
- Duplicates data fetching (ComponentConfigStep already fetched it)
- Extra network request
- Inconsistent pattern (other steps use wizard state)

---

### **Option 3: Store ComponentsData in Wizard State**

**Change**: ComponentConfigStep saves data to wizard state

```typescript
// ComponentConfigStep.tsx:102-107
useEffect(() => {
    if (componentsData) {
        updateState({ componentsData }); // ← Add this
    }
}, [componentsData]);
```

Then ReviewStep reads from `state.componentsData` instead of props.

**Pros**:
- Leverages existing fetch in ComponentConfigStep
- No extra requests

**Cons**:
- Relies on step order (ComponentConfigStep must run before ReviewStep)
- If user navigates backward, data might be stale
- Doesn't help if user skips ComponentConfigStep

---

## Recommended Solution

**Option 1** is the cleanest fix:

1. Change WizardContainer to use `get-components-data` instead of `loadComponents`
2. Update type annotation if needed: `ComponentRegistry` → `ComponentsData`
3. Ensure ReviewStep receives the full component data structure
4. Test that all wizard steps still function correctly

This provides a **single source of truth** and ensures all steps (not just ReviewStep) have access to complete component information.

---

## Common Pitfalls

1. **Type Mismatches**: Two handlers return different data shapes for conceptually the same data
2. **Local State Isolation**: ComponentConfigStep stores full data locally, never sharing with wizard state
3. **Prop Drilling**: WizardContainer passes data down, but passes wrong structure
4. **Step Order Assumptions**: Solutions relying on step execution order break if user navigates non-linearly

---

## Key Takeaways

1. **Data Structure Mismatch**: Two different handlers (`loadComponents` vs `get-components-data`) return different data shapes
2. **ReviewStep Starved of Data**: Needs full `ComponentsData` but receives simplified `ComponentRegistry.components`
3. **ComponentConfigStep Works**: Already uses the correct handler (`get-components-data`)
4. **Fix Location**: WizardContainer.tsx:213-221 (change which message handler to use)
5. **Impact**: Low risk - primarily affects initial data load, doesn't change business logic
6. **Testing Required**: Verify all wizard steps still work after changing WizardContainer's data source

---

## Next Steps

1. Implement Option 1 (recommended): Update WizardContainer to use `get-components-data`
2. Test wizard flow end-to-end, especially:
   - Component Selection step
   - Settings Collection step
   - Final Review step
3. Verify all component sections display correctly in Final Review
4. Check for any type errors after changing data structure
5. Consider consolidating the two handlers (`handleLoadComponents` and `handleGetComponentsData`) to reduce confusion
