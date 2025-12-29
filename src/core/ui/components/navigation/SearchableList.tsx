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
    // Track which selectedId we've scrolled to (prevents re-scrolling on filteredItems changes)
    const scrolledToIdRef = useRef<string | null>(null);

    // Store filteredItems in a ref so we can access current value without dependency
    const filteredItemsRef = useRef(filteredItems);
    filteredItemsRef.current = filteredItems;

    // Scroll to selected item when selection changes
    // Only depends on selectedKeys[0] to avoid loops from filteredItems array changes
    const selectedId = selectedKeys[0];
    useEffect(() => {
        // Reset when selection clears
        if (!selectedId) {
            scrolledToIdRef.current = null;
            return;
        }

        // Skip if we've already scrolled to this selection
        if (scrolledToIdRef.current === selectedId) {
            return;
        }

        // Mark as handled immediately to prevent any possibility of loops
        scrolledToIdRef.current = selectedId;

        const timer = setTimeout(() => {
            if (!listContainerRef.current) {
                return;
            }

            // Try multiple selectors to find the scrollable container
            const gridElement = listContainerRef.current.querySelector('[role="grid"]');
            const scrollContainer = gridElement?.parentElement ||
                listContainerRef.current.querySelector('[class*="spectrum-ListView"]');

            if (!scrollContainer) {
                return;
            }

            // First, try to find the element directly (works if item is in viewport)
            const selectedElement = listContainerRef.current.querySelector(
                '[aria-selected="true"]',
            );
            if (selectedElement) {
                // Check if element is already visible in the container
                const containerRect = scrollContainer.getBoundingClientRect();
                const elementRect = selectedElement.getBoundingClientRect();

                const isVisible =
                    elementRect.top >= containerRect.top &&
                    elementRect.bottom <= containerRect.bottom;

                if (!isVisible) {
                    selectedElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
                return;
            }

            // For virtualized lists, scroll the container based on estimated position
            const currentItems = filteredItemsRef.current;
            const selectedIndex = currentItems.findIndex(item => item.id === selectedId);

            if (selectedIndex === -1) {
                return;
            }

            // ListView row height is approximately 48px (Spectrum default with description)
            const estimatedRowHeight = 48;
            const targetScrollTop = selectedIndex * estimatedRowHeight;
            const containerHeight = scrollContainer.clientHeight;
            const currentScrollTop = scrollContainer.scrollTop;

            // Check if item is already visible in the viewport
            const itemTop = targetScrollTop;
            const itemBottom = targetScrollTop + estimatedRowHeight;
            const viewportTop = currentScrollTop;
            const viewportBottom = currentScrollTop + containerHeight;

            const isVisible = itemTop >= viewportTop && itemBottom <= viewportBottom;

            if (!isVisible) {
                // Center the item in the viewport
                const centeredScrollTop = Math.max(0, targetScrollTop - containerHeight / 2 + estimatedRowHeight / 2);
                scrollContainer.scrollTo({
                    top: centeredScrollTop,
                    behavior: 'smooth',
                });
            }
        }, FRONTEND_TIMEOUTS.SCROLL_SETTLE);

        return () => clearTimeout(timer);
    }, [selectedId]);

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
                itemNounPlural={itemNounPlural}
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
                        No {nounPlural} match "{searchQuery}"
                    </Text>
                )}
            </div>
        </div>
    );
}
