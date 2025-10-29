import { useState, useEffect, useMemo, useCallback } from 'react';
import { vscode } from '@/webview-ui/shared/vscode-api';
import { useDebouncedLoading } from './useDebouncedLoading';
import { WizardState } from '@/webview-ui/shared/types';

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
  state: WizardState;

  /** Function to update wizard state */
  updateState: (updates: Partial<WizardState>) => void;

  /** Currently selected item (from wizard state) */
  selectedItem?: T;

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

  /** Optional: Filter items by search fields */
  searchFields?: Array<keyof T>;

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
export function useSelectionStep<T extends { id: string }>(
  options: UseSelectionStepOptions<T>
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
    searchFields = [],
    validateBeforeLoad
  } = options;

  // Get cached items from wizard state
  const items = (state[cacheKey] as T[]) || [];

  // Local state
  const [isLoading, setIsLoading] = useState(!state[cacheKey]); // Only load if cache is empty
  const [isRefreshing, setIsRefreshing] = useState(false); // Track refresh vs initial load
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!!state[cacheKey]); // Track if we've ever loaded data
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(
    searchFilterKey && typeof state[searchFilterKey] === 'string'
      ? (state[searchFilterKey] as string)
      : ''
  );

  // Debounce loading state: only show loading UI if operation takes >300ms
  // This prevents flash of loading state for fast SDK operations
  const showLoading = useDebouncedLoading(isLoading && !isRefreshing);

  // Load items from extension
  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);

    // Run validation if provided
    if (validateBeforeLoad) {
      const validation = validateBeforeLoad();
      if (!validation.valid) {
        setError(validation.error || 'Validation failed');
        setIsLoading(false);
        return;
      }
    }

    // Send request to extension (extension will respond via message)
    vscode.postMessage(messageType, {});
  }, [messageType, validateBeforeLoad]);

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

  // Auto-load on mount if cache is empty
  useEffect(() => {
    if (autoLoad && !state[cacheKey]) {
      load();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for items from extension
  useEffect(() => {
    const unsubscribeItems = vscode.onMessage(messageType, (data) => {
      if (Array.isArray(data)) {
        // Store items in wizard state cache for persistence
        updateState({ [cacheKey]: data } as Partial<WizardState>);
        setIsLoading(false);
        setIsRefreshing(false);
        setHasLoadedOnce(true);
        setError(null);

        // Auto-select if only one item
        if (autoSelectSingle && data.length === 1 && !selectedItem?.id) {
          const item = data[0] as T;
          if (onSelect) {
            onSelect(item);
          }
        }

        // Auto-select using custom logic (if multiple items)
        if (autoSelectCustom && !selectedItem?.id && data.length > 1) {
          const item = autoSelectCustom(data as T[]);
          if (item && onSelect) {
            onSelect(item);
          }
        }
      } else if (data && typeof data === 'object' && 'error' in data) {
        // Backend sends structured error (including timeout)
        setError((data as { error: string }).error);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    });

    const unsubscribeError = vscode.onMessage(errorMessageType, (data) => {
      const errorData = data as { error?: string };
      setError(errorData.error || 'Failed to load items');
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
    onSelect
  ]);

  // Select an item
  const selectItem = useCallback((item: T) => {
    if (onSelect) {
      onSelect(item);
    }
  }, [onSelect]);

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
      })
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
    searchQuery,
    setSearchQuery,
    load,
    refresh,
    selectItem
  };
}
