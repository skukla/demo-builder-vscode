# Hooks & Business Logic Extraction - Project-Specific SOP

**Version**: 1.0.0
**Last Updated**: 2025-01-14
**Priority**: Project-specific

---

## Overview

This SOP defines when and how to extract React hooks and business logic to improve code organization, testability, and reusability. Proper extraction separates concerns, making components cleaner and logic more maintainable.

---

## 1. When to Extract Hooks

### Extraction Triggers

| Trigger | Threshold | Example |
|---------|-----------|---------|
| **useState + useEffect combo** | Related state with side effects | Data fetching with loading/error states |
| **Repeated hook patterns** | 2+ components using same logic | Form validation in multiple forms |
| **Complex state logic** | >3 related state variables | Multi-step wizard state |
| **Side effect management** | Subscriptions, timers, DOM manipulation | Event listeners, intervals |
| **Derived state calculations** | Complex computations from state | Filtered/sorted lists |
| **Component length** | Hook logic >30 lines in component | Inline data fetching logic |

### Do NOT Extract When

- Hook would only wrap a single useState
- Logic is truly component-specific with no reuse potential
- Extraction would make the flow harder to follow
- Hook would need >6 parameters

---

## 2. Hook Extraction Patterns

### Pattern A: Data Fetching Hook

**When**: Component fetches data with loading/error states.

```typescript
// ❌ BEFORE: Inline data fetching
function ProjectList() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let mounted = true;

        async function fetchData() {
            try {
                const data = await api.getProjects();
                if (mounted) {
                    setProjects(data);
                    setLoading(false);
                }
            } catch (err) {
                if (mounted) {
                    setError(err as Error);
                    setLoading(false);
                }
            }
        }

        fetchData();
        return () => { mounted = false; };
    }, []);

    // ... rendering
}

// ✅ AFTER: Extracted hook
// src/features/projects-dashboard/ui/hooks/useProjects.ts
interface UseProjectsReturn {
    projects: Project[];
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.getProjects();
            setProjects(data);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { projects, loading, error, refetch: fetchData };
}

// Component is now clean
function ProjectList() {
    const { projects, loading, error } = useProjects();
    // ... rendering only
}
```

### Pattern B: Form State Hook

**When**: Form with validation, dirty tracking, submission handling.

```typescript
// ✅ Extracted form hook
// src/core/ui/hooks/useFormState.ts
interface UseFormStateOptions<T> {
    initialValues: T;
    validate?: (values: T) => Partial<Record<keyof T, string>>;
    onSubmit: (values: T) => Promise<void>;
}

interface UseFormStateReturn<T> {
    values: T;
    errors: Partial<Record<keyof T, string>>;
    touched: Partial<Record<keyof T, boolean>>;
    isDirty: boolean;
    isSubmitting: boolean;
    setValue: <K extends keyof T>(field: K, value: T[K]) => void;
    setTouched: (field: keyof T) => void;
    handleSubmit: (e: React.FormEvent) => Promise<void>;
    reset: () => void;
}

export function useFormState<T extends Record<string, unknown>>({
    initialValues,
    validate,
    onSubmit,
}: UseFormStateOptions<T>): UseFormStateReturn<T> {
    // Implementation
}
```

### Pattern C: Toggle/Boolean State Hook

**When**: Simple boolean state with toggle functionality.

```typescript
// ✅ Extracted toggle hook
// src/core/ui/hooks/useToggle.ts
export function useToggle(initialValue = false): [boolean, () => void, (value: boolean) => void] {
    const [value, setValue] = useState(initialValue);
    const toggle = useCallback(() => setValue(v => !v), []);
    return [value, toggle, setValue];
}

// Usage
const [isOpen, toggleOpen, setIsOpen] = useToggle(false);
```

### Pattern D: Async Action Hook

**When**: Button triggers async operation with loading state.

```typescript
// ✅ Extracted async action hook
// src/core/ui/hooks/useAsyncAction.ts
interface UseAsyncActionReturn<T> {
    execute: (...args: Parameters<T>) => Promise<void>;
    loading: boolean;
    error: Error | null;
    reset: () => void;
}

export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
    action: T
): UseAsyncActionReturn<T> {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const execute = useCallback(async (...args: Parameters<T>) => {
        setLoading(true);
        setError(null);
        try {
            await action(...args);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [action]);

    const reset = useCallback(() => setError(null), []);

    return { execute, loading, error, reset };
}

// Usage
const { execute: deployMesh, loading, error } = useAsyncAction(meshService.deploy);
```

### Pattern E: Debounced Value Hook

**When**: Need to debounce user input for search/filtering.

```typescript
// ✅ Already exists in project
// src/core/ui/hooks/useDebouncedValue.ts
export function useDebouncedValue<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}
```

---

## 3. Business Logic Extraction

### When to Extract Business Logic

