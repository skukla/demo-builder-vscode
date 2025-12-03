# Component Extraction Research

## Executive Summary

Audit of 6 webviews (Wizard, Projects Dashboard, Project Dashboard, Configure, Welcome, Sidebar) reveals **significant duplication** in header, footer, and layout patterns. Three high-priority extractions would eliminate 100+ lines of duplicated code and establish consistent patterns for the Project Dashboard redesign.

## Current State

### Webviews Audited

| Webview | Entry Point | Header Pattern | Footer Pattern |
|---------|-------------|----------------|----------------|
| Wizard | `WizardContainer.tsx` | Fixed, bg-gray-75, border-b | Fixed, Cancel/Back/Continue |
| Projects Dashboard | `ProjectsDashboard.tsx` | Fixed, bg-gray-75, border-b, + action button | None |
| Project Dashboard | `ProjectDashboardScreen.tsx` | **None** (back button in content) | None |
| Configure | `ConfigureScreen.tsx` | Fixed, bg-gray-75, border-b | Fixed, Close/Save |
| Welcome | `WelcomeScreen.tsx` | Centered (different pattern) | None |
| Sidebar | `Sidebar.tsx` | None (context-aware) | None |

**Key Finding**: Project Dashboard is the outlier - it lacks the standard header/footer pattern used by Wizard, Projects Dashboard, and Configure.

## Duplication Analysis

### 1. Fixed Header Pattern (3 occurrences)

**Files**: WizardContainer.tsx:525-535, ProjectsDashboard.tsx:130-150, ConfigureScreen.tsx:681-691

```tsx
// Pattern repeated 3 times:
<View
    padding="size-400"
    UNSAFE_className={cn('border-b', 'bg-gray-75')}
>
    <Heading level={1} marginBottom="size-100">{title}</Heading>
    <Heading level={3} UNSAFE_className={cn('font-normal', 'text-gray-600')}>
        {subtitle}
    </Heading>
</View>
```

**Variations**:
- ProjectsDashboard adds right-aligned action button
- Some use `max-w-800` content constraint, some don't

### 2. Fixed Footer Pattern (2 occurrences)

**Files**: WizardContainer.tsx:571-606, ConfigureScreen.tsx:747-770

```tsx
// Pattern repeated 2 times:
<View
    padding="size-400"
    UNSAFE_className={cn('border-t', 'bg-gray-75')}
>
    <div className="max-w-800 w-full">
        <Flex justifyContent="space-between" width="100%">
            <Button variant="secondary" onPress={handleCancel} isQuiet>
                Cancel
            </Button>
            <Flex gap="size-100">
                <Button variant="secondary" onPress={goBack} isQuiet>Back</Button>
                <Button variant="accent" onPress={goNext}>Continue</Button>
            </Flex>
        </Flex>
    </div>
</View>
```

### 3. Back Navigation Pattern (2 occurrences)

**Files**: ProjectDashboardScreen.tsx:247-251, Sidebar.tsx:137-142

```tsx
// Pattern repeated 2 times:
<ActionButton isQuiet onPress={handleNavigateBack}>
    <ChevronLeft size="S" />
    <Text>All Projects</Text>
</ActionButton>
```

### 4. Loading Overlay Pattern (inconsistent)

**WizardContainer** uses custom inline styles instead of shared Spinner component:
```tsx
// Custom implementation - should use shared component
<div style={LOADING_OVERLAY_STYLES.container}>
    <div style={LOADING_OVERLAY_STYLES.innerCircle}>
        <div style={LOADING_OVERLAY_STYLES.spinner} />
    </div>
</div>
```

## Existing Shared Components

### Already Extracted (in `src/core/ui/components/`)

