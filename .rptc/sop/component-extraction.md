# Component Extraction - Project-Specific SOP

**Version**: 1.0.0
**Last Updated**: 2025-01-14
**Priority**: Project-specific

---

## Overview

This SOP defines when and how to extract React components to improve code organization, reusability, and maintainability. Component extraction is a key refactoring technique that reduces file size, improves testability, and promotes consistent UI patterns.

---

## 1. When to Extract Components

### Extraction Triggers

| Trigger | Threshold | Example |
|---------|-----------|---------|
| **File length** | >300 lines | Large step component with multiple sections |
| **Repeated JSX patterns** | 2+ occurrences | Same card layout in multiple places |
| **Nested rendering logic** | >2 levels of conditionals | Complex status displays |
| **Distinct UI sections** | Logically separable areas | Header, content, footer within a step |
| **Props drilling** | >3 levels deep | Pass props through intermediate components |
| **Testability needs** | Hard to test in isolation | Complex form section needing unit tests |

### Do NOT Extract When

- Component would have <20 lines
- Only used in one place with no reuse potential
- Extraction would require excessive prop passing (>8 props)
- Logic is tightly coupled to parent state

---

## 2. Component Extraction Patterns

### Pattern A: Presentational Component Extraction

**When**: UI rendering is complex but logic is simple.

```typescript
// ❌ BEFORE: Large inline JSX
function StepComponent() {
    return (
        <div>
            <div className="header">
                <Text UNSAFE_className="text-xl font-bold">{title}</Text>
                <Text UNSAFE_className="text-sm text-gray-500">{subtitle}</Text>
                <StatusBadge status={status} />
            </div>
            {/* ... more sections */}
        </div>
    );
}

// ✅ AFTER: Extracted presentational component
interface StepHeaderProps {
    title: string;
    subtitle: string;
    status: Status;
}

function StepHeader({ title, subtitle, status }: StepHeaderProps): React.ReactElement {
    return (
        <div className="header">
            <Text UNSAFE_className="text-xl font-bold">{title}</Text>
            <Text UNSAFE_className="text-sm text-gray-500">{subtitle}</Text>
            <StatusBadge status={status} />
        </div>
    );
}

function StepComponent() {
    return (
        <div>
            <StepHeader title={title} subtitle={subtitle} status={status} />
            {/* ... more sections */}
        </div>
    );
}
```

### Pattern B: Container/Presenter Split

**When**: Component has both complex state management AND complex rendering.

```typescript
// ❌ BEFORE: Mixed concerns
function ProjectCard({ projectId }: { projectId: string }) {
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        loadProject(projectId).then(setProject).catch(setError).finally(() => setLoading(false));
    }, [projectId]);

    if (loading) return <Spinner />;
    if (error) return <ErrorDisplay error={error} />;
    if (!project) return null;

    return (
        <div className="card">
            {/* 50+ lines of rendering */}
        </div>
    );
}

// ✅ AFTER: Split into container and presenter
// ProjectCardContainer.tsx - handles data fetching
function ProjectCardContainer({ projectId }: { projectId: string }) {
    const { project, loading, error } = useProject(projectId);

    if (loading) return <Spinner />;
    if (error) return <ErrorDisplay error={error} />;
    if (!project) return null;

    return <ProjectCardPresenter project={project} />;
}

// ProjectCardPresenter.tsx - pure rendering
interface ProjectCardPresenterProps {
    project: Project;
}

function ProjectCardPresenter({ project }: ProjectCardPresenterProps): React.ReactElement {
    return (
        <div className="card">
            {/* Pure rendering, easy to test */}
        </div>
    );
}
```

### Pattern C: Compound Component Pattern

**When**: Multiple related components work together with shared context.

```typescript
// ✅ Compound component for complex forms
const ConfigSection = {
    Root: ConfigSectionRoot,
    Header: ConfigSectionHeader,
    Content: ConfigSectionContent,
    Field: ConfigSectionField,
    Actions: ConfigSectionActions,
};

// Usage
<ConfigSection.Root>
    <ConfigSection.Header title="API Settings" />
    <ConfigSection.Content>
        <ConfigSection.Field name="apiKey" />
        <ConfigSection.Field name="endpoint" />
    </ConfigSection.Content>
    <ConfigSection.Actions onSave={handleSave} />
</ConfigSection.Root>
```

---

## 3. File Organization

### Component Location Guidelines

| Component Type | Location | Example |
|----------------|----------|---------|
| **Shared UI primitives** | `src/core/ui/components/{category}/` | `src/core/ui/components/feedback/StatusDisplay.tsx` |
| **Feature-specific** | `src/features/{feature}/ui/components/` | `src/features/dashboard/ui/components/MeshStatus.tsx` |
| **Step components** | `src/features/{feature}/ui/steps/` | `src/features/authentication/ui/steps/AdobeAuthStep.tsx` |
| **Wizard-specific** | `src/features/project-creation/ui/wizard/` | `src/features/project-creation/ui/wizard/TimelineNav.tsx` |

### Core UI Component Categories

```
src/core/ui/components/
├── feedback/        # StatusDisplay, LoadingOverlay, ErrorBoundary
├── forms/           # FormField, ConfigSection, FieldHelpButton
├── layout/          # TwoColumnLayout, GridLayout
├── navigation/      # SearchableList, TimelineNav
└── ui/              # StatusDot, Badge, Modal
```

### Naming Conventions

