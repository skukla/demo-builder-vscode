# Duplicate File Analysis

**Generated:** $(date '+%Y-%m-%d %H:%M:%S')

## Summary

- **Total duplicates identified:** 6 confirmed components
- **Decision strategy:** Keep `src/core/ui/` versions (more robust implementations)
- **Action:** Delete duplicates from `src/webviews/` during migration

## Confirmed Duplicates

### 1. Modal.tsx
- **Location 1:** `src/core/ui/components/Modal.tsx` (1467 bytes)
  - Has size mapping logic
  - More robust implementation
- **Location 2:** `src/webviews/components/shared/Modal.tsx` (1295 bytes)
  - Basic implementation
- **Decision:** ✅ Keep `src/core/ui/components/Modal.tsx`
- **Action:** Delete `src/webviews/components/shared/Modal.tsx`

### 2. FadeTransition.tsx
- **Location 1:** `src/core/ui/components/FadeTransition.tsx` (1321 bytes)
  - Cleaner unmounting logic
  - Better state management
- **Location 2:** `src/webviews/components/shared/FadeTransition.tsx` (1329 bytes)
  - Slightly different implementation
- **Decision:** ✅ Keep `src/core/ui/components/FadeTransition.tsx`
- **Action:** Delete `src/webviews/components/shared/FadeTransition.tsx`

### 3. LoadingDisplay.tsx
- **Location 1:** `src/core/ui/components/LoadingDisplay.tsx` (4641 bytes)
  - More features (presets, custom messages)
  - Better prop handling
- **Location 2:** `src/webviews/components/shared/LoadingDisplay.tsx` (4422 bytes)
  - Basic implementation
- **Decision:** ✅ Keep `src/core/ui/components/LoadingDisplay.tsx`
- **Action:** Delete `src/webviews/components/shared/LoadingDisplay.tsx`

### 4. FormField.tsx
- **Location 1:** `src/core/ui/components/FormField.tsx` (4904 bytes)
- **Location 2:** `src/webviews/components/molecules/FormField.tsx`
- **Decision:** ⚠️ REQUIRES COMPARISON - Need to diff both files
- **Action:** Compare implementations, keep more complete version

### 5. NumberedInstructions.tsx
- **Location 1:** `src/core/ui/components/NumberedInstructions.tsx` (3180 bytes)
- **Location 2:** `src/webviews/components/shared/NumberedInstructions.tsx` (3180 bytes)
- **Decision:** ⚠️ REQUIRES COMPARISON - Same file size suggests identical content
- **Action:** Diff both files, likely identical → delete duplicate

### 6. StatusCard.tsx
- **Location 1:** `src/core/ui/components/StatusCard.tsx` (2699 bytes)
- **Location 2:** `src/webviews/components/molecules/StatusCard.tsx`
- **Decision:** ⚠️ REQUIRES COMPARISON - Need to diff both files
- **Action:** Compare implementations, keep more complete version

## Migration Strategy

### Phase 1: Verify Duplicates (Step 2)
Compare the 3 pending duplicates (FormField, NumberedInstructions, StatusCard) and make final decisions.

### Phase 2: Consolidate (Step 3)
1. For confirmed duplicates, update all imports to use `src/core/ui/` versions
2. Delete duplicate files from `src/webviews/`
3. Verify no broken imports

### Phase 3: Move to webview-ui/ (Steps 4-5)
Once duplicates are consolidated, move all files to new `webview-ui/` structure.

## Import Impact Analysis

**Files importing from src/core/ui/:** 89 import statements
**Files importing from src/webviews/:** 0 import statements (good - means all code already uses core/ui)

This suggests that duplicates in `src/webviews/` are **not being used** and can be safely deleted after verification.

---

## Detailed Comparison Results (Step 2)

Generated: $(date '+%Y-%m-%d %H:%M:%S')

### FormField.tsx Analysis

**Location 1:** `src/core/ui/components/FormField.tsx` (4904 bytes)
**Location 2:** `src/webviews/components/molecules/FormField.tsx` (4731 bytes)

**Comparison Summary:**
The files are very similar but have a critical feature difference:

- **core/ui version:** Supports `'text' | 'url' | 'password' | 'select' | 'boolean' | 'number'` types
- **webviews version:** Supports `'text' | 'url' | 'password' | 'select' | 'boolean'` types (NO number support)

Key differences:
- core/ui version has `'number'` in type union
- core/ui version handles number values in onChange handler
- core/ui version uses `String(value)` for text inputs to handle numbers
- webviews version lacks number type support entirely

Additional minor differences:
- core/ui uses `selectableDefaultProps?: Record<string, unknown>` (more type-safe)
- webviews uses `selectableDefaultProps?: Record<string, any>` (less strict)

**Import Usage:**
- Imports from @/core/ui: **2**
- Active version: **core/ui** (all imports use this version)

