import { useState, useEffect } from 'react';

/**
 * Hook for debouncing a value
 *
 * Returns a debounced version of the value that only updates after the specified delay.
 * Useful for search inputs, API calls, and performance optimization.
 *
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds (default: 300)
 *
 * @example
 * ```tsx
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedQuery = useDebouncedValue(searchQuery, 500);
 *
 * useEffect(() => {
 *   // Only runs 500ms after user stops typing
 *   if (debouncedQuery) {
 *     searchAPI(debouncedQuery);
 *   }
 * }, [debouncedQuery]);
 *
 * return <SearchField value={searchQuery} onChange={setSearchQuery} />;
 * ```
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes before delay expires
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