| Pattern | Use Case | Example |
|---------|----------|---------|
| `{Feature}Step` | Wizard step components | `AdobeAuthStep`, `PrerequisitesStep` |
| `{Feature}Screen` | Full-page screens | `ConfigureScreen`, `DashboardScreen` |
| `{Feature}Card` | Card-style displays | `ProjectCard`, `ComponentCard` |
| `{Feature}List` | List displays | `ProjectsList`, `PrerequisitesList` |
| `{Feature}Status` | Status indicators | `MeshStatus`, `AuthStatus` |
| `{Feature}Form` | Form components | `ProjectForm`, `SettingsForm` |

---

## 4. Props Design Guidelines

### Props Interface Patterns

```typescript
// ✅ GOOD: Clear, typed props with documentation
interface ProjectCardProps {
    /** The project to display */
    project: Project;
    /** Called when user clicks the card */
    onSelect?: (projectId: string) => void;
    /** Whether the card is in a selected state */
    isSelected?: boolean;
    /** Additional CSS classes */
    className?: string;
}

// ❌ BAD: Ambiguous props
interface ProjectCardProps {
    data: any;           // What is "data"?
    handler: Function;   // Handler for what?
    flag?: boolean;      // What does this flag do?
}
```

### Props Count Guidelines

| Props Count | Guidance |
|-------------|----------|
| 1-4 props | Ideal - component is focused |
| 5-8 props | Acceptable - consider grouping related props |
| 9+ props | Too many - split component or use composition |

### Grouping Related Props

```typescript
// ❌ BEFORE: Many individual props
interface FormFieldProps {
    label: string;
    labelPosition: 'top' | 'side';
    labelWidth: string;
    value: string;
    onChange: (value: string) => void;
    error: string | null;
    errorPosition: 'below' | 'tooltip';
    helpText: string;
    helpPosition: 'below' | 'tooltip';
}

// ✅ AFTER: Grouped into logical objects
interface FormFieldProps {
    label: LabelConfig;
    value: string;
    onChange: (value: string) => void;
    validation?: ValidationConfig;
    help?: HelpConfig;
}

interface LabelConfig {
    text: string;
    position?: 'top' | 'side';
    width?: string;
}
```

---

## 5. Extraction Checklist

### Before Extracting

- [ ] Is the component >50 lines or used in 2+ places?
- [ ] Can it be tested independently?
- [ ] Does it have a clear, single responsibility?
- [ ] Will extraction reduce complexity, not add it?

### During Extraction

- [ ] Define clear TypeScript interface for props
- [ ] Export from feature's index.ts if shared within feature
- [ ] Move to `@/core/ui/components/` if shared across features
- [ ] Use existing utility classes from `custom-spectrum.css`
- [ ] Follow naming conventions

### After Extracting

- [ ] Update imports in parent component
- [ ] Add to barrel export if applicable
- [ ] Write or update tests for new component
- [ ] Verify no TypeScript errors
- [ ] Run affected tests

---

## 6. Common Extraction Scenarios

### Scenario 1: Repeated Status Displays

**Problem**: Same status indicator pattern in multiple places.

```typescript
// Found in 3+ components:
<div className="flex items-center gap-2">
    <StatusDot status={status} />
    <Text>{statusLabel}</Text>
</div>

// Extract to:
// src/core/ui/components/feedback/StatusIndicator.tsx
interface StatusIndicatorProps {
    status: 'success' | 'warning' | 'error' | 'pending';
    label: string;
}

export function StatusIndicator({ status, label }: StatusIndicatorProps): React.ReactElement {
    return (
        <div className="flex items-center gap-2">
            <StatusDot status={status} />
            <Text>{label}</Text>
        </div>
    );
}
```

### Scenario 2: Form Sections

**Problem**: Repeated form section structure.

```typescript
// Extract to:
// src/core/ui/components/forms/FormSection.tsx
interface FormSectionProps {
    title: string;
    description?: string;
    children: React.ReactNode;
    isCollapsible?: boolean;
}

export function FormSection({ title, description, children, isCollapsible }: FormSectionProps): React.ReactElement {
    // Implementation
}
```

### Scenario 3: Loading States

**Problem**: Inconsistent loading state handling.

```typescript
// Extract to:
// src/core/ui/components/feedback/LoadingState.tsx
interface LoadingStateProps {
    isLoading: boolean;
    error: Error | null;
    children: React.ReactNode;
    loadingMessage?: string;
}

export function LoadingState({ isLoading, error, children, loadingMessage }: LoadingStateProps): React.ReactElement {
    if (isLoading) return <LoadingOverlay message={loadingMessage} />;
    if (error) return <ErrorDisplay error={error} />;
    return <>{children}</>;
}
```

---

## 7. AI Agent Integration

### Scan Patterns for Component Extraction

When scanning for extraction opportunities, look for:

1. **Large files**: Files >300 lines
2. **Repeated JSX**: Same structure appearing 2+ times
3. **Deep nesting**: >3 levels of JSX nesting
4. **Multiple responsibilities**: Components doing data fetching AND rendering AND state management
5. **Inconsistent patterns**: Same UI concept implemented differently

### Auto-Fix Capabilities

- **HIGH confidence**: Extract clearly repeated JSX patterns
- **MEDIUM confidence**: Suggest container/presenter split for mixed concerns
- **LOW confidence**: Flag large files for manual review

---

## 8. Summary

| Rule | Threshold | Action |
|------|-----------|--------|
| File length | >300 lines | Split into multiple components |
| Repeated JSX | 2+ occurrences | Extract to shared component |
| Props count | >8 props | Split component or use composition |
| Nesting depth | >3 levels | Extract nested sections |
| Mixed concerns | Data + Render | Split container/presenter |

**Golden Rule**: A component should do one thing well. If you can't describe what it does in one sentence, it's probably doing too much.