| Component | Location | Used By |
|-----------|----------|---------|
| TwoColumnLayout | layout/TwoColumnLayout.tsx | AdobeProjectStep, AdobeWorkspaceStep, ConfigureScreen |
| GridLayout | layout/GridLayout.tsx | WelcomeScreen, ProjectDashboardScreen |
| SearchHeader | navigation/SearchHeader.tsx | ProjectsDashboard |
| NavigationPanel | navigation/NavigationPanel.tsx | ConfigureScreen |
| TimelineNav | TimelineNav.tsx | WizardContainer, Sidebar |
| LoadingDisplay | feedback/LoadingDisplay.tsx | SelectionStepContent, PrerequisitesStep |
| StatusDisplay | feedback/StatusDisplay.tsx | AuthErrorState, MeshErrorDialog |
| ErrorDisplay | feedback/ErrorDisplay.tsx | Limited use |
| EmptyState | feedback/EmptyState.tsx | SelectionStepContent |

### Consolidation Needed

1. **StatusDisplay vs ErrorDisplay** - Similar purpose, different APIs. Consolidate to StatusDisplay.
2. **DashboardEmptyState** - Feature-specific, should compose with generic EmptyState.

## Extraction Recommendations

### Phase 1: High Priority (3+ uses, high impact)

#### 1.1 PageHeader Component

**Location**: `src/core/ui/components/layout/PageHeader.tsx`

**Props**:
```typescript
interface PageHeaderProps {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;        // Right-aligned action button
    backButton?: {                   // Optional back navigation
        label: string;
        onPress: () => void;
    };
    constrainWidth?: boolean;        // Wrap in max-w-800
}
```

**Impact**: Eliminates ~45 lines of duplicated code (15 lines × 3 files)

**Files to Update**:
- WizardContainer.tsx:525-535
- ProjectsDashboard.tsx:130-150
- ConfigureScreen.tsx:681-691
- ProjectDashboardScreen.tsx (add header to match pattern)

#### 1.2 PageFooter Component

**Location**: `src/core/ui/components/layout/PageFooter.tsx`

**Props**:
```typescript
interface PageFooterProps {
    leftContent?: React.ReactNode;   // Cancel/Close button
    rightContent?: React.ReactNode;  // Back/Continue buttons
    constrainWidth?: boolean;        // Wrap in max-w-800
}
```

**Impact**: Eliminates ~50 lines of duplicated code (25 lines × 2 files)

**Files to Update**:
- WizardContainer.tsx:571-606
- ConfigureScreen.tsx:747-770

#### 1.3 PageLayout Component

**Location**: `src/core/ui/components/layout/PageLayout.tsx`

**Props**:
```typescript
interface PageLayoutProps {
    header?: React.ReactNode;        // PageHeader or custom
    footer?: React.ReactNode;        // PageFooter or custom
    children: React.ReactNode;       // Scrollable content
    backgroundColor?: string;        // Default: gray-50
}
```

**Structure**:
```tsx
<View height="100vh" backgroundColor={backgroundColor}>
    {header}
    <View flex={1} overflow="auto">
        {children}
    </View>
    {footer}
</View>
```

**Impact**: Standardizes layout pattern across all webviews

**Files to Update**:
- WizardContainer.tsx
- ProjectsDashboard.tsx
- ConfigureScreen.tsx
- ProjectDashboardScreen.tsx (major update to adopt pattern)

### Phase 2: Medium Priority (2 uses)

#### 2.1 BackButton Component

**Location**: `src/core/ui/components/navigation/BackButton.tsx`

**Props**:
```typescript
interface BackButtonProps {
    label?: string;                  // Default: "Back"
    onPress: () => void;
}
```

**Files to Update**:
- ProjectDashboardScreen.tsx:247-251
- Sidebar.tsx:137-142

#### 2.2 LoadingOverlay Component

**Location**: `src/core/ui/components/feedback/LoadingOverlay.tsx`

**Props**:
```typescript
interface LoadingOverlayProps {
    isVisible: boolean;
    message?: string;
}
```

**Files to Update**:
- WizardContainer.tsx (replace custom LOADING_OVERLAY_STYLES)