**Decision:** ✅ Keep `src/core/ui/components/FormField.tsx`
- **Rationale:** 
  - More feature-complete (supports number input type)
  - Better TypeScript typing (`unknown` vs `any`)
  - Already actively imported by all consumers
  - No loss of functionality (webviews version is subset)
- **Action:** DELETE `src/webviews/components/molecules/FormField.tsx`

---

### NumberedInstructions.tsx Analysis

**Location 1:** `src/core/ui/components/NumberedInstructions.tsx` (3180 bytes)
**Location 2:** `src/webviews/components/shared/NumberedInstructions.tsx` (3180 bytes)

**Comparison Summary:**
**Files are IDENTICAL** - diff output is empty (no differences found)

Identical file sizes (3180 bytes each) confirmed by diff comparison showing zero differences. These are exact duplicates.

**Import Usage:**
- Imports from @/core/ui: **2**
- Active version: **core/ui** (all imports use this version)

**Decision:** ✅ Keep `src/core/ui/components/NumberedInstructions.tsx`
- **Rationale:**
  - Files are identical (exact duplicates)
  - Already actively imported from @/core/ui
  - No functional difference between versions
  - Following project convention to keep core/ui versions
- **Action:** DELETE `src/webviews/components/shared/NumberedInstructions.tsx`

---

### StatusCard.tsx Analysis

**Location 1:** `src/core/ui/components/StatusCard.tsx` (2699 bytes)
**Location 2:** `src/webviews/components/molecules/StatusCard.tsx` (1806 bytes)

**Comparison Summary:**
The files have significantly different implementations:

**core/ui version (2699 bytes):**
- Has sophisticated color mapping logic via `getVariant()` function
  - Maps color strings ('green', 'red', 'yellow', 'blue', 'gray') to StatusDot variants ('success', 'error', 'warning', 'info', 'neutral')
- Has size mapping logic via `getSizeInPixels()` function
  - Maps size strings ('S', 'M', 'L') to pixel values (6, 8, 10)
- Imports StatusDot from `@/design-system/atoms/StatusDot`
- More robust and flexible implementation

**webviews version (1806 bytes):**
- Simple pass-through implementation
- Passes color and size props directly to StatusDot without mapping
- Imports StatusDot from relative path `../atoms/StatusDot`
- Simpler but less flexible (relies on StatusDot accepting raw props)

**Import Usage:**
- Imports from @/core/ui: **2**
- Active version: **core/ui** (all imports use this version)

**Decision:** ✅ Keep `src/core/ui/components/StatusCard.tsx`
- **Rationale:**
  - More robust with color/size mapping logic
  - Better abstraction (isolates StatusDot API changes)
  - Already actively imported by all consumers
  - More feature-complete implementation
  - Webviews version assumes StatusDot accepts raw props (fragile)
- **Action:** DELETE `src/webviews/components/molecules/StatusCard.tsx`

---

## Final Merge Strategy (All 6 Duplicates)

### Confirmed to Keep from src/core/ui/
All decisions align with import usage and feature completeness:

1. ✅ **Modal.tsx** → DELETE `src/webviews/components/shared/Modal.tsx`
   - Reason: More robust size mapping logic, actively imported

2. ✅ **FadeTransition.tsx** → DELETE `src/webviews/components/shared/FadeTransition.tsx`
   - Reason: Cleaner unmounting logic, actively imported

3. ✅ **LoadingDisplay.tsx** → DELETE `src/webviews/components/shared/LoadingDisplay.tsx`
   - Reason: More features (presets, custom messages), actively imported

4. ✅ **FormField.tsx** → DELETE `src/webviews/components/molecules/FormField.tsx`
   - Reason: Supports number input type (webviews version doesn't), actively imported

5. ✅ **NumberedInstructions.tsx** → DELETE `src/webviews/components/shared/NumberedInstructions.tsx`
   - Reason: Files are identical, actively imported from core/ui

6. ✅ **StatusCard.tsx** → DELETE `src/webviews/components/molecules/StatusCard.tsx`
   - Reason: More robust color/size mapping logic, actively imported

### Files to DELETE in Step 3

**From src/webviews/components/shared/**
- FadeTransition.tsx
- LoadingDisplay.tsx
- Modal.tsx
- NumberedInstructions.tsx

**From src/webviews/components/molecules/**
- FormField.tsx
- StatusCard.tsx

**Total files to delete:** 6 duplicate files

### Import Migration Required

**Status:** ✅ No import migration needed

All active imports already use @/core/ui versions (89 imports from @/core/ui, 0 from @/webviews). The duplicate files in src/webviews/ are orphaned and can be safely deleted without any import updates.

This confirms Step 1 findings and makes Step 3 straightforward - we simply delete the unused duplicates.

