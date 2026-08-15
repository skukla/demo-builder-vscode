<!-- Last verified: 2026-07-03 -->
# Custom React Hooks

## Overview

This directory contains custom React hooks that extract and encapsulate reusable logic from webview components. Hooks follow React naming conventions (`useCamelCase.ts`) and are exported from `index.ts`. Each hook file carries full JSDoc with examples — read the source for API details.

## Hook Inventory

| Hook | Purpose | File |
|------|---------|------|
| **VS Code communication** | | |
| `useVSCodeMessage` | Subscribe to extension messages with automatic cleanup | `useVSCodeMessage.ts` |
| `useVSCodeRequest` | Request-response calls to the extension with loading/error/data state | `useVSCodeRequest.ts` |
| **State management** | | |
| `useLoadingState` | Unified loading/error/data state with `hasLoadedOnce` and `isRefreshing` flags | `useLoadingState.ts` |
| `useSelection` | Single-item selection with key extraction, `isSelected`, `clearSelection` | `useSelection.ts` |
| `useSelectionStep` | Full wizard selection-step behavior (see below) | `useSelectionStep.ts` |
| `useAsyncData` | Async data fetching wired to VS Code messages (auto-load, auto-select-single) | `useAsyncData.ts` |
| `useAsyncOperation` | Execute an async operation with `isExecuting`/message/error state and unmount safety | `useAsyncOperation.ts` |
| `useCanProceed` | Update the wizard's `canProceed` from a validation value (truthy or custom validator) | `useCanProceed.ts` |
| `usePollingWithTimeout` | Poll a fetcher at an interval until a condition is met or a timeout elapses, with cleanup | `usePollingWithTimeout.ts` |
| **UI interaction** | | |
| `useAutoScroll` | Auto-scroll a container to keep items visible (smart visibility detection) | `useAutoScroll.ts` |
| `useSearchFilter` | Search/filter arrays over configurable fields with memoized results | `useSearchFilter.ts` |
| `useFocusTrap` | Trap keyboard focus within a container (WCAG); exports `FOCUSABLE_SELECTOR` | `useFocusTrap.ts` |
| `useFocusOnMount` | Focus an element on mount via a 3-tier strategy (see below) | `useFocusOnMount.ts` |
| `useActivateOnKey` | Enter/Space activation for a div-role button (with `preventDefault`) — the contract every click-to-open tile needs | `useActivateOnKey.ts` |
| `useArrowKeyNavigation` | Arrow-key navigation for lists/grids (currently unused; retained as a primitive) | `useArrowKeyNavigation.ts` |
| `useEnterExit` | Track items that just appeared/disappeared so lists can animate in/out (see below) | `useEnterExit.ts` |
| **Utility** | | |
| `useDebouncedValue` | Debounce any value with configurable delay | `useDebouncedValue.ts` |
| `useDebouncedLoading` | Only show loading UI if the operation exceeds a delay (no flash for fast ops) | `useDebouncedLoading.ts` |
| `useIsMounted` | Ref tracking mount state to prevent setState-after-unmount | `useIsMounted.ts` |
| `useSetToggle` | Manage a `Set` with a memoized toggle function (multi-select UIs) | `useSetToggle.ts` |
| `useTimerCleanup` | Manage N timer refs with set/clear helpers and automatic cleanup on unmount | `useTimerCleanup.ts` |
| `useSelectableDefault` | Select-all-on-focus props for text fields with replaceable default values | `useSelectableDefault.ts` |
| `useVerificationMessage` | Map a status value to a formatted verification message (`info`/`success`/`warning`/`error`) | `useVerificationMessage.ts` |
| `useElapsedStage` | Advance a sub-message as a long wait drags on, so a slow fetch doesn't read as frozen (ships `ORG_SERVICES_LOADING_STAGES`) | `useElapsedStage.ts` |

**Choosing between the async hooks:**
- `useAsyncData` — fetching data that arrives via VS Code messages
- `useAsyncOperation` — executing operations that don't need message integration
- `useSelectionStep` — a whole selection step (data + cache + search + selection)

## Hooks with Gotchas

### useVSCodeRequest — `error` stays null when the handler REFUSES

The hook rejects only when the request rejects, and a request rejects only when the handler
**throws**. This project's handler convention is the opposite: guards *return*
`{ success: false, error, code }`. `WebviewCommunicationManager.handleWebviewMessage` puts
whatever the handler RETURNED into the response `payload` and sets an `error` field only in
its `catch` — and `WebviewClient`'s message listener (`initialize`) rejects solely when that
`error` field is present, otherwise resolving the payload. So a refusal arrives resolved and
the hook reports success.

