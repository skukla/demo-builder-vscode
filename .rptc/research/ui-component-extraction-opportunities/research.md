# UI Component Extraction Opportunities

**Research Date:** 2025-12-05
**Scope:** Codebase Analysis
**Focus Areas:** Architecture, Consistency, Reusability
**Depth:** Standard

---

## Summary

The codebase has **good foundational abstractions** (LoadingDisplay, StatusDisplay, SearchableList, TwoColumnLayout) but suffers from **inconsistent usage** and **duplicate wrapper patterns**. The most impactful opportunities are around loading/success state containers and utility function extraction.

---

## 1. Component Inventory

### Well-Used Core Components (Keep & Expand)

| Component | Usage | Location |
|-----------|-------|----------|
| `LoadingDisplay` | 7+ files | `src/core/ui/components/feedback/` |
| `StatusDisplay` | 5+ files | `src/core/ui/components/feedback/` |
| `StatusDot` | 4 files | `src/core/ui/components/ui/` |
| `PageLayout` | 3+ files | `src/core/ui/components/layout/` |
| `TwoColumnLayout` | 3 files | `src/core/ui/components/layout/` |
| `SearchableList` | 3 files | `src/core/ui/components/navigation/` |
| `LoadingOverlay` | 3 files | `src/core/ui/components/feedback/` |
| `Spinner` | 3 files | `src/core/ui/components/feedback/` |
| `FadeTransition` | 2 files | `src/core/ui/components/ui/` |
| `SingleColumnLayout` | 2 files | `src/core/ui/components/layout/` |
| `GridLayout` | 2 files | `src/core/ui/components/layout/` |

### Low-Usage Components (Review for Consolidation)

| Component | Usage | Location | Notes |
|-----------|-------|----------|-------|
| `NavigationPanel` | 1 file | `src/core/ui/components/navigation/` | Only used by ConfigNavigationPanel |
| `StatusCard` | 1 file | `src/core/ui/components/feedback/` | Redundant with StatusDot + Text |
| `EmptyState` | 1 file | `src/core/ui/components/feedback/` | Could be consolidated |
| `Modal` | 1 file | `src/core/ui/components/ui/` | Dialog wrapper |
| `NumberedInstructions` | 1 file | `src/core/ui/components/ui/` | Specific use case |

### Unused Components (Candidates for Removal)

| Component | Location | Status |
|-----------|----------|--------|
| `Icon` | `src/core/ui/components/ui/Icon.tsx` | **0 imports** - Wrapper around Spectrum icons (adds little value) |
| `Badge` | `src/core/ui/components/ui/Badge.tsx` | **0 imports** - Custom badge (Spectrum Badge exists) |
| `Tip` | `src/core/ui/components/ui/Tip.tsx` | **0 imports** - Info box component |
| `CompactOption` | `src/core/ui/components/ui/CompactOption.tsx` | **0 imports** - Option display component |
| `ComponentCard` | `src/core/ui/components/ui/ComponentCard.tsx` | **0 imports** - Card wrapper |

---

## 2. Duplicate Code Patterns

### Pattern A: Centered Loading Container (HIGH SEVERITY)

**Occurrences:** 12+ files

Same exact structure repeated across the codebase:

```tsx
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay ... />
</Flex>
```

**Files with this pattern:**

| File | Lines |
|------|-------|
| `src/features/authentication/ui/components/SelectionStepContent.tsx` | 128 |
| `src/features/authentication/ui/steps/components/AuthLoadingState.tsx` | 13 |
| `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` | 61, 75, 82, 101, 123 (5x!) |
| `src/features/components/ui/steps/ComponentConfigStep.tsx` | 49, 59 |
| `src/features/mesh/ui/steps/ApiMeshStep.tsx` | 56, 88 |
| `src/features/mesh/ui/steps/components/MeshStatusDisplay.tsx` | 24 |

**Abstraction Opportunity:** Create `<CenteredFeedbackContainer>` component.

---

### Pattern B: Project Status Helpers (MEDIUM SEVERITY)

**Occurrences:** 2 files with byte-for-byte identical code

Both `ProjectCard.tsx` and `ProjectRow.tsx` contain identical functions:

```typescript
function getStatusText(status: Project['status'], port?: number): string { ... }
function getStatusVariant(status: Project['status']): 'success' | 'neutral' | 'warning' | 'error' { ... }
function getFrontendPort(project: Project): number | undefined { ... }
```

**Files:**
- `src/features/projects-dashboard/ui/components/ProjectCard.tsx:24-72`
- `src/features/projects-dashboard/ui/components/ProjectRow.tsx:24-72`

**Impact:** 72 lines of duplicate code that should be extracted to `projectStatusHelpers.ts`.

---

### Pattern C: Success/Completion States (MEDIUM SEVERITY)

