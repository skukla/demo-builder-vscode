import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDebouncedLoading } from '@/core/ui/hooks/useDebouncedLoading';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ErrorCode } from '@/types/errorCodes';
import { WizardSessionState, WizardState } from '@/types/webview';

/**
 * Check if a selected item needs syncing with fresh data
 * Handles hydration (ID-only imports) and refresh (external rename)
 */
function needsSelectedItemSync<T extends { id: string }>(
  selectedItem: Pick<T, 'id'> & Partial<T>,
  matchingItem: T,
): boolean {
  const selectedTitle = 'title' in selectedItem ? selectedItem.title : undefined;
  const matchingTitle = 'title' in matchingItem ? matchingItem.title : undefined;
  const selectedName = 'name' in selectedItem ? (selectedItem as { name?: string }).name : undefined;
  const matchingName = 'name' in matchingItem ? (matchingItem as { name?: string }).name : undefined;

  const titleChanged = matchingTitle && selectedTitle !== matchingTitle;
  const nameChanged = matchingName && selectedName !== matchingName;
  const needsHydration = !selectedTitle && matchingTitle;

  return !!(titleChanged || nameChanged || needsHydration);
}

/**
 * Handle auto-selection logic for received items
 */
function handleAutoSelect<T extends { id: string }>(
  data: T[],
  selectedItem: (Pick<T, 'id'> & Partial<T>) | undefined,
  autoSelectSingle: boolean,
  autoSelectCustom: ((items: T[]) => T | undefined) | undefined,
  onSelect: ((item: T) => void) | undefined,
): void {
  if (!onSelect || selectedItem?.id) return;

  // Auto-select if only one item
  if (autoSelectSingle && data.length === 1) {
    onSelect(data[0]);
    return;
  }

  // Auto-select using custom logic (if multiple items)
  if (!autoSelectCustom || data.length <= 1) return;
  const item = autoSelectCustom(data);
  if (item) {
    onSelect(item);
  }
}

/**
 * Sync selected item with fresh data (hydration & rename detection)
 */
function syncSelectedItem<T extends { id: string }>(
  data: T[],
  selectedItem: (Pick<T, 'id'> & Partial<T>) | undefined,
  onSelect: ((item: T) => void) | undefined,
): void {
  if (!selectedItem?.id || !onSelect) return;

  const matchingItem = data.find(item => item.id === selectedItem.id);
  if (matchingItem && needsSelectedItemSync(selectedItem, matchingItem)) {
    onSelect(matchingItem);
  }
}

/**
 * Configuration options for the selection step hook
 *
 * @template T - Item type that must have an `id` property
 */
export interface UseSelectionStepOptions<T extends { id: string }> {
  /** Key in WizardState where items are cached */
  cacheKey: keyof WizardState;

  /** Message type for receiving items from extension */
  messageType: string;

  /** Message type for receiving errors from extension */
  errorMessageType: string;

  /** Current wizard state */
  state: WizardSessionState;

  /** Function to update wizard state */
  updateState: (updates: Partial<WizardState>) => void;

  /**
   * Currently selected item (from wizard state). May be an id-only stub with
   * partial display fields — hydrating those is this hook's documented job
   * (`needsSelectedItemSync`), and session hosts supply exactly that shape.
   */
  selectedItem?: Pick<T, 'id'> & Partial<T>;

  /** Optional: Key for storing search filter in wizard state */
  searchFilterKey?: keyof WizardState;

  /** Optional: Auto-select if only one item is available */
  autoSelectSingle?: boolean;

  /** Optional: Auto-select based on custom logic (e.g., find "Stage" workspace) */
  autoSelectCustom?: (items: T[]) => T | undefined;

  /** Optional: Callback when an item is selected */
  onSelect?: (item: T) => void;

  /** Optional: Load items immediately on mount */
  autoLoad?: boolean;

  /** Optional: Payload to send with the load message */
  messagePayload?: Record<string, unknown>;

  /** Optional: Filter items by search fields */
  /**
   * READONLY because callers hoist this to a module constant — an inline array is
   * a new reference every render and this is named by the filter memo's deps. The
   * hook only reads it (`.length`, `.some`), so a mutable type bought nothing and
   * would have forced every caller to share a mutable array.
   */
  searchFields?: ReadonlyArray<keyof T>;

  /** Optional: Custom validation before loading */
  validateBeforeLoad?: () => { valid: boolean; error?: string };
}

/**
 * Return value from the selection step hook
 *
 * @template T - Item type that must have an `id` property
 */
