import React, { useEffect, useRef } from 'react';
import {
    Text,
    ListView,
    Item
} from '@adobe/react-spectrum';
import { SearchHeader } from './SearchHeader';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

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

    // Ref for the list container to scroll to selected item
    const listContainerRef = useRef<HTMLDivElement>(null);
    const hasScrolledRef = useRef(false);

    // Scroll to selected item when list is ready with a pre-selection
    // Triggers on: initial load, navigation back (component remount), or selection change
    useEffect(() => {
        if (!selectedKeys.length || !listContainerRef.current) {
            hasScrolledRef.current = false;
            return;
        }

        // Skip if we've already scrolled for this selection
        if (hasScrolledRef.current) {
            return;
        }

        // Small delay to ensure DOM is rendered
        const timer = setTimeout(() => {
            const selectedId = selectedKeys[0];
            const selectedElement = listContainerRef.current?.querySelector(
                `[data-key="${selectedId}"]`
            );
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
                hasScrolledRef.current = true;
            }
        }, FRONTEND_TIMEOUTS.UI_UPDATE_DELAY);

        return () => clearTimeout(timer);
    }, [selectedKeys]);

    return (
        <div className="searchable-list-container">
            {/* Search Header (search field + refresh + count) */}
            <SearchHeader
                searchQuery={searchQuery}
                onSearchQueryChange={onSearchQueryChange}
                searchPlaceholder={searchPlaceholder}
                searchThreshold={searchThreshold}
                totalCount={items.length}
                filteredCount={filteredItems.length}
                itemNoun={itemNoun}
                onRefresh={onRefresh}
                isRefreshing={isLoading}
                refreshAriaLabel={refreshAriaLabel}
                hasLoadedOnce={hasLoadedOnce}
                autoFocus={autoFocus && !selectedKeys.length}
                alwaysShowCount={true}
            />

            {/* List Container (with refresh opacity) */}
            <div
                ref={listContainerRef}
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