**Occurrences:** 3+ files

Same checkmark + message pattern implemented independently:

| File | Lines | Implementation |
|------|-------|----------------|
| `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` | 82-95 | Inline Flex + CheckmarkCircle + text |
| `src/features/mesh/ui/steps/components/MeshStatusDisplay.tsx` | 37-48 | Inline Flex + CheckmarkCircle + text |
| `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx` | 622-630 | CheckmarkCircle + text |

**Abstraction Opportunity:** Create `<SuccessStateDisplay>` component.

---

### Pattern D: Feature-Specific Error States (LOW SEVERITY)

**Occurrences:** 5 files

Each feature implements similar error handling:

| Component | File | Approach |
|-----------|------|----------|
| `AuthErrorState` | `src/features/authentication/ui/steps/components/AuthErrorState.tsx` | Wraps StatusDisplay |
| `MeshErrorDialog` | `src/features/mesh/ui/steps/components/MeshErrorDialog.tsx` | StatusDisplay + modal |
| Inline error handling | AuthStep, ProjectCreationStep, ApiMeshStep | Custom JSX |

All use StatusDisplay under the hood but add unnecessary wrappers.

---

## 3. Inconsistency Report

### Loading States - 3 Different Approaches

| Approach | Where Used | Issue |
|----------|------------|-------|
| `LoadingDisplay` in Flex wrapper | 7 files | Requires manual 350px Flex container |
| `LoadingOverlay` modal | 3 files | For blocking operations only |
| Inline `<Flex><ProgressCircle/></Flex>` | SelectionStepContent | Reinvents the pattern |

**Recommendation:** Standardize on `<CenteredFeedbackContainer>` with `<LoadingDisplay>`.

---

### Error States - 4 Different Approaches

| Approach | Where Used | Issue |
|----------|------------|-------|
| `StatusDisplay variant="error"` | 5 files | Standard approach |
| `AuthErrorState` wrapper | 1 file | Unnecessary wrapper around StatusDisplay |
| `MeshErrorDialog` | 1 file | Mixes error display + modal instructions |
| Inline error JSX | ProjectCreationStep | No reuse, inconsistent styling |

**Recommendation:** Use `StatusDisplay variant="error"` consistently, extract `FeatureErrorDialog` for cases needing instructions modal.

---

### Button Layout in Footers - Inconsistent

| Location | Pattern | Issue |
|----------|---------|-------|
| ProjectCreationStep | Custom footer logic with spacers | Lines 136-185 |
| WizardContainer | Standard footer pattern | Consistent |
| ApiMeshStep | Button patterns in status displays | Mixed concerns |

**Recommendation:** Create `<StepFooterBar>` component with standardized spacing.

---

## 4. Extraction Opportunities (Ranked by Impact)

### TIER 1: High Value, Quick Wins

| Opportunity | Effort | Impact | Eliminates |
|-------------|--------|--------|------------|
| **ProjectStatusUtils** | 5 min | High | 72 duplicate lines |
| **CenteredFeedbackContainer** | 10 min | High | 12+ Flex wrappers |
| **SuccessStateDisplay** | 15 min | Medium | 3 different success patterns |

#### CenteredFeedbackContainer

```tsx
// src/core/ui/components/feedback/CenteredFeedbackContainer.tsx

interface CenteredFeedbackContainerProps {
  children: React.ReactNode;
  height?: string; // default "350px"
  maxWidth?: string;
}

export function CenteredFeedbackContainer({
  children,
  height = "350px",
  maxWidth
}: CenteredFeedbackContainerProps) {
  return (
    <Flex
      direction="column"
      justifyContent="center"
      alignItems="center"
      height={height}
      maxWidth={maxWidth}
    >
      {children}
    </Flex>
  );
}

// Usage:
<CenteredFeedbackContainer>
  <LoadingDisplay message="Loading projects..." />
</CenteredFeedbackContainer>
```

#### ProjectStatusUtils

```typescript
// src/features/projects-dashboard/utils/projectStatusHelpers.ts

import type { Project } from '@/types/base';

export type StatusVariant = 'success' | 'neutral' | 'warning' | 'error';

export function getStatusText(status: Project['status'], port?: number): string {
  switch (status) {
    case 'running':
      return port ? `Running on port ${port}` : 'Running';
    case 'stopped':
      return 'Stopped';
    case 'error':
      return 'Error';
    default:
      return 'Unknown';
  }
}

export function getStatusVariant(status: Project['status']): StatusVariant {
  switch (status) {
    case 'running':
      return 'success';
    case 'stopped':
      return 'neutral';
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

export function getFrontendPort(project: Project): number | undefined {
  return project.frontendPort ?? project.port;
}
```

#### SuccessStateDisplay