export interface UseSelectionStepResult<T extends { id: string }> {
  /** Cached items from wizard state */
  items: T[];

  /** Items filtered by search query */
  filteredItems: T[];

  /** Whether items are currently loading (initial load) */
  isLoading: boolean;

  /** Whether to show loading UI (debounced) */
  showLoading: boolean;

  /** Whether items are being refreshed */
  isRefreshing: boolean;

  /** Whether data has been loaded at least once */
  hasLoadedOnce: boolean;

  /** Error message, if any */
  error: string | null;

  /** Typed error code for programmatic error handling */
  errorCode: ErrorCode | null;

  /** Current search query */
  searchQuery: string;

  /** Update search query */
  setSearchQuery: (query: string) => void;

  /** Load items from extension */
  load: () => void;

  /** Refresh items (keeps cache visible during load) */
  refresh: () => void;

  /** Select an item */
  selectItem: (item: T) => void;
}

/**
 * Reusable hook for selection step components
 *
 * Encapsulates common logic for Adobe Project and Workspace selection steps:
 * - Loading state management (initial load vs refresh)
 * - Search/filter functionality
 * - Auto-select single item
 * - Auto-select based on custom logic
 * - Caching in wizard state
 * - Error handling and retry
 * - Debounced loading UI
 *
 * @template T - Item type that must have an `id` property
 *
 * @example
 * ```tsx
 * const {
 *   items,
 *   filteredItems,
 *   showLoading,
 *   error,
 *   searchQuery,
 *   setSearchQuery,
 *   refresh,
 *   selectItem
 * } = useSelectionStep<AdobeProject>({
 *   cacheKey: 'projectsCache',
 *   messageType: 'projects',
 *   errorMessageType: 'project-error',
 *   state,
 *   updateState,
 *   selectedItem: state.adobeProject,
 *   searchFilterKey: 'projectSearchFilter',
 *   autoSelectSingle: true,
 *   searchFields: ['title', 'name', 'description'],
 *   onSelect: (project) => {
 *     updateState({
 *       adobeProject: project,
 *       adobeWorkspace: undefined // Clear dependent state
 *     });
 *   }
 * });
 * ```
 */
/**
 * The defaults for `messagePayload` and `searchFields` live at MODULE level, not
 * inline in the destructure below.
 *
 * `= {}` and `= []` inside a destructure are evaluated on EVERY RENDER, so each
 * render hands the dependency arrays at lines below a value that is `===`-different
 * from the last one. `messagePayload` is depended on by the `load` callback and
 * `searchFields` by the filter memo, so both were re-created every render for every
 * caller that OMITS them — callers doing nothing wrong.
 *
 * These are frozen so the shared instance cannot be mutated by one caller into
 * another's view of it, which is the hazard a shared default introduces and the
 * only reason a per-render literal looked safer.
 */
const NO_PAYLOAD: Readonly<Record<string, never>> = Object.freeze({});
const NO_SEARCH_FIELDS: readonly never[] = Object.freeze([]);

