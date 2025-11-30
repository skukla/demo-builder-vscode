import React from 'react';
import {
    Flex,
    Text,
    SearchField,
    ActionButton,
    ListView,
    Item
} from '@adobe/react-spectrum';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { Spinner } from '../ui/Spinner';

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
    /** Singular noun for item type (default: "item") */
    itemNoun?: string;
    /** Placeholder text for search field (default: "Type to filter...") */
    searchPlaceholder?: string;
    /** Aria label for refresh button (default: "Refresh list") */
    refreshAriaLabel?: string;
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
    renderItem,
    itemNoun = 'item',
    searchPlaceholder = 'Type to filter...',
    refreshAriaLabel = 'Refresh list',
}: SearchableListProps<T>) {
    const showSearch = items.length > searchThreshold;
    const plural = items.length !== 1 ? 's' : '';

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
        <div className="searchable-list-container">
            {/* Search + Refresh Bar (conditional) */}
            {showSearch && (
                <Flex gap="size-100" marginBottom="size-200" alignItems="end">
                    <SearchField
                        placeholder={searchPlaceholder}
                        value={searchQuery}
                        onChange={onSearchQueryChange}
                        width="100%"
                        isQuiet
                        autoFocus={autoFocus && !selectedKeys.length}
                        UNSAFE_className="searchable-list-search-field flex-1"
                    />
                    {onRefresh && (
                        <ActionButton
                            isQuiet
                            onPress={onRefresh}
                            aria-label={refreshAriaLabel}
                            isDisabled={isLoading}
                            UNSAFE_className="cursor-pointer"
                        >
                            {isLoading ? (
                                <Spinner size="S" />
                            ) : (
                                <Refresh />
                            )}
                        </ActionButton>
                    )}
                </Flex>
            )}

            {/* Item Count + Refresh (when no search shown) */}
            {hasLoadedOnce && (
                <Flex justifyContent="space-between" alignItems="center" marginBottom="size-200">
                    <Text UNSAFE_className="text-sm text-gray-700">
                        Showing {filteredItems.length} of {items.length} {itemNoun}{plural}
                    </Text>
                    {!showSearch && onRefresh && (
                        <ActionButton
                            isQuiet
                            onPress={onRefresh}
                            aria-label={refreshAriaLabel}
                            isDisabled={isLoading}
                            UNSAFE_className="cursor-pointer"
                        >
                            {isLoading ? (
                                <Spinner size="S" />
                            ) : (
                                <Refresh />
                            )}
                        </ActionButton>
                    )}
                </Flex>
            )}

            {/* List Container (with refresh opacity) */}
            <div
                className={`list-refresh-container ${isRefreshing ? 'refreshing' : ''}`}
            >
                <ListView
                    items={filteredItems}
                    selectionMode="single"
                    selectedKeys={selectedKeys}
                    onSelectionChange={onSelectionChange as (keys: 'all' | Set<React.Key>) => void}
                    aria-label={ariaLabel}
                    height="100%"
                    UNSAFE_className="flex-1"
                >
                    {filteredItems.map(itemRenderer)}
                </ListView>

                {/* No results message */}
                {filteredItems.length === 0 && searchQuery && (
                    <Text UNSAFE_className="text-sm text-gray-600" marginTop="size-200">
                        No {itemNoun}s match "{searchQuery}"
                    </Text>
                )}
            </div>
        </div>
    );
}