```tsx
// src/core/ui/components/feedback/SuccessStateDisplay.tsx

interface SuccessStateDisplayProps {
  title: string;
  message?: string;
  details?: string[];
  actions?: StatusAction[];
  height?: string;
}

export function SuccessStateDisplay({
  title,
  message,
  details,
  actions,
  height = "350px"
}: SuccessStateDisplayProps) {
  return (
    <CenteredFeedbackContainer height={height}>
      <StatusDisplay
        variant="success"
        title={title}
        message={message}
        details={details}
        actions={actions}
      />
    </CenteredFeedbackContainer>
  );
}
```

---

### TIER 2: Medium Value

| Opportunity | Effort | Impact |
|-------------|--------|--------|
| **StepFooterBar** | 20 min | Standardizes wizard footers |
| **FeatureErrorDialog** | 15 min | Consolidates error + instructions pattern |

#### StepFooterBar

```tsx
// src/core/ui/components/layout/StepFooterBar.tsx

interface StepFooterBarProps {
  leftContent?: React.ReactNode;  // Cancel, Back buttons
  centerContent?: React.ReactNode; // Logs toggle
  rightContent?: React.ReactNode;  // Continue, Create buttons
}
```

#### FeatureErrorDialog

```tsx
// src/core/ui/components/feedback/FeatureErrorDialog.tsx

interface FeatureErrorDialogProps {
  title: string;
  message: string;
  instructions?: string[];
  onRetry?: () => void;
  onDismiss?: () => void;
  showInstructionsModal?: boolean;
}
```

---

### TIER 3: Cleanup

| Action | Effort | Notes |
|--------|--------|-------|
| Remove 5 unused components | 10 min | Icon, Badge, Tip, CompactOption, ComponentCard |
| Consolidate StatusCard | 5 min | Replace with inline StatusDot + Text |
| Enforce barrel exports | 15 min | Update imports to use index.ts |

---

## 5. Positive Findings (What's Working Well)

### SelectionStepContent Pattern (Excellent)

**File:** `src/features/authentication/ui/components/SelectionStepContent.tsx`

This is an excellent abstraction:
- Generic over item type (`T extends SelectableItem`)
- Handles 4 states: Loading, Error, Empty, Data
- Delegates list rendering to SearchableList
- Reused by AdobeProjectStep and AdobeWorkspaceStep

**Recommendation:** Use this as a model for other multi-state components.

### Hook Extraction (Good)

Hooks are well-structured with clear separation of concerns:

| Hook | Used By | Purpose |
|------|---------|---------|
| `useSelectionStep` | AdobeProjectStep, AdobeWorkspaceStep | Selection state management |
| `useComponentSelection` | ComponentSelectionStep | Component selection logic |
| `useAuthStatus` | AdobeAuthStep | Auth status management |
| `useComponentConfig` | ComponentConfigStep | Config step logic |

### Layout Components (Good)

Layout components support Spectrum design tokens properly:
- `PageLayout` - Full viewport with header/content/footer slots
- `TwoColumnLayout` - Responsive two-column with sidebar
- `SingleColumnLayout` - Constrained width column
- `GridLayout` - CSS grid with gap tokens

---

## 6. Import/Export Analysis

### Well-Structured Exports

- Layout components properly exported from `layout/index.ts`
- Feedback components properly exported from `feedback/index.ts`
- UI components properly exported from `ui/index.ts`

### Issues Found

- `StatusCard` imports `StatusDot` directly instead of via barrel export
- Some features import components directly instead of via barrel exports

**Recommendation:** Enforce barrel export usage:
```typescript
// Good
import { StatusDot } from '@/core/ui/components/ui';

// Avoid
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
```

---

## 7. Priority Recommendations

### Immediate (Quick Wins)

1. **Extract ProjectStatusUtils** - 5 minutes, eliminates 72 lines
2. **Create CenteredFeedbackContainer** - 10 minutes, standardizes 12+ layouts
3. **Create SuccessStateDisplay** - 15 minutes, unifies 3 patterns

### Short-Term

4. Create StepFooterBar component - 20 minutes
5. Create FeatureErrorDialog wrapper - 15 minutes
6. Remove 5 unused components - 10 minutes

### Medium-Term

7. Standardize button layouts in wizard footers
8. Document loading/error/success conventions
9. Add lint rules to detect duplicate helpers
10. Update all imports to use barrel exports

---

## Estimated Effort

| Category | Items | Time |
|----------|-------|------|
| TIER 1 Quick Wins | 3 | 30 min |
| TIER 2 Medium Value | 2 | 35 min |
| TIER 3 Cleanup | 3 | 30 min |
| **Total** | **8** | **~2 hours** |

**Value:** 200+ lines of duplicate code eliminated, improved consistency across 5+ features.
