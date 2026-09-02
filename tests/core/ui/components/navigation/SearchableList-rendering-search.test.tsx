import React from 'react';
import { renderWithProviders, screen } from "../../../../helpers/react-test-utils";
import userEvent from '@testing-library/user-event';
import { SearchableList } from '@/core/ui/components/navigation/SearchableList';
import { mockItems, defaultProps, cleanupTests } from './SearchableList.testUtils';

/**
 * SearchableList component tests - Rendering and Search functionality
 * Tests basic rendering, search field behavior, and filtered results display
 */
describe('SearchableList - Rendering and Search', () => {
    afterEach(() => {
        cleanupTests();
    });

    describe('Rendering', () => {
        it('renders all items initially', () => {
            renderWithProviders(
                <SearchableList {...defaultProps} />
            );

            expect(screen.getByText('Project Alpha')).toBeInTheDocument();
            expect(screen.getByText('Project Beta')).toBeInTheDocument();
            expect(screen.getByText('Apple Tree')).toBeInTheDocument();
            expect(screen.getByText('Banana Split')).toBeInTheDocument();
        });

        it('renders item descriptions', () => {
            renderWithProviders(
                <SearchableList {...defaultProps} />
            );

            expect(screen.getByText('First project')).toBeInTheDocument();
            expect(screen.getByText('Second project')).toBeInTheDocument();
        });

        it('renders with ListView role', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    ariaLabel="Adobe Projects"
                />
            );

            // Spectrum ListView renders as a grid role
            expect(screen.getByRole('grid', { name: 'Adobe Projects' })).toBeInTheDocument();
        });
    });

    describe('Search Functionality', () => {
        it('shows search field when items exceed threshold', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    searchThreshold={3}
                />
            );

            expect(screen.getByRole('searchbox')).toBeInTheDocument();
        });

        it('does not show search field when items below threshold', () => {
            const fewItems = mockItems.slice(0, 2);
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    items={fewItems}
                    filteredItems={fewItems}
                    searchThreshold={5}
                />
            );

            expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
        });

        it('calls onSearchQueryChange when typing in search', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const handleSearch = jest.fn();

            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    onSearchQueryChange={handleSearch}
                    searchThreshold={3}
                />
            );

            const searchBox = screen.getByRole('searchbox');
            await user.type(searchBox, 'Apple');

            expect(handleSearch).toHaveBeenCalled();
        });

        it('displays search query value', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    searchQuery="Project"
                    searchThreshold={3}
                />
            );

            const searchBox = screen.getByRole('searchbox') as HTMLInputElement;
            expect(searchBox.value).toBe('Project');
        });
    });

    describe('Filtered Results', () => {
        it('displays only filtered items', () => {
            const filtered = mockItems.filter(item => item.title.includes('Project'));

            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    searchQuery="Project"
                    filteredItems={filtered}
                />
            );

            expect(screen.getByText('Project Alpha')).toBeInTheDocument();
            expect(screen.getByText('Project Beta')).toBeInTheDocument();
            expect(screen.queryByText('Apple Tree')).not.toBeInTheDocument();
        });

        it('shows "no results" message when filter returns empty', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    searchQuery="NonExistent"
                    filteredItems={[]}
                />
            );

            expect(screen.getByText('No items match "NonExistent"')).toBeInTheDocument();
        });
    });
});