Consequence: **`useVSCodeRequest<SomeDomainType>` is typed on a lie.** `data` is the envelope,
not your domain object, and `data.someField` on a refusal is `undefined` — which renders as a
default, not as an error. (2026-08-12: a connectivity line read `data.reachable` off a refusal
and showed signed-out users "Connected" for two steps.)

Use `webviewClient.request<{ success: boolean; … }>` and branch on `.success` — the pattern
already used in `features/eds`, where `GitHubAppCheckResult` declares `success` and
`pollGitHubAppInstallation` checks it before reading anything else. Reach for this hook only
against a handler that genuinely throws on failure.

### useSelectionStep

Composes the entire wizard selection-step pattern: cached items from a VS Code message type, debounced loading, search filtering, auto-select (single item or custom), and selected-item sync. The sync handles hydration (ID-only imports) and refresh (external rename) by comparing `title`/`name` against fresh data.

```tsx
const { items, filteredItems, showLoading, error, searchQuery, setSearchQuery, refresh, selectItem } =
  useSelectionStep<AdobeProject>({
    cacheKey: 'projectsCache',
    messageType: 'projects',
    errorMessageType: 'project-error',
    state, updateState,
    selectedItem: state.adobeProject,
    autoSelectSingle: true,
    searchFields: ['title', 'name', 'description'],
    onSelect: (project) => {
      updateState({
        adobeProject: project,
        adobeWorkspace: undefined, // Clear dependent state
      });
    },
  });
```

**Gotcha:** always clear dependent state in `onSelect` (changing project must clear workspace).

### useEnterExit

Shared enter/exit animation *orchestration* for lists — extracted from TimelineNav so the wizard timeline and the area sub-step strip share one approach. Returns `displayItems` (current items plus just-removed ones re-inserted at their original positions and flagged `isExiting`), an `isEntering(id)` test, and `animationsEnabled` (false during a first-mount settle window so the initial render doesn't animate everything).

**Gotcha:** the CSS is the caller's responsibility — the timeline animates max-height (vertical rail), the sub-step strip max-width (horizontal tabs). Only the orchestration is shared.

### useFocusOnMount

3-tier focus strategy: immediate (pre-rendered content) → requestAnimationFrame (async Spectrum components) → timeout fallback (slow rendering, default 1000ms).

**Why not MutationObserver?** It adds overhead and is unreliable with React's rendering cycle; RAF + timeout is simpler and covers the real cases.

### useAsyncOperation

Tracks `isExecuting`, `message`/`subMessage`, and `error` with `onSuccess`/`onError` callbacks. Uses `useIsMounted` internally so a resolved operation never updates an unmounted component. Non-Error throws are converted to Error objects.

## Composition Pattern

Hooks are designed to compose. Typical searchable, selectable list:

```tsx
const { data, loading, error } = useAsyncData<Project[]>({ messageType: 'projects', autoLoad: true });
const { query, setQuery, filteredItems } = useSearchFilter(data || [], { searchFields: ['title', 'name'] });
const { selectedItem, select } = useSelection<Project>({ getKey: (p) => p.id });
```

For a full wizard selection step, prefer `useSelectionStep` over hand-composing the above.

**Stable references matter:** passing inline `[]` or `{}` as hook options creates new references each render and can cause infinite re-render loops with `useEffect`-based hooks. Hoist empty arrays/objects to module-level constants.

## Best Practices

1. **Hooks at top level only** — never call hooks conditionally.
2. **Memoize callbacks** passed to hooks (`useCallback`) when they land in dependency arrays.
3. **Cleanup is automatic** — `useVSCodeMessage` unsubscribes, `useDebouncedValue`/`useTimerCleanup` clear timeouts, `useFocusTrap` removes listeners.
4. **Debounce expensive operations** (`useDebouncedValue`, typical delay 300–500ms); avoid loading flash with `useDebouncedLoading`.

## Testing Hooks

```tsx
import { renderHook, act } from '@testing-library/react';
import { useSelection } from './useSelection';

test('useSelection selects and clears items', () => {
  const { result } = renderHook(() => useSelection<{ id: string }>({
    getKey: (item) => item.id,
  }));

  act(() => result.current.select({ id: '1' }));
  expect(result.current.selectedItem).toEqual({ id: '1' });

  act(() => result.current.clearSelection());
  expect(result.current.selectedItem).toBeNull();
});
```

Tests live under `tests/` mirroring this directory; note the test setup uses fake timers (see `tests/setup/react.ts`).