| Trigger | Extract To | Example |
|---------|------------|---------|
| **Pure calculations** | Utility functions | `calculateDiscount(price, percent)` |
| **Data transformations** | Helper functions | `formatProjectForDisplay(project)` |
| **Validation logic** | Validator functions | `validateEmail(email)` |
| **API response mapping** | Mapper functions | `mapApiResponseToProject(response)` |
| **Complex conditionals** | Predicate functions | `canUserEditProject(user, project)` |
| **State derivation** | Selector functions | `getActiveProjects(projects)` |

### Pattern: Pure Function Extraction

```typescript
// ❌ BEFORE: Logic mixed in component
function ProjectCard({ project }: { project: Project }) {
    const isOverdue = project.dueDate && new Date(project.dueDate) < new Date();
    const statusColor = project.status === 'active' ? 'green'
        : project.status === 'paused' ? 'yellow'
        : 'gray';
    const displayName = project.name.length > 30
        ? project.name.slice(0, 27) + '...'
        : project.name;
    // ... rendering
}

// ✅ AFTER: Extracted to helpers
// src/features/projects-dashboard/utils/projectHelpers.ts
export function isProjectOverdue(project: Project): boolean {
    return Boolean(project.dueDate && new Date(project.dueDate) < new Date());
}

export function getProjectStatusColor(status: ProjectStatus): string {
    const colors: Record<ProjectStatus, string> = {
        active: 'green',
        paused: 'yellow',
        archived: 'gray',
    };
    return colors[status] ?? 'gray';
}

export function truncateProjectName(name: string, maxLength = 30): string {
    return name.length > maxLength ? `${name.slice(0, maxLength - 3)}...` : name;
}

// Component is now declarative
function ProjectCard({ project }: { project: Project }) {
    const isOverdue = isProjectOverdue(project);
    const statusColor = getProjectStatusColor(project.status);
    const displayName = truncateProjectName(project.name);
    // ... rendering
}
```

### Pattern: Type Guard Extraction

```typescript
// ✅ Extract type guards for validation
// src/types/typeGuards.ts
export function isValidProject(value: unknown): value is Project {
    if (!isRecord(value)) return false;
    if (typeof value.id !== 'string') return false;
    if (typeof value.name !== 'string') return false;
    if (!isValidProjectStatus(value.status)) return false;
    return true;
}

export function hasRequiredAdobeConfig(config: WizardState): boolean {
    return Boolean(
        config.adobe?.organization?.id &&
        config.adobe?.project?.id &&
        config.adobe?.workspace?.id
    );
}
```

### Pattern: Predicate Function Extraction

```typescript
// ✅ Extract predicates for conditional logic
// src/features/authentication/ui/steps/authPredicates.ts
export function canProceedFromAuth(state: WizardState): boolean {
    if (!state.adobe?.isAuthenticated) return false;
    if (!state.adobe?.organization?.id) return false;
    if (!state.adobe?.project?.id) return false;
    if (!state.adobe?.workspace?.id) return false;
    return true;
}

export function isTokenExpiringSoon(expiresAt: number, thresholdMs = 300000): boolean {
    return Date.now() > expiresAt - thresholdMs;
}

export function shouldRefreshAuth(auth: AuthState): boolean {
    if (!auth.token) return true;
    if (isTokenExpiringSoon(auth.expiresAt)) return true;
    return false;
}
```

---

## 4. File Organization

### Hook Location Guidelines

| Hook Type | Location | Example |
|-----------|----------|---------|
| **Shared UI hooks** | `src/core/ui/hooks/` | `useDebouncedValue`, `useToggle` |
| **Feature-specific hooks** | `src/features/{feature}/ui/hooks/` | `useProjects`, `useMeshStatus` |
| **Form hooks** | `src/core/ui/hooks/` | `useFormState`, `useFieldValidation` |
| **Data fetching hooks** | Feature's hooks directory | `useProject`, `useComponentConfig` |

### Business Logic Location Guidelines

| Logic Type | Location | Example |
|------------|----------|---------|
| **Type guards** | `src/types/typeGuards.ts` | `isProject`, `isValidConfig` |
| **Shared utilities** | `src/core/utils/` | `formatDate`, `truncateString` |
| **Feature helpers** | `src/features/{feature}/utils/` | `projectHelpers.ts` |
| **Predicates** | Feature's utils or dedicated file | `authPredicates.ts` |
| **Transformers** | Feature's utils | `transformers.ts` |

### Naming Conventions

| Pattern | Use Case | Example |
|---------|----------|---------|
| `use{Resource}` | Data fetching hooks | `useProjects`, `useMeshStatus` |
| `use{Action}` | Action-oriented hooks | `useDeployMesh`, `useCreateProject` |
| `use{Feature}State` | Complex state hooks | `useWizardState`, `useFormState` |
| `is{Condition}` | Boolean predicates | `isOverdue`, `isValid` |
| `has{Property}` | Property checks | `hasPermission`, `hasConfig` |
| `can{Action}` | Permission checks | `canEdit`, `canDelete` |
| `get{Value}` | Value derivation | `getStatusColor`, `getDisplayName` |
| `format{Type}` | Formatters | `formatDate`, `formatCurrency` |
| `validate{Type}` | Validators | `validateEmail`, `validateConfig` |

---

## 5. Extraction Checklist

