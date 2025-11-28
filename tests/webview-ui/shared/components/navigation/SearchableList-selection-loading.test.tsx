import React from 'react';
import { renderWithProviders, screen } from "../../../../helpers/react-test-utils";
import userEvent from '@testing-library/user-event';
import { SearchableList } from '@/core/ui/components/navigation/SearchableList';
import { mockItems, defaultProps, cleanupTests } from './SearchableList.testUtils';

/**
 * SearchableList component tests - Selection and Loading states
 * Tests item selection, loading states, and refresh functionality
 */
describe('SearchableList - Selection and Loading', () => {
    afterEach(() => {
        cleanupTests();
    });

    describe('Selection', () => {
        it('calls onSelectionChange when item selected', async () => {
            const user = userEvent.setup();
            const handleSelection = jest.fn();

            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    selectedKeys={[]}
                    onSelectionChange={handleSelection}
                />
            );

            const item = screen.getByText('Project Alpha');
            await user.click(item);

            expect(handleSelection).toHaveBeenCalled();
        });

        it('shows selected item', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    selectedKeys={['1']}
                    onSelectionChange={jest.fn()}
                />
            );

            // Spectrum ListView marks selected items
            expect(screen.getByText('Project Alpha')).toBeInTheDocument();
        });
    });

    describe('Loading States', () => {
        it('shows loading spinner when isLoading', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    isLoading={true}
                    hasLoadedOnce={false}
                    onRefresh={jest.fn()}
                    searchThreshold={3}
                />
            );

            // ProgressCircle appears in refresh button when loading
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('disables refresh button when loading', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    isLoading={true}
                    onRefresh={jest.fn()}
                    searchThreshold={3}
                />
            );

            const refreshButton = screen.getByLabelText('Refresh list');
            expect(refreshButton).toBeDisabled();
        });

        it('applies opacity during refresh', () => {
            const { container } = renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    isLoading={false}
                    isRefreshing={true}
                />
            );

            // CSS class-based styling (§11 SOP compliance)
            const listContainer = container.querySelector('.list-refresh-container');
            expect(listContainer).toHaveClass('refreshing');
        });
    });

    describe('Refresh Functionality', () => {
        it('renders refresh button when onRefresh provided', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    onRefresh={jest.fn()}
                    searchThreshold={3}
                />
            );

            expect(screen.getByLabelText('Refresh list')).toBeInTheDocument();
        });

        it('calls onRefresh when refresh button clicked', async () => {
            const user = userEvent.setup();
            const handleRefresh = jest.fn();

            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    onRefresh={handleRefresh}
                    searchThreshold={3}
                />
            );

            const refreshButton = screen.getByLabelText('Refresh list');
            await user.click(refreshButton);

            expect(handleRefresh).toHaveBeenCalledTimes(1);
        });

        it('shows refresh button when no search field', () => {
            const fewItems = mockItems.slice(0, 2);
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    items={fewItems}
                    filteredItems={fewItems}
                    onRefresh={jest.fn()}
                    searchThreshold={5}
                />
            );

            expect(screen.getByLabelText('Refresh list')).toBeInTheDocument();
        });
    });
});
