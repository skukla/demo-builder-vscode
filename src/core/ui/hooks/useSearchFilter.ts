import { useState, useMemo } from 'react';

interface UseSearchFilterOptions<T> {
  /** Initial search query */
  initialQuery?: string;
  /** Fields to search in each item */
  searchFields: Array<keyof T>;
  /** Case sensitive search */
  caseSensitive?: boolean;
  /** Custom filter function (if searchFields isn't sufficient) */
  customFilter?: (item: T, query: string) => boolean;
}

interface UseSearchFilterReturn<T> {
  /** Current search query */
  query: string;
  /** Update search query */
  setQuery: (query: string) => void;
  /** Clear search query */
  clearQuery: () => void;
  /** Filtered items based on query */
  filteredItems: T[];
  /** Whether a filter is active */
  isFiltering: boolean;
}

/**
 * Hook for searching and filtering arrays of items
 *
 * Provides search query state and memoized filtered results.
 * Extracted from the Adobe project/workspace selection flow (now AdobeProjectPicker
 * and AdobeWorkspacePicker).
 *
 * @param items - Array of items to filter
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { query, setQuery, filteredItems, isFiltering } = useSearchFilter(projects, {
 *   searchFields: ['title', 'name', 'description'],
 *   caseSensitive: false
 * });
 *
 * return (
 *   <>
 *     <SearchField value={query} onChange={setQuery} />
 *     <ListView items={filteredItems} />
 *   </>
 * );
 * ```
 */
/**
 * Whether an item matches a query across the given fields.
 *
 * The single lowercase-contains walk behind both {@link useSearchFilter} and the
 * callers that own their own query state. Extracted when an
 * architecture-duplication scan (2026-07-31) found THREE implementations of this
 * one job — this hook, ProjectsDashboard, and the integrations surface — with the
 * shared hook itself imported by nobody.
 *
 * @param item - the record to test
 * @param fields - the keys to search
 * @param query - the raw query; blank matches everything
 * @param caseSensitive - defaults to false
 * @returns true when any field contains the query
 */
export function matchesSearchFields<T>(
    item: T,
    fields: ReadonlyArray<keyof T>,
    query: string,
    caseSensitive = false,
): boolean {
    const needle = caseSensitive ? query.trim() : query.trim().toLowerCase();
    if (!needle) return true;
    return fields.some((field) => {
        const value = item[field];
        if (value === null || value === undefined) return false;
        const text = caseSensitive ? String(value) : String(value).toLowerCase();
        return text.includes(needle);
    });
}

export function useSearchFilter<T extends Record<string, unknown>>(
  items: T[],
  options: UseSearchFilterOptions<T>,
): UseSearchFilterReturn<T> {
  const {
    initialQuery = '',
    searchFields,
    caseSensitive = false,
    customFilter,
  } = options;

  const [query, setQuery] = useState(initialQuery);

  const filteredItems = useMemo(() => {
    // No filter applied if query is empty
    if (!query.trim()) {
      return items;
    }

    const searchQuery = caseSensitive ? query : query.toLowerCase();

    return items.filter(item => {
      // Use custom filter if provided
      if (customFilter) {
        return customFilter(item, query);
      }

      // Default: search in specified fields
      return searchFields.some(field => {
        const value = item[field];
        if (value === null || value === undefined) {
          return false;
        }

        const stringValue = String(value);
        const searchValue = caseSensitive
          ? stringValue
          : stringValue.toLowerCase();

        return searchValue.includes(searchQuery);
      });
    });
  }, [items, query, searchFields, caseSensitive, customFilter]);

  const clearQuery = () => setQuery('');

  const isFiltering = query.trim().length > 0;

  return {
    query,
    setQuery,
    clearQuery,
    filteredItems,
    isFiltering,
  };
}