export function useSelectionStep<T extends { id: string }>(
  options: UseSelectionStepOptions<T>,
): UseSelectionStepResult<T> {
  const {
    cacheKey,
    messageType,
    errorMessageType,
    state,
    updateState,
    selectedItem,
    searchFilterKey,
    autoSelectSingle = false,
    autoSelectCustom,
    onSelect,
    autoLoad = true,
    messagePayload = NO_PAYLOAD,
    searchFields = NO_SEARCH_FIELDS,
    validateBeforeLoad,
  } = options;

  /**
   * THE CALLER'S CALLBACKS AND PAYLOAD, HELD BY REFERENCE.
   *
   * `onSelect`, `validateBeforeLoad` and `messagePayload` are written inline at
   * every call site — an arrow or an object literal in the options — so each is a
   * NEW value on every render of the calling component. Naming them in a
   * dependency array therefore re-created `load` and re-subscribed the message
   * effect on every render: the callers were doing the ordinary thing and paying
   * for it, and no lint rule could see it, because `exhaustive-deps` reads the
   * array from inside this hook and cannot see across the boundary to the caller
   * that built the value.
   *
   * A ref is the fix rather than asking three call sites to memoise, because what
   * this hook actually wants is "whatever the caller means RIGHT NOW, at the
   * moment I call it" — which is what a ref expresses and a dependency cannot.
   * Behaviour is unchanged: every read below happens inside a callback or an
   * effect body, never during render, so it always sees the current value.
   *
   * Assigned during render on purpose. The effects below may run before any
   * post-paint effect could refresh it, and a stale callback there would be the
   * bug this is fixing.
   */
  const latest = useRef({ onSelect, validateBeforeLoad, messagePayload });
  latest.current = { onSelect, validateBeforeLoad, messagePayload };

  // Get cached items from wizard state (memoized to prevent useMemo deps changing on every render)
  const items = useMemo(() => (state[cacheKey] as T[]) || [], [state, cacheKey]);

  // Local state
  const [isLoading, setIsLoading] = useState(!state[cacheKey]); // Only load if cache is empty
  const [isRefreshing, setIsRefreshing] = useState(false); // Track refresh vs initial load
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!!state[cacheKey]); // Track if we've ever loaded data
  const [loadRequested, setLoadRequested] = useState(!!state[cacheKey]); // Prevent StrictMode double-load
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [searchQuery, setSearchQuery] = useState(
    searchFilterKey && typeof state[searchFilterKey] === 'string'
      ? (state[searchFilterKey] as string)
      : '',
  );

  // Debounce loading state: only show loading UI if operation takes >300ms
  // This prevents flash of loading state for fast SDK operations
  const showLoading = useDebouncedLoading(isLoading && !isRefreshing);

  // Load items from extension
  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);

    // Run validation if provided
    const validate = latest.current.validateBeforeLoad;
    if (validate) {
      const validation = validate();
      if (!validation.valid) {
        setError(validation.error || 'Validation failed');
        setIsLoading(false);
        return;
      }
    }

    // Send request to extension (extension will respond via message)
    webviewClient.postMessage(messageType, latest.current.messagePayload);
  }, [messageType]);

  // Refresh items (keeps cache visible during load)
  const refresh = useCallback(() => {
    setIsRefreshing(true);
    load();
  }, [load]);

  // Save search query to wizard state for persistence across navigation
  useEffect(() => {
    if (searchFilterKey) {
      updateState({ [searchFilterKey]: searchQuery } as Partial<WizardState>);
    }
  }, [searchQuery, searchFilterKey, updateState]);

  // Auto-load on mount if cache is empty (guard prevents StrictMode double-load)
  useEffect(() => {
    if (autoLoad && !state[cacheKey] && !loadRequested) {
      setLoadRequested(true);
      load();
    }
  }, [autoLoad, state, cacheKey, loadRequested, load]);

  // Listen for items from extension
  useEffect(() => {
    const unsubscribeItems = webviewClient.onMessage(messageType, (data) => {
      if (Array.isArray(data)) {
        // Store items in wizard state cache for persistence
        updateState({ [cacheKey]: data } as Partial<WizardState>);
        setIsLoading(false);
        setIsRefreshing(false);
        setHasLoadedOnce(true);
        setError(null);
        setErrorCode(null);

        const typedData = data as T[];
        const select = latest.current.onSelect;
        handleAutoSelect(typedData, selectedItem, autoSelectSingle, autoSelectCustom, select);
        syncSelectedItem(typedData, selectedItem, select);
      } else if (data && typeof data === 'object' && 'error' in data) {
        // Backend sends structured error (including timeout)
        const errorData = data as { error: string; code?: ErrorCode };
        setError(errorData.error);
        setErrorCode(errorData.code ?? null);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    });

    const unsubscribeError = webviewClient.onMessage(errorMessageType, (data) => {
      const errorData = data as { error?: string; code?: ErrorCode };
      setError(errorData.error || 'Failed to load items');
      setErrorCode(errorData.code ?? null);
      setIsLoading(false);
      setIsRefreshing(false);
    });

    return () => {
      unsubscribeItems();
      unsubscribeError();
    };
  }, [
    messageType,
    errorMessageType,
    cacheKey,
    updateState,
    selectedItem,
    autoSelectSingle,
    autoSelectCustom,
  ]);

  // Select an item
  const selectItem = useCallback((item: T) => {
    latest.current.onSelect?.(item);
  }, []);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery || searchFields.length === 0) {
      return items;
    }

    const query = searchQuery.toLowerCase();
    return items.filter(item =>
      searchFields.some(field => {
        const value = item[field];
        if (value === null || value === undefined) {
          return false;
        }
        return String(value).toLowerCase().includes(query);
      }),
    );
  }, [items, searchQuery, searchFields]);

  return {
    items,
    filteredItems,
    isLoading,
    showLoading,
    isRefreshing,
    hasLoadedOnce,
    error,
    errorCode,
    searchQuery,
    setSearchQuery,
    load,
    refresh,
    selectItem,
  };
}
