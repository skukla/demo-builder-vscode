import {
    Text,
    ListView,
    Item,
} from '@adobe/react-spectrum';
import React, { useEffect, useRef } from 'react';
import { SearchHeader } from './SearchHeader';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

export interface SearchableListItem {
    id: string;
    title?: string;
    name?: string;
    description?: string | null | undefined;
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
    /** Plural noun for item type (default: itemNoun + 's') */
    itemNounPlural?: string;
    /** Placeholder text for search field (default: "Type to filter...") */
    searchPlaceholder?: string;
    /** Aria label for refresh button (default: "Refresh list") */
    refreshAriaLabel?: string;
    /** Optional action element to show inline (e.g., "+ New" button) */
    action?: React.ReactNode;
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
    itemNounPlural,
    searchPlaceholder = 'Type to filter...',
    refreshAriaLabel = 'Refresh list',
    action,
}: SearchableListProps<T>) {
    // Use provided plural or default to simple +s
    const nounPlural = itemNounPlural || `${itemNoun}s`;
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
    // Track which selectedId we've scrolled to AND whether items were loaded at that time
    // Format: "id:hasItems" to distinguish between scroll attempts with/without data
    const scrolledToIdRef = useRef<string | null>(null);

    // Store filteredItems in a ref so we can access current value without dependency
    const filteredItemsRef = useRef(filteredItems);
    filteredItemsRef.current = filteredItems;

    // Scroll to selected item when selection changes OR when items first load
    // The hasLoadedOnce dependency ensures we re-attempt scroll when data arrives
    const selectedId = selectedKeys[0];
    const hasItems = filteredItems.length > 0;
    useEffect(() => {
        // Reset when selection clears
        if (!selectedId) {
            scrolledToIdRef.current = null;
            return;
        }

        // Create a key that includes both the ID and whether we had items
        // This allows re-scrolling when items load after initial mount
        const scrollKey = `${selectedId}:${hasItems}`;

        // Skip if we've already scrolled to this selection with items available
        if (scrolledToIdRef.current === scrollKey) {
            return;
        }

        // Don't mark as handled until we actually have items to scroll to
        if (!hasItems) {
            return;
        }

        // Mark as handled with items available
        scrolledToIdRef.current = scrollKey;

        const timer = setTimeout(() => {
            if (!listContainerRef.current) return;

            // Find scrollable container by checking which element is actually scrollable
            const findScrollable = (): HTMLElement | null => {
                const grid = listContainerRef.current!.querySelector('[role="grid"]') as HTMLElement;
                if (grid?.scrollHeight > grid?.clientHeight) return grid;
                const parent = grid?.parentElement;
                if (parent && parent.scrollHeight > parent.clientHeight) {
                    return parent;
                }
                return null;
            };

            const scrollContainer = findScrollable();
            if (!scrollContainer) return;

            // For virtualized lists, scroll based on estimated position
            const currentItems = filteredItemsRef.current;
            const selectedIndex = currentItems.findIndex(item => item.id === selectedId);
            if (selectedIndex === -1) return;

            const rowHeight = 40;
            const targetTop = selectedIndex * rowHeight;
            const containerHeight = scrollContainer.clientHeight;

            // Center the item in viewport
            const centeredTop = Math.max(0, targetTop - containerHeight / 2 + rowHeight / 2);
            scrollContainer.scrollTo({ top: centeredTop, behavior: 'smooth' });
        }, FRONTEND_TIMEOUTS.SCROLL_SETTLE);

        return () => clearTimeout(timer);
    }, [selectedId, hasItems]);

    return (
        <div className="searchable-list-container">
            {/* Search Header (search field + refresh + count + action) */}
            <SearchHeader
                searchQuery={searchQuery}
                onSearchQueryChange={onSearchQueryChange}
                searchPlaceholder={searchPlaceholder}
                searchThreshold={searchThreshold}
                totalCount={items.length}
                filteredCount={filteredItems.length}
                itemNoun={itemNoun}
                itemNounPlural={itemNounPlural}
                onRefresh={onRefresh}
                isRefreshing={isLoading}
                refreshAriaLabel={refreshAriaLabel}
                hasLoadedOnce={hasLoadedOnce}
                autoFocus={autoFocus && !selectedKeys.length}
                alwaysShowCount={true}
                action={action}
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
                        No {nounPlural} match "{searchQuery}"
                    </Text>
                )}
            </div>
        </div>
    );
}
