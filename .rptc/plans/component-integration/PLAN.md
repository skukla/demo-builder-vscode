# Component Integration Plan

## Status: ✅ COMPLETE

**Completed:** 2025-12-02

- Phase 1 (Quick Wins): ✅ COMPLETED
- Phase 2 (Audit & Replace): ✅ COMPLETED
- Phase 3 (Feature Work): ❌ OBSOLETE - WelcomeScreen removed

---

## Overview

During SOP compliance scanning, we discovered 6 well-built React components that exist but have never been integrated. These represent incomplete refactoring work where components were extracted but "integrate into parent" was never completed.

**Root Cause**: Feature-based UI migration extracted components but the integration step was skipped.

**Goal**: Integrate these components to reduce code duplication and improve consistency.

---

## Components to Integrate

### 1. AuthLoadingState

**Location**: `src/features/authentication/ui/steps/components/AuthLoadingState.tsx`

**What it does**: Centered loading display with message, subMessage, and helperText props.

```tsx
<AuthLoadingState
  message="Checking authentication..."
  subMessage="Please wait"
/>
```

**Integration Target**: `src/features/authentication/ui/steps/AdobeAuthStep.tsx`

**Current Inline Code** (lines 52-61):
```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay
        size="L"
        message="Checking authentication..."
        subMessage="Please wait while we verify your Adobe credentials"
    />
</Flex>
```

**Integration**: Replace inline with `<AuthLoadingState message="..." subMessage="..." />`

**Effort**: Low (simple replacement)

---

### 2. ErrorDisplay

**Location**: `src/core/ui/components/feedback/ErrorDisplay.tsx`

**What it does**: Standardized error display with title, message, optional retry button, severity levels.

```tsx
<ErrorDisplay
  title="Error Loading Projects"
  message="Failed to fetch projects"
  onRetry={loadProjects}
/>
```

**Integration Targets** (4+ locations):

| File | Lines | Current Pattern |
|------|-------|-----------------|
| `SelectionStepContent.tsx` | ~142-168 | Inline AlertCircle + Text + retry Button |
| `ProjectCreationStep.tsx` | ~85-105 | Inline error display |
| `AdobeProjectStep.tsx` | ~94-112 | Inline error + retry |
| `AdobeWorkspaceStep.tsx` | ~78-96 | Inline error + retry |

**Effort**: Medium (multiple files, need to verify prop compatibility)

---

### 3. EmptyState

**Location**: `src/core/ui/components/feedback/EmptyState.tsx`

**What it does**: Well-styled empty state with icon, title, description.

```tsx
<EmptyState
  title="No Projects Found"
  description="Create a project in Adobe Console first."
/>
```

**Integration Target**: `src/features/authentication/ui/steps/components/SelectionStepContent.tsx`

**Current Inline Code** (lines 179-191):
```tsx
<Flex justifyContent="center" alignItems="center" height="350px">
    <Well>
        <Flex gap="size-200" alignItems="center">
            <AlertCircle UNSAFE_className="text-yellow-600" />
            <Flex direction="column" gap="size-50">
                <Text><strong>No {itemType}s Found</strong></Text>
                <Text UNSAFE_className="text-sm">{emptyMessage}</Text>
            </Flex>
        </Flex>
    </Well>
</Flex>
```

**Integration**: Replace with `<EmptyState title={...} description={...} />`

**Effort**: Low (1 file, exact match)

---

### 4. DependencyItem

**Location**: `src/core/ui/components/ui/DependencyItem.tsx`

**What it does**: Checkbox with name, description, required badge, impact indicator.

```tsx
<DependencyItem
  id="api-mesh"
  name="API Mesh"
  description="Required for GraphQL support"
  required={true}
  selected={true}
/>
```

**Integration Target**: `src/features/components/ui/steps/ComponentSelectionStep.tsx`

**Current Pattern**: Inline Checkbox + Badge composition for dependency items

**Effort**: Medium (need to verify component API matches existing usage)

---

### 5. Spinner

**Location**: `src/core/ui/components/ui/Spinner.tsx`

**What it does**: Wrapper around ProgressCircle with sensible defaults.

```tsx
<Spinner size="M" aria-label="Loading" />
```

**Integration Targets** (8+ locations):

| File | Current Pattern |
|------|-----------------|
| Various loading states | Raw `<ProgressCircle isIndeterminate />` |
| Button loading states | Inline ProgressCircle |
| Overlay spinners | Inline ProgressCircle |

**Effort**: Low per file, but many files to update

---

### 6. ProjectCard

**Location**: `src/features/welcome/ui/ProjectCard.tsx`

**What it does**: Complete project card with name, org, date, path, open/delete actions.

**Status**: Component is well-built with:
- Date formatting (Today, Yesterday, X days ago)
- Current project badge
- Click-to-open behavior
- CSS classes for styling

**Integration Target**: `src/features/welcome/ui/WelcomeScreen.tsx`

**Current State**: WelcomeScreen has no "Recent Projects" section

**RECLASSIFIED**: This is a **feature addition**, not a component integration.
Adding ProjectCard requires:
1. New "Recent Projects" section in WelcomeScreen UI
2. State management for project list
3. Message handlers to load/delete projects
4. Backend handlers to provide project data

**Effort**: High (feature work, not just integration)

---

## Recommended Approach

### Phase 1: Quick Wins (Low Effort) - ✅ COMPLETED
1. **AuthLoadingState** → AdobeAuthStep.tsx ✅
2. **EmptyState** → SelectionStepContent.tsx ✅
3. **ErrorDisplay** → SelectionStepContent.tsx ✅
4. **Spinner** → SelectionStepContent.tsx (RefreshButton) ✅

### Phase 2: Audit & Replace - ✅ COMPLETED
5. **Spinner** → PrerequisitesStep.tsx (getStatusIcon) ✅
6. **Spinner** → SearchableList.tsx (2 refresh buttons) ✅
7. **DependencyItem** → ComponentSelectionStep.tsx ❌ NOT APPLICABLE
   - Current inline code uses LockClosed icon, no description
   - DependencyItem requires description, uses Badge, has container styling
   - Would be a design change, not just integration

### Remaining ProgressCircle Uses (Intentionally Kept)
- **LoadingDisplay.tsx** - Core component that Spinner conceptually wraps
- **ProjectDashboardScreen.tsx** - Has custom UNSAFE_style sizing not supported by Spinner

### Phase 3: Feature Work (Requires New Feature) - ❌ OBSOLETE
8. **ProjectCard** → WelcomeScreen.tsx ❌ N/A
   - WelcomeScreen was removed in component-extraction plan (2025-12-02)
   - ProjectCard now lives in projects-dashboard feature and is already integrated

---

## Definition of Done

For each component:
- [x] Inline code replaced with component import
- [x] Props mapped correctly
- [x] Visual behavior unchanged (verify in UI)
- [x] Tests pass
- [x] No unused inline code remains

**All applicable integrations completed. Phase 3 obsolete due to WelcomeScreen removal.**

---

## Notes

- All components already have proper TypeScript types
- Components follow Spectrum design patterns
- Some components (ErrorDisplay, EmptyState) are memoized for performance
- Integration should be done incrementally with test verification after each change
