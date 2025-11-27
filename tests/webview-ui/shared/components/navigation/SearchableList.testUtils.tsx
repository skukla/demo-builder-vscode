import React from 'react';
import { cleanup } from '@testing-library/react';
import { SearchableListItem } from '@/core/ui/components/navigation/SearchableList';

/**
 * Shared test utilities for SearchableList component tests
 */

export interface TestItem extends SearchableListItem {
    id: string;
    title: string;
    description?: string;
}

export const mockItems: TestItem[] = [
    { id: '1', title: 'Project Alpha', description: 'First project' },
    { id: '2', title: 'Project Beta', description: 'Second project' },
    { id: '3', title: 'Apple Tree', description: 'Fruit project' },
    { id: '4', title: 'Banana Split', description: 'Dessert project' },
];

export const defaultProps = {
    items: mockItems,
    searchQuery: "",
    onSearchQueryChange: jest.fn(),
    filteredItems: mockItems,
    isLoading: false,
    hasLoadedOnce: true,
    ariaLabel: "Test list"
};

/**
 * Cleanup function to be called in afterEach
 * Unmounts React components and resets mocks to prevent test pollution
 */
export const cleanupTests = () => {
    cleanup(); // Unmount React components to stop any running effects/timers
    jest.clearAllMocks();
};
