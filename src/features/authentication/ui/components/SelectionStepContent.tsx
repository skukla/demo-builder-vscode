/**
 * SelectionStepContent - Reusable UI for selection steps
 *
 * Handles the common UI patterns for selection steps:
 * - Loading state with spinner
 * - Error state with retry button
 * - Empty state with message
 * - List view with search/filter
 *
 * Used by AdobeProjectStep and AdobeWorkspaceStep to reduce duplication.
 */
import {
    Heading,
    ListView,
    Item,
    Text,
    SearchField,
    Flex,
    ActionButton,
} from '@adobe/react-spectrum';
import Refresh from '@spectrum-icons/workflow/Refresh';
import React from 'react';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { ErrorDisplay } from '@/core/ui/components/feedback/ErrorDisplay';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { FadeTransition } from '@/core/ui/components/ui/FadeTransition';
import { Spinner } from '@/core/ui/components/ui/Spinner';

/**
 * Props for a selectable item (must have id and display text)
 */
export interface SelectableItem {
    id: string;
    name: string;
    title?: string;
    description?: string;
}

/**
 * Labels configuration for the selection step
 */
export interface SelectionLabels {
    /** Heading text for the step */
    heading: string;
    /** Message shown during loading */
    loadingMessage: string;
    /** Sub-message shown during loading (optional) */
    loadingSubMessage?: string;
    /** Title shown when error occurs */
    errorTitle: string;
    /** Title shown when no items found */
    emptyTitle: string;
    /** Message shown when no items found */
    emptyMessage: string;
    /** Placeholder for search field */
    searchPlaceholder: string;
    /** Singular noun for the item type (e.g., "project") */
    itemNoun: string;
    /** Aria label for the list */
    ariaLabel: string;
}

/**
 * Props for SelectionStepContent
 */
export interface SelectionStepContentProps<T extends SelectableItem> {
    /** All items available for selection */
    items: T[];
    /** Filtered items (after search) */
    filteredItems: T[];
    /** Whether to show loading state */
    showLoading: boolean;
    /** Whether data is currently loading */
    isLoading: boolean;
    /** Whether data is refreshing (background) */
    isRefreshing: boolean;
    /** Whether data has been loaded at least once */
    hasLoadedOnce: boolean;
    /** Error message if loading failed */
    error: string | null;
    /** Current search query */
    searchQuery: string;
    /** Callback to update search query */
    onSearchChange: (query: string) => void;
    /** Callback to load/reload items */
    onLoad: () => void;
    /** Callback to refresh items */
    onRefresh: () => void;
    /** Currently selected item ID */
    selectedId: string | undefined;
    /** Callback when item is selected */
    onSelect: (item: T) => void;
    /** UI labels */
    labels: SelectionLabels;
    /** Custom item renderer (optional) */
    renderItem?: (item: T) => React.ReactNode;
    /** Custom description renderer (optional) */
    renderDescription?: (item: T) => React.ReactNode;
}

/**
 * SelectionStepContent - Renders the content area for a selection step
 *
 * Handles four states:
 * 1. Loading - Shows loading spinner
 * 2. Error - Shows error message with retry button
 * 3. Empty - Shows empty state message
 * 4. Data - Shows searchable list
 */
