# Custom React Hooks

## Overview

This directory contains custom React hooks that extract and encapsulate reusable logic from components. These hooks follow React best practices and naming conventions (`useCamelCase.ts`).

## Architecture

```
hooks/
├── index.ts                    # Barrel export for all hooks
├── CLAUDE.md                   # This file - hook documentation
│
├── VS Code Communication Hooks
│   ├── useVSCodeMessage.ts     # Subscribe to extension messages
│   └── useVSCodeRequest.ts     # Request-response pattern
│
├── State Management Hooks
│   ├── useLoadingState.ts      # Loading/error/data state
│   ├── useSelection.ts         # Single-item selection
│   ├── useAsyncData.ts         # Async data fetching pattern
│   └── useAsyncOperation.ts    # Async operation state management
│
├── UI Interaction Hooks
│   ├── useAutoScroll.ts        # Auto-scroll container logic
│   ├── useSearchFilter.ts      # Search/filter arrays
│   ├── useFocusTrap.ts         # Focus trap for accessibility
│   ├── useFocusOnMount.ts      # Focus element on mount
│   └── useArrowKeyNavigation.ts # Arrow key navigation for lists/grids
│
├── Utility Hooks
│   ├── useDebouncedValue.ts    # Debounce any value
│   ├── useIsMounted.ts         # Track mount state (unmount safety)
│   └── useSetToggle.ts         # Set with toggle functionality
│
└── General-Purpose Hooks
    ├── useDebouncedLoading.ts  # Debounce loading state
    ├── useMinimumLoadingTime.ts # Minimum loading time
    └── useSelectableDefault.ts # Default selection logic
```

## Hook Categories

### VS Code Communication Hooks

#### useVSCodeMessage
Subscribe to messages from the VS Code extension with automatic cleanup.

**Example:**
```tsx
useVSCodeMessage('projects', (data: Project[]) => {
  setProjects(data);
});
```

**Features:**
- Automatic subscription cleanup on unmount
- Memoized callback to prevent unnecessary re-subscriptions
- Optional dependency array for callback updates

#### useVSCodeRequest
Make request-response calls to the extension with built-in state management.

**Example:**
```tsx
const { execute, loading, error, data } = useVSCodeRequest<Project[]>('get-projects');

const loadProjects = async () => {
  try {
    const projects = await execute({ orgId: 'org123' });
    console.log('Loaded:', projects);
  } catch (err) {
    console.error('Failed:', err);
  }
};
```

**Features:**
- Manages loading, error, and data state
- Configurable timeout
- Success/error callbacks
- Reset function

### State Management Hooks

#### useLoadingState
Unified state management for async operations.

**Example:**
```tsx
const {
  data,
  loading,
  error,
  hasLoadedOnce,
  isRefreshing,
  setData,
  setLoading,
  setError,
  setRefreshing
} = useLoadingState<Project[]>([]);

const loadProjects = async (isRefresh = false) => {
  if (isRefresh) {
    setRefreshing(true);
  } else {
    setLoading(true);
  }

  try {
    const result = await fetchProjects();
    setData(result);
  } catch (err) {
    setError(err.message);
  }
};
```

**Features:**
- Tracks loading, error, data states
- `hasLoadedOnce` flag for better UX
- `isRefreshing` for refresh operations
- Reset function

#### useSelection
Manage single-item selection with helper functions.

**Example:**
```tsx
const { selectedItem, select, isSelected, clearSelection } = useSelection<Project>({
  getKey: (p) => p.id,
  onChange: (project) => console.log('Selected:', project)
});

<ListView
  items={projects}
  selectedKeys={selectedItem ? [selectedItem.id] : []}
  onSelectionChange={(keys) => {
    const id = Array.from(keys)[0];
    const project = projects.find(p => p.id === id);
    if (project) select(project);
  }}
/>
```

**Features:**
- Generic type support
- Custom key extraction
- onChange callback
- isSelected helper
- Optional deselection

#### useAsyncData
Comprehensive async data fetching with VS Code message integration.

