"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSearchFilter = useSearchFilter;
const react_1 = require("react");
/**
 * Hook for searching and filtering arrays of items
 *
 * Provides search query state and memoized filtered results.
 * Extracted from AdobeProjectStep and AdobeWorkspaceStep.
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
function useSearchFilter(items, options) {
    const { initialQuery = '', searchFields, caseSensitive = false, customFilter } = options;
    const [query, setQuery] = (0, react_1.useState)(initialQuery);
    const filteredItems = (0, react_1.useMemo)(() => {
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
        isFiltering
    };
}
//# sourceMappingURL=useSearchFilter.js.map