export function SelectionStepContent<T extends SelectableItem>({
    items,
    filteredItems,
    showLoading,
    isLoading,
    isRefreshing,
    hasLoadedOnce,
    error,
    searchQuery,
    onSearchChange,
    onLoad,
    onRefresh,
    selectedId,
    onSelect,
    labels,
    renderItem,
    renderDescription,
}: SelectionStepContentProps<T>) {
    // State 1: Loading
    if (showLoading || (isLoading && !hasLoadedOnce)) {
        return (
            <>
                <Heading level={2} marginBottom="size-300">{labels.heading}</Heading>
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <LoadingDisplay
                        size="L"
                        message={labels.loadingMessage}
                        subMessage={labels.loadingSubMessage}
                        helperText="This could take up to 30 seconds"
                    />
                </Flex>
            </>
        );
    }

    // State 2: Error
    if (error && !isLoading) {
        return (
            <>
                <Heading level={2} marginBottom="size-300">{labels.heading}</Heading>
                <FadeTransition show={true}>
                    <ErrorDisplay
                        title={labels.errorTitle}
                        message={error}
                        onRetry={onLoad}
                    />
                </FadeTransition>
            </>
        );
    }

    // State 3: Empty
    if (items.length === 0 && !isLoading) {
        return (
            <>
                <Heading level={2} marginBottom="size-300">{labels.heading}</Heading>
                <EmptyState
                    title={labels.emptyTitle}
                    description={labels.emptyMessage}
                />
            </>
        );
    }

    // State 4: Data loaded - show list
    const showSearch = items.length > 5;
    const plural = items.length !== 1 ? 's' : '';

    return (
        <>
            <Heading level={2} marginBottom="size-300">{labels.heading}</Heading>

            {/* Search field - only show when > 5 items */}
            {showSearch && (
                <Flex gap="size-100" marginBottom="size-200" alignItems="end">
                    <SearchField
                        placeholder={labels.searchPlaceholder}
                        value={searchQuery}
                        onChange={onSearchChange}
                        width="100%"
                        isQuiet
                        autoFocus={!selectedId}
                        UNSAFE_className="flex-1"
                    />
                    <RefreshButton
                        isLoading={isLoading}
                        onRefresh={onRefresh}
                        ariaLabel={`Refresh ${labels.itemNoun}s`}
                    />
                </Flex>
            )}

            {/* Item count - only show after data has loaded */}
            {hasLoadedOnce && (
                <Flex justifyContent="space-between" alignItems="center" marginBottom="size-200">
                    <Text UNSAFE_className="text-sm text-gray-700">
                        Showing {filteredItems.length} of {items.length} {labels.itemNoun}{plural}
                    </Text>
                    {!showSearch && (
                        <RefreshButton
                            isLoading={isLoading}
                            onRefresh={onRefresh}
                            ariaLabel={`Refresh ${labels.itemNoun}s`}
                        />
                    )}
                </Flex>
            )}

            {/* List view */}
            <div className={`list-refresh-container ${isRefreshing ? 'refreshing' : ''}`}>
                <ListView
                    items={filteredItems}
                    selectionMode="single"
                    selectedKeys={selectedId ? [selectedId] : []}
                    onSelectionChange={(keys) => {
                        const itemId = Array.from(keys)[0] as string;
                        const item = items.find(i => i.id === itemId);
                        if (item) {
                            onSelect(item);
                        }
                    }}
                    aria-label={labels.ariaLabel}
                    height="100%"
                    UNSAFE_className="flex-1"
                >
                    {(item) => (
                        <Item key={item.id} textValue={item.title || item.name}>
                            {renderItem ? renderItem(item) : (
                                <Text>{item.title || item.name}</Text>
                            )}
                            {renderDescription && renderDescription(item)}
                        </Item>
                    )}
                </ListView>

                {filteredItems.length === 0 && searchQuery && (
                    <Text UNSAFE_className="text-sm text-gray-600" marginTop="size-200">
                        No {labels.itemNoun}s match "{searchQuery}"
                    </Text>
                )}
            </div>
        </>
    );
}

/**
 * RefreshButton - Consistent refresh button used in selection steps
 */
function RefreshButton({
    isLoading,
    onRefresh,
    ariaLabel,
}: {
    isLoading: boolean;
    onRefresh: () => void;
    ariaLabel: string;
}) {
    return (
        <ActionButton
            isQuiet
            onPress={onRefresh}
            aria-label={ariaLabel}
            isDisabled={isLoading}
            UNSAFE_className="cursor-pointer"
        >
            {isLoading ? <Spinner size="S" aria-label="Loading" /> : <Refresh />}
        </ActionButton>
    );
}