**Example:**
```tsx
const {
  data: projects,
  loading,
  error,
  load,
  hasLoadedOnce
} = useAsyncData<Project[]>({
  messageType: 'projects',
  errorMessageType: 'project-error',
  autoLoad: true,
  autoSelectSingle: true,
  onAutoSelect: (project) => selectProject(project)
});

return (
  <>
    {loading && !hasLoadedOnce && <LoadingDisplay />}
    {error && <ErrorDisplay message={error} />}
    {projects && <ProjectList items={projects} />}
  </>
);
```

**Features:**
- Combines useLoadingState + useVSCodeMessage
- Auto-load on mount
- Auto-select single item
- Data transformation
- Refresh support

#### useAsyncOperation
Manage async operation state with messages, callbacks, and unmount safety.

**Example:**
```tsx
const checkOperation = useAsyncOperation<CheckResult>({
    onSuccess: (result) => console.log('Success:', result),
    onError: (error) => console.error('Failed:', error),
    initialMessage: 'Checking...',
});

const handleCheck = async () => {
    checkOperation.setMessage('Verifying configuration...');
    await checkOperation.execute(async () => {
        return await api.check();
    });
};

return (
    <div>
        {checkOperation.isExecuting && <Spinner />}
        {checkOperation.message && <Text>{checkOperation.message}</Text>}
        {checkOperation.error && <Error>{checkOperation.error.message}</Error>}
    </div>
);
```

**Features:**
- `isExecuting` state tracking
- `message`/`subMessage` management for status display
- `error` handling with callbacks (onSuccess, onError)
- Unmount safety (prevents state updates after unmount)
- `reset()` function to restore initial state
- Non-Error throws converted to Error objects

**Comparison with useAsyncData:**
- `useAsyncData`: For fetching data that listens to VS Code messages
- `useAsyncOperation`: For executing operations that don't need message integration

### UI Interaction Hooks

#### useAutoScroll
Auto-scroll containers to keep items visible.

**Example:**
```tsx
const { containerRef, createItemRef, scrollToItem } = useAutoScroll({
  enabled: isChecking,
  behavior: 'smooth',
  padding: 10
});

return (
  <div ref={containerRef} style={{ maxHeight: '400px', overflowY: 'auto' }}>
    {items.map((item, index) => (
      <div key={item.id} ref={createItemRef(index)}>
        {item.content}
      </div>
    ))}
  </div>
);
```

**Features:**
- Smart visibility detection
- Configurable scroll behavior
- Manual scroll controls
- Padding support

#### useSearchFilter
Search and filter arrays with memoization.

**Example:**
```tsx
const { query, setQuery, filteredItems, isFiltering } = useSearchFilter(projects, {
  searchFields: ['title', 'name', 'description'],
  caseSensitive: false
});

return (
  <>
    <SearchField value={query} onChange={setQuery} />
    <ListView items={filteredItems} />
    {isFiltering && <Text>Showing {filteredItems.length} results</Text>}
  </>
);
```

**Features:**
- Multiple field search
- Case sensitivity option
- Custom filter function
- Memoized results
- Clear query helper

#### useFocusTrap
Trap keyboard focus within a container for accessibility.

**Example:**
```tsx
const containerRef = useFocusTrap({
  enabled: isOpen,
  autoFocus: true
});

return (
  <div ref={containerRef}>
    <button>First</button>
    <button>Second</button>
    <button>Last</button>
  </div>
);
```

**Features:**
- Tab navigation trapping
- Shift+Tab support
- Auto-focus first element
- Custom focusable selector
- WCAG 2.1 AA compliant

**Exported Constants:**
- `FOCUSABLE_SELECTOR` - Standard selector string for finding focusable elements (includes native elements and ARIA roles for Spectrum components)

#### useArrowKeyNavigation
Arrow key navigation for lists/grids of focusable items.

**Example:**
```tsx
const { getItemProps, focusItem } = useArrowKeyNavigation({
  itemCount: items.length,
  onSelect: (index) => handleSelect(items[index]),
  wrap: true,
  autoFocusFirst: true,
  orientation: 'both'
});

return (
  <div role="listbox">
    {items.map((item, index) => (
      <div key={item.id} {...getItemProps(index)}>
        {item.name}
      </div>
    ))}
  </div>
);
```

**Features:**
- Arrow Up/Down/Left/Right navigation (configurable orientation)
- Home/End shortcuts
- Enter/Space selection
- Wrapping at boundaries (optional)
- Auto-focus first item on mount (optional)
- Works with radio groups, listboxes, grids

