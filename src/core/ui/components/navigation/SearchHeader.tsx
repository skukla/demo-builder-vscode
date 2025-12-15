/**
 * SearchHeader Component
 *
 * Reusable search/refresh/count header bar for lists and grids.
 * Provides consistent UI patterns across selection views.
 *
 * Features:
 * - Search field (shown when items exceed threshold)
 * - Refresh button with loading state
 * - View mode toggle (cards/rows)
 * - Item count display ("Showing X of Y items")
 * - Configurable visibility and behavior
 */

import React from 'react';
import { Flex, Text, SearchField, ActionButton, Tooltip, TooltipTrigger } from '@adobe/react-spectrum';
import Refresh from '@spectrum-icons/workflow/Refresh';
import ViewGrid from '@spectrum-icons/workflow/ViewGrid';
import ViewList from '@spectrum-icons/workflow/ViewList';
import { Spinner } from '../ui/Spinner';

/** Available view modes */
export type ViewMode = 'cards' | 'rows';

export interface SearchHeaderProps {
    /** Current search query */
    searchQuery: string;
    /** Search query change handler */
    onSearchQueryChange: (query: string) => void;
    /** Placeholder text for search field */
    searchPlaceholder?: string;
    /** Show search field when totalCount exceeds this (default: 5) */
    searchThreshold?: number;

    /** Total number of items (before filtering) */
    totalCount: number;
    /** Number of items after filtering */
    filteredCount: number;
    /** Singular noun for item type (default: "item") */
    itemNoun?: string;

    /** Refresh handler (if not provided, no refresh button shown) */
    onRefresh?: () => void;
    /** Whether currently refreshing */
    isRefreshing?: boolean;
    /** Aria label for refresh button */
    refreshAriaLabel?: string;

    /** Current view mode (if not provided, no view toggle shown) */
    viewMode?: ViewMode;
    /** View mode change handler */
    onViewModeChange?: (mode: ViewMode) => void;

    /** Whether data has loaded at least once (shows count when true) */
    hasLoadedOnce: boolean;
    /** Whether to auto-focus search field */
    autoFocus?: boolean;
    /** Always show count even below threshold (default: false) */
    alwaysShowCount?: boolean;
}

/**
 * SearchHeader - Reusable search/refresh/count bar
 *
 * Extracts the common header pattern from SearchableList for reuse
 * in both ListView-based and Grid-based views.
 *
 * @example
 * ```tsx
 * <SearchHeader
 *   searchQuery={query}
 *   onSearchQueryChange={setQuery}
 *   totalCount={projects.length}
 *   filteredCount={filteredProjects.length}
 *   itemNoun="project"
 *   onRefresh={handleRefresh}
 *   isRefreshing={isLoading}
 *   hasLoadedOnce={hasLoaded}
 * />
 * ```
 */
export const SearchHeader: React.FC<SearchHeaderProps> = ({
    searchQuery,
    onSearchQueryChange,
    searchPlaceholder = 'Type to filter...',
    searchThreshold = 5,
    totalCount,
    filteredCount,
    itemNoun = 'item',
    onRefresh,
    isRefreshing = false,
    refreshAriaLabel = 'Refresh list',
    viewMode,
    onViewModeChange,
    hasLoadedOnce,
    autoFocus = false,
    alwaysShowCount = false,
}) => {
    const showSearch = totalCount > searchThreshold;
    const showCount = hasLoadedOnce && (alwaysShowCount || totalCount > 0);
    const showViewToggle = viewMode !== undefined && onViewModeChange !== undefined;
    const plural = totalCount !== 1 ? 's' : '';
    const isFiltering = searchQuery.trim().length > 0;

    // Refresh button component (reused in both layouts)
    const RefreshButton = onRefresh ? (
        <ActionButton
            isQuiet
            onPress={onRefresh}
            aria-label={refreshAriaLabel}
            isDisabled={isRefreshing}
            UNSAFE_className="cursor-pointer"
        >
            {isRefreshing ? <Spinner size="S" /> : <Refresh />}
        </ActionButton>
    ) : null;

    // View toggle buttons (cards/rows)
    const ViewToggle = showViewToggle ? (
        <Flex gap="size-50">
            <TooltipTrigger delay={300}>
                <ActionButton
                    isQuiet
                    onPress={() => onViewModeChange('cards')}
                    aria-label="Card view"
                    aria-pressed={viewMode === 'cards'}
                    UNSAFE_className={`cursor-pointer ${viewMode === 'cards' ? 'is-selected toggle-selected' : ''}`}
                >
                    <ViewGrid />
                </ActionButton>
                <Tooltip>Card view</Tooltip>
            </TooltipTrigger>
            <TooltipTrigger delay={300}>
                <ActionButton
                    isQuiet
                    onPress={() => onViewModeChange('rows')}
                    aria-label="List view"
                    aria-pressed={viewMode === 'rows'}
                    UNSAFE_className={`cursor-pointer ${viewMode === 'rows' ? 'is-selected toggle-selected' : ''}`}
                >
                    <ViewList />
                </ActionButton>
                <Tooltip>List view</Tooltip>
            </TooltipTrigger>
        </Flex>
    ) : null;

    // Action buttons (view toggle + refresh)
    const ActionButtons = (RefreshButton || ViewToggle) ? (
        <Flex gap="size-100" alignItems="center">
            {ViewToggle}
            {RefreshButton}
        </Flex>
    ) : null;

    return (
        <div className="search-header">
            {/* Search + Actions Bar (when search is shown) */}
            {showSearch && (
                <Flex gap="size-100" marginBottom="size-200" alignItems="end">
                    <SearchField
                        placeholder={searchPlaceholder}
                        value={searchQuery}
                        onChange={onSearchQueryChange}
                        width="100%"
                        isQuiet
                        autoFocus={autoFocus}
                        aria-label={`Filter ${itemNoun}s`}
                        UNSAFE_className="flex-1"
                    />
                    {ActionButtons}
                </Flex>
            )}

            {/* Item Count + Actions (always shown when data loaded) */}
            {showCount && (
                <Flex justifyContent="space-between" alignItems="center" marginBottom="size-200">
                    <Text UNSAFE_className="text-sm text-gray-600">
                        {isFiltering
                            ? `Showing ${filteredCount} of ${totalCount} ${itemNoun}${plural}`
                            : `${totalCount} ${itemNoun}${plural}`}
                    </Text>
                    {/* Show actions here only if search bar not shown */}
                    {!showSearch && ActionButtons}
                </Flex>
            )}
        </div>
    );
};
