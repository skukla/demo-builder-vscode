import React from 'react';
import {
    Flex,
    Text,
    SearchField,
    ActionButton,
    ProgressCircle,
    ListView,
    Item
} from '@adobe/react-spectrum';
import Refresh from '@spectrum-icons/workflow/Refresh';

export interface SearchableListItem {
    id: string;
    title?: string;
    name?: string;
    description?: string;
    [key: string]: any;
}

export interface SearchableListProps<T extends SearchableListItem> {
    /** List items to display */
    items: T[];
    /** Currently selected item IDs */
    selectedKeys?: string[];
    /** Selection change handler */
    onSelectionChange?: (keys: Set<any>) => void;
    /** Search query */
    searchQuery: string;
    /** Search query change handler */
    onSearchQueryChange: (query: string) => void;
    /** Filtered items based on search */
    filteredItems: T[];
    /** Whether data is loading */
    isLoading: boolean;
    /** Whether currently refreshing */
    isRefreshing?: boolean;
    /** Refresh handler */
    onRefresh?: () => void;
    /** Whether data has loaded at least once */
    hasLoadedOnce: boolean;
    /** Show search field threshold (default: 5) */
    searchThreshold?: number;
    /** Aria label for the list */
    ariaLabel: string;
    /** Whether to autofocus search field */
    autoFocus?: boolean;
    /** Custom item renderer */
    renderItem?: (item: T) => React.ReactNode;
}

/**
 * Organism Component: SearchableList
 *
 * Provides a searchable, refreshable list with consistent UI patterns.
 * Used for Adobe resource selection (projects, workspaces, organizations).
 *
 * Features:
 * - Search field (shown when items > threshold)
 * - Refresh button
 * - Item count display
 * - Selection handling
 * - Loading states
 *
 * @example
 * ```tsx
 * <SearchableList
 *   items={projects}
 *   selectedKeys={[selectedProject?.id]}
 *   onSelectionChange={handleSelection}
 *   searchQuery={query}
 *   onSearchQueryChange={setQuery}
 *   filteredItems={filteredProjects}
 *   isLoading={loading}
 *   hasLoadedOnce={hasLoaded}
 *   onRefresh={refresh}
 *   ariaLabel="Adobe I/O Projects"
 * />
 * ```
 */
export function SearchableList<T extends SearchableListItem>({
    items,
    selectedKeys = [],
    onSelectionChange,
    searchQuery,
    onSearchQueryChange,
    filteredItems,
    isLoading,
    isRefreshing = false,
    onRefresh,
    hasLoadedOnce,
    searchThreshold = 5,
    ariaLabel,
    autoFocus = false,
    renderItem
}: SearchableListProps<T>) {
    const showSearch = items.length > searchThreshold;

    // Default item renderer
    const defaultRenderItem = (item: T) => (
        <Item key={item.id} textValue={item.title || item.name}>
            <Text>{item.title || item.name}</Text>
            {item.description && (
                <Text slot="description" UNSAFE_className="text-sm text-gray-600">
                    {item.description}
                </Text>
            )}
        </Item>
    );

    const itemRenderer = renderItem
        ? (item: T) => <React.Fragment key={item.id}>{renderItem(item)}</React.Fragment>
        : defaultRenderItem;

    return (
        <>
            {/* Search + Refresh Bar (conditional) */}
            {showSearch && (
                <Flex gap="size-100" marginBottom="size-200" alignItems="end">
                    <SearchField
                        placeholder="Type to filter..."
                        value={searchQuery}
                        onChange={onSearchQueryChange}
                        width="100%"
                        isQuiet
                        autoFocus={autoFocus && !selectedKeys.length}
                        UNSAFE_className="search-field-custom"
                        UNSAFE_style={{ flex: 1 }}
                    />
                    {onRefresh && (
                        <ActionButton
                            isQuiet
                            onPress={onRefresh}
                            aria-label="Refresh list"
                            isDisabled={isLoading}
                            UNSAFE_style={{ cursor: 'pointer' }}
                        >
                            {isLoading ? (
                                <ProgressCircle size="S" isIndeterminate />
                            ) : (
                                <Refresh />
                            )}
                        </ActionButton>
                    )}
                    <style>{`
                        .search-field-custom .spectrum-Textfield-input {
                            padding-left: 40px !important;
                        }
                        .search-field-custom input[type="search"] {
                            padding-left: 40px !important;
                        }
                        .search-field-custom .spectrum-Search-input {
                            padding-left: 40px !important;
                        }
                    `}</style>
                </Flex>
            )}

            {/* Item Count + Refresh (when no search shown) */}
            {hasLoadedOnce && (
                <Flex justifyContent="space-between" alignItems="center" marginBottom="size-200">
                    <Text UNSAFE_className="text-sm text-gray-700">
                        Showing {filteredItems.length} of {items.length} item
                        {items.length !== 1 ? 's' : ''}
                    </Text>
                    {!showSearch && onRefresh && (
                        <ActionButton
                            isQuiet
                            onPress={onRefresh}
                            aria-label="Refresh list"
                            isDisabled={isLoading}
                            UNSAFE_style={{ cursor: 'pointer' }}
                        >
                            {isLoading ? (
                                <ProgressCircle size="S" isIndeterminate />
                            ) : (
                                <Refresh />
                            )}
                        </ActionButton>
                    )}
                </Flex>
            )}

            {/* List Container (with refresh opacity) */}
            <div
                style={{
                    flex: 1,
                    transition: 'opacity 200ms ease-in-out',
                    opacity: isRefreshing ? 0.5 : 1,
                    pointerEvents: isRefreshing ? 'none' : 'auto'
                }}
            >
                <ListView
                    items={filteredItems}
                    selectionMode="single"
                    selectedKeys={selectedKeys}
                    onSelectionChange={onSelectionChange as (keys: 'all' | Set<React.Key>) => void}
                    aria-label={ariaLabel}
                    height="100%"
                    UNSAFE_style={{ flex: 1 }}
                >
                    {itemRenderer}
                </ListView>

                {/* No results message */}
                {filteredItems.length === 0 && searchQuery && (
                    <Text UNSAFE_className="text-sm text-gray-600" marginTop="size-200">
                        No items match "{searchQuery}"
                    </Text>
                )}
            </div>
        </>
    );
}