**Used By:**
- `BrandGallery` (ArchitectureModal) - Architecture selection

#### useFocusOnMount
Focus an element on mount using a simple 3-tier strategy.

**Example:**
```tsx
const containerRef = useRef<HTMLDivElement>(null);
useFocusOnMount(containerRef, { selector: 'button' });

return (
  <div ref={containerRef}>
    <Picker placeholder="Select option">...</Picker>
  </div>
);
```

**Features:**
- 3-tier focus strategy: immediate → RAF → timeout fallback
- Custom selector for finding focus target
- Configurable fallback delay
- Disable option for conditional focus
- Automatic cleanup on unmount

**Strategy:**
1. **Immediate**: Try focusing synchronously (for pre-rendered content)
2. **RAF**: Try after animation frame (for async Spectrum components)
3. **Timeout**: Final fallback for slow rendering (default: 1000ms)

**Why not MutationObserver?**
MutationObserver adds overhead and is unreliable with React's rendering cycle. The RAF + timeout approach is simpler, more predictable, and covers 99% of cases.

### Utility Hooks

#### useDebouncedValue
Debounce any value with configurable delay.

**Example:**
```tsx
const [searchQuery, setSearchQuery] = useState('');
const debouncedQuery = useDebouncedValue(searchQuery, 500);

useEffect(() => {
  // Only runs 500ms after user stops typing
  if (debouncedQuery) {
    searchAPI(debouncedQuery);
  }
}, [debouncedQuery]);

return <SearchField value={searchQuery} onChange={setSearchQuery} />;
```

**Features:**
- Generic type support
- Configurable delay
- Automatic cleanup

## Hook Composition Patterns

### Pattern 1: Loading with Search
Combine `useAsyncData` + `useSearchFilter` for searchable data:

```tsx
const { data: projects, loading, error } = useAsyncData<Project[]>({
  messageType: 'projects',
  autoLoad: true
});

const { query, setQuery, filteredItems } = useSearchFilter(projects || [], {
  searchFields: ['title', 'name']
});

return (
  <>
    {loading && <LoadingDisplay />}
    {error && <ErrorDisplay message={error} />}
    <SearchField value={query} onChange={setQuery} />
    <ListView items={filteredItems} />
  </>
);
```

### Pattern 2: Selection with Loading
Combine `useAsyncData` + `useSelection`:

```tsx
const { data: projects, loading } = useAsyncData<Project[]>({
  messageType: 'projects',
  autoLoad: true
});

const { selectedItem, select } = useSelection<Project>({
  getKey: (p) => p.id
});

return (
  <ListView
    items={projects || []}
    selectedKeys={selectedItem ? [selectedItem.id] : []}
    onSelectionChange={(keys) => {
      const id = Array.from(keys)[0];
      const project = projects.find(p => p.id === id);
      if (project) select(project);
    }}
  />
);
```

### Pattern 3: Full-Featured List
Combine all hooks for a complete list experience:

```tsx
const { data, loading, error, load } = useAsyncData<Project[]>({
  messageType: 'projects'
});

const { query, setQuery, filteredItems } = useSearchFilter(data || [], {
  searchFields: ['title', 'name']
});

const { selectedItem, select } = useSelection<Project>({
  getKey: (p) => p.id
});

return (
  <>
    <SearchField value={query} onChange={setQuery} />
    <ListView
      items={filteredItems}
      selectedKeys={selectedItem ? [selectedItem.id] : []}
      onSelectionChange={(keys) => {
        const id = Array.from(keys)[0];
        const project = filteredItems.find(p => p.id === id);
        if (project) select(project);
      }}
    />
  </>
);
```

## Best Practices

### 1. Always Use Hooks at Top Level
```tsx
// ✅ Good
function MyComponent() {
  const { data } = useAsyncData({ messageType: 'data' });
  return <div>{data}</div>;
}

// ❌ Bad - conditional hook
function MyComponent({ shouldLoad }) {
  if (shouldLoad) {
    const { data } = useAsyncData({ messageType: 'data' });
  }
}
```

