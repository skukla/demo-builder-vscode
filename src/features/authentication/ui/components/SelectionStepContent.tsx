/**
 * SelectionStepContent - Reusable UI for selection steps
 *
 * Handles the common UI patterns for selection steps:
 * - Loading state with spinner
 * - Error state with retry button
 * - Empty state with message
 * - List view with search/filter (delegates to SearchableList)
 *
 * Used by AdobeProjectStep and AdobeWorkspaceStep to reduce duplication.
 */
import {
    Heading,
    Item,
    Text,
} from '@adobe/react-spectrum';
import React from 'react';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SearchableList } from '@/core/ui/components/navigation/SearchableList';

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
                <CenteredFeedbackContainer>
                    <LoadingDisplay
                        size="L"
                        message={labels.loadingMessage}
                        subMessage={labels.loadingSubMessage}
                        helperText="This could take up to 30 seconds"
                    />
                </CenteredFeedbackContainer>
            </>
        );
    }

    // State 2: Error
    if (error && !isLoading) {
        return (
            <>
                <Heading level={2} marginBottom="size-300">{labels.heading}</Heading>
                <StatusDisplay
                    variant="error"
                    title={labels.errorTitle}
                    message={error}
                    actions={[{ label: 'Try Again', onPress: onLoad, variant: 'accent' }]}
                />
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

    // State 4: Data loaded - show list (delegates to SearchableList)

    // Adapter: Convert Set-based onSelectionChange to item-based onSelect
    const handleSelectionChange = (keys: Set<any>) => {
        const itemId = Array.from(keys)[0] as string;
        const item = items.find(i => i.id === itemId);
        if (item) {
            onSelect(item);
        }
    };

    // Adapter: Create combined renderItem that wraps content in Item with description support
    const combinedRenderItem = (item: T) => (
        <Item key={item.id} textValue={item.title || item.name}>
            {renderItem ? renderItem(item) : (
                <Text>{item.title || item.name}</Text>
            )}
            {renderDescription && renderDescription(item)}
        </Item>
    );

    return (
        <div className="selection-step-content">
            <Heading level={2} marginBottom="size-300">{labels.heading}</Heading>
            <SearchableList
                items={items}
                selectedKeys={selectedId ? [selectedId] : []}
                onSelectionChange={handleSelectionChange}
                searchQuery={searchQuery}
                onSearchQueryChange={onSearchChange}
                filteredItems={filteredItems}
                isLoading={isLoading}
                isRefreshing={isRefreshing}
                onRefresh={onRefresh}
                hasLoadedOnce={hasLoadedOnce}
                ariaLabel={labels.ariaLabel}
                autoFocus={!selectedId}
                renderItem={combinedRenderItem}
                itemNoun={labels.itemNoun}
                searchPlaceholder={labels.searchPlaceholder}
                refreshAriaLabel={`Refresh ${labels.itemNoun}s`}
            />
        </div>
    );
}