### Phase 3: Consolidation

#### 3.1 Deprecate ErrorDisplay

- Migrate all uses to StatusDisplay
- StatusDisplay already supports error variant with actions

#### 3.2 Refactor DashboardEmptyState

- Compose with generic EmptyState component
- Keep feature-specific styling as wrapper

## Impact on Project Dashboard Redesign

After Phase 1 extraction, the Project Dashboard redesign becomes straightforward:

```tsx
// ProjectDashboardScreen.tsx - After extraction
<PageLayout
    header={
        <PageHeader
            title={project.name}
            subtitle={`${project.path}`}
            backButton={{ label: "All Projects", onPress: handleBack }}
        />
    }
>
    {/* Status cards and action grid */}
</PageLayout>
```

This brings Project Dashboard into alignment with:
- Wizard (same header/footer pattern)
- Projects Dashboard (same header pattern)
- Configure (same header/footer pattern)

## Lifecycle Implications

The current "webview lifecycle spaghetti" partly stems from inconsistent patterns:

1. **Different disposal handling** - Each webview handles cleanup differently
2. **Inconsistent state management** - No shared pattern for loading/error/ready states
3. **Ad-hoc navigation** - Back navigation implemented 3 different ways

**After extraction**:
- PageLayout can manage consistent mounting/unmounting
- Shared components can handle their own state transitions
- Navigation patterns become predictable

## Recommended Execution Order

1. **Extract PageHeader** (lowest risk, highest visibility)
2. **Extract PageFooter** (builds on PageHeader pattern)
3. **Extract PageLayout** (combines the above)
4. **Update ProjectDashboardScreen** to use new components (the redesign)
5. **Extract BackButton** (cleanup)
6. **Extract LoadingOverlay** (cleanup)
7. **Consolidate EmptyState/ErrorDisplay** (cleanup)

## PM Decisions (Resolved)

### 1. Back Button Placement
**Decision**: Use footer with Back button on left (consistent with wizard pattern).
- Left side = navigation/exit (Back, Cancel)
- Right side = forward actions (Continue, Save, contextual buttons)

### 2. Status Cards Location
**Decision**: Keep status cards in scrollable content (current behavior).

### 3. Project Dashboard Footer
**Decision**: Add contextual footer with:
- Left: `← All Projects` (always)
- Right: Contextual content based on state:
  - Normal: empty or status text
  - Auth expired: `Sign In` button
  - Mesh deploying: status indicator

### 4. Welcome Screen
**Decision**: Remove legacy Welcome screen entirely.
- Update fallbacks to use `demoBuilder.showProjectsList` instead
- Delete `src/features/welcome/` directory
- Projects Dashboard is now the "home" screen

### 5. Card Standardization
**Decision**: Create shared `Card` component using existing custom CSS pattern.
- Retain dark header styling (works in dark mode)
- Provide consistent API for ProjectCard and other card uses
- Do NOT add @spectrum-css/card dependency (custom pattern is working)

## Updated Extraction List

### Phase 1: Core Layout Components
1. **PageHeader** - Title, subtitle, optional action button
2. **PageFooter** - Left/right content slots (navigation left, actions right)
3. **PageLayout** - Combines header + scrollable content + footer
4. **Card** - Standardized card with optional dark header section

### Phase 2: Navigation & Feedback
5. **BackButton** - Consistent back navigation styling
6. **LoadingOverlay** - Replace WizardContainer's custom inline styles

### Phase 3: Cleanup
7. **Remove Welcome Screen** - Delete feature, update fallbacks
8. **Consolidate EmptyState** - DashboardEmptyState should use generic EmptyState
9. **Deprecate ErrorDisplay** - Use StatusDisplay for all error cases

## Next Steps

1. **PM Approval**: Confirm research findings and decisions
2. **Planning Phase**: Create detailed implementation plan with TDD approach
3. **Implementation**: Extract components following Phase 1 → 2 → 3 order