### 2. Memoize Callbacks When Needed
```tsx
const handleSelect = useCallback((project: Project) => {
  select(project);
  updateState({ adobeProject: project });
}, [select, updateState]);
```

### 3. Use Dependency Arrays Correctly
```tsx
useEffect(() => {
  if (debouncedQuery) {
    searchAPI(debouncedQuery);
  }
}, [debouncedQuery]); // Only re-run when debouncedQuery changes
```

### 4. Combine Hooks for Complex Logic
```tsx
// Instead of duplicating logic, compose hooks
const useProjectSelection = () => {
  const { data, loading } = useAsyncData<Project[]>({ messageType: 'projects' });
  const { query, filteredItems } = useSearchFilter(data || [], {
    searchFields: ['title', 'name']
  });
  const { selectedItem, select } = useSelection<Project>({ getKey: (p) => p.id });

  return { projects: filteredItems, loading, query, selectedItem, select };
};
```

### 5. Handle Cleanup Properly
All hooks handle cleanup automatically, but be aware:
- `useVSCodeMessage` unsubscribes on unmount
- `useDebouncedValue` clears timeouts
- `useFocusTrap` removes event listeners

## Performance Considerations

### Memoization
- `useSearchFilter` uses `useMemo` for filtered results
- Avoid creating new objects in render unless necessary

### Debouncing
- Use `useDebouncedValue` for expensive operations (API calls, filtering large lists)
- Typical delay: 300-500ms

### Auto-scroll
- `useAutoScroll` uses RAF and timeouts efficiently
- Enable/disable based on need to avoid unnecessary calculations

## Migration Guide

### Migrating Components to Use Hooks

**Before (duplicated logic):**
```tsx
function MyComponent() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = vscode.onMessage('projects', (data) => {
      setProjects(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ... rest of component
}
```

**After (using hooks):**
```tsx
function MyComponent() {
  const { data: projects, loading, error } = useAsyncData<Project[]>({
    messageType: 'projects',
    autoLoad: true
  });

  // ... rest of component
}
```

## Testing Hooks

### Unit Testing
```tsx
import { renderHook, act } from '@testing-library/react';
import { useSelection } from './useSelection';

test('useSelection selects and clears items', () => {
  const { result } = renderHook(() => useSelection<{ id: string }>({
    getKey: (item) => item.id
  }));

  act(() => {
    result.current.select({ id: '1' });
  });

  expect(result.current.selectedItem).toEqual({ id: '1' });

  act(() => {
    result.current.clearSelection();
  });

  expect(result.current.selectedItem).toBeNull();
});
```

### Utility Hooks (Additional)

#### useIsMounted
Track whether a component is mounted to prevent state updates after unmount.

**Example:**
```tsx
const isMounted = useIsMounted();

const loadData = async () => {
  const result = await fetchData();
  if (isMounted.current) {
    setData(result); // Safe - won't update unmounted component
  }
};
```

**Features:**
- Returns a ref that tracks mount state
- Automatically updates on unmount
- Prevents "setState on unmounted component" warnings
- Zero runtime overhead (ref-based)

**Used By:**
- `useAsyncOperation` - Prevents state updates after unmount

#### useSetToggle
Manages a Set with toggle functionality for multi-select UIs.

**Example:**
```tsx
const [selectedItems, toggleItem, setSelectedItems] = useSetToggle<string>(['initial']);

// Toggle items
toggleItem('item-1', true);  // Add
toggleItem('item-1', false); // Remove

// Check selection
selectedItems.has('item-1');

// Reset
setSelectedItems(new Set());
```

**Features:**
- Generic type support
- Accepts initial Set or array
- Returns [set, toggle, setSet] tuple
- Memoized toggle function

**Used By:**
- `useComponentSelection` - Manages 4 multi-select Sets (dependencies, services, integrations, appBuilder)

## Future Enhancements

Potential hooks to add:
- `useFormValidation` - Form field validation
- `useInfiniteScroll` - Infinite scroll logic
- `useLocalStorage` - Persist state to localStorage
- `useKeyboardShortcuts` - Keyboard shortcut handling
- `useClipboard` - Copy to clipboard
- `useMediaQuery` - Responsive design helpers

---

**Last Updated:** 2025-11-27
**Phase:** 3 - Hook Efficiency Refactoring