### Before Extracting Hooks

- [ ] Is the logic used in 2+ components OR >30 lines?
- [ ] Does it manage related state + effects together?
- [ ] Can it be tested independently?
- [ ] Will extraction simplify the component?

### Before Extracting Business Logic

- [ ] Is it a pure function (no side effects)?
- [ ] Is it used in 2+ places OR complex enough to name?
- [ ] Does it have a clear, single responsibility?
- [ ] Would a descriptive name improve readability?

### During Extraction

- [ ] Define clear TypeScript types for parameters and return
- [ ] Add JSDoc comments for public API
- [ ] Handle edge cases (null, undefined, empty arrays)
- [ ] Export from feature's index.ts if shared

### After Extracting

- [ ] Update imports in all affected components
- [ ] Write unit tests for new hook/function
- [ ] Verify no TypeScript errors
- [ ] Run affected tests

---

## 6. Common Extraction Scenarios

### Scenario 1: Wizard Step State

**Problem**: Each wizard step manages similar state patterns.

```typescript
// ✅ Extract shared wizard step hook
// src/features/project-creation/ui/hooks/useWizardStep.ts
interface UseWizardStepOptions<T> {
    initialData: T;
    validate?: (data: T) => boolean;
    onComplete: (data: T) => void;
}

export function useWizardStep<T>({ initialData, validate, onComplete }: UseWizardStepOptions<T>) {
    const [data, setData] = useState(initialData);
    const [isValid, setIsValid] = useState(false);

    useEffect(() => {
        setIsValid(validate?.(data) ?? true);
    }, [data, validate]);

    const handleChange = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
        setData(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleComplete = useCallback(() => {
        if (isValid) onComplete(data);
    }, [data, isValid, onComplete]);

    return { data, isValid, handleChange, handleComplete };
}
```

### Scenario 2: Selection State

**Problem**: Multiple components handle selection with similar logic.

```typescript
// ✅ Extract selection hook
// src/core/ui/hooks/useSelection.ts
interface UseSelectionOptions<T> {
    items: T[];
    getKey: (item: T) => string;
    multiple?: boolean;
}

export function useSelection<T>({ items, getKey, multiple = false }: UseSelectionOptions<T>) {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    const toggle = useCallback((item: T) => {
        const key = getKey(item);
        setSelectedKeys(prev => {
            const next = new Set(multiple ? prev : []);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, [getKey, multiple]);

    const isSelected = useCallback((item: T) => selectedKeys.has(getKey(item)), [selectedKeys, getKey]);
    const selectedItems = items.filter(isSelected);

    return { selectedKeys, selectedItems, toggle, isSelected, clear: () => setSelectedKeys(new Set()) };
}
```

### Scenario 3: Polling/Refresh Logic

**Problem**: Components that poll for updates.

```typescript
// ✅ Extract polling hook
// src/core/ui/hooks/usePolling.ts
interface UsePollingOptions<T> {
    fetcher: () => Promise<T>;
    interval: number;
    enabled?: boolean;
}

export function usePolling<T>({ fetcher, interval, enabled = true }: UsePollingOptions<T>) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!enabled) return;

        let mounted = true;

        const poll = async () => {
            try {
                const result = await fetcher();
                if (mounted) setData(result);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        poll();
        const timer = setInterval(poll, interval);

        return () => {
            mounted = false;
            clearInterval(timer);
        };
    }, [fetcher, interval, enabled]);

    return { data, loading };
}
```

---

## 7. AI Agent Integration

### Scan Patterns for Hook Extraction

When scanning for extraction opportunities, look for:

1. **useState + useEffect pairs**: State with related side effects
2. **Repeated hook patterns**: Same hooks used across components
3. **Complex useEffect**: Effects with multiple dependencies and cleanup
4. **Inline async operations**: Data fetching in useEffect
5. **Callback definitions**: Complex useCallback logic

### Scan Patterns for Business Logic Extraction

When scanning for extraction opportunities, look for:

1. **Inline calculations**: Complex expressions in JSX or assignments
2. **Repeated conditionals**: Same condition checked multiple times
3. **Type coercion chains**: Multiple `&&` or `||` for type safety
4. **String/array transformations**: map/filter/reduce chains
5. **Validation logic**: Input checking spread across components

### Auto-Fix Capabilities

- **HIGH confidence**: Extract identical hook patterns to shared hook
- **MEDIUM confidence**: Suggest extraction for repeated logic patterns
- **LOW confidence**: Flag complex inline logic for manual review

---

## 8. Summary

| Rule | Threshold | Action |
|------|-----------|--------|
| Hook logic in component | >30 lines | Extract to custom hook |
| useState + useEffect pair | Related state/effect | Extract to data hook |
| Repeated hook pattern | 2+ components | Extract to shared hook |
| Inline calculation | >1 line of logic | Extract to helper function |
| Repeated conditional | 2+ occurrences | Extract to predicate function |
| Type validation | >3 checks | Extract to type guard |

**Golden Rule**: Hooks manage stateful behavior, pure functions handle transformations. Keep them separate and focused.
