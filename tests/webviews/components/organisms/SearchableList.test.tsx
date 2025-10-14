import React from 'react';
import { renderWithProviders, screen, waitFor } from '../../../utils/react-test-utils';
import userEvent from '@testing-library/user-event';
import { SearchableList, SearchableListItem } from '../../../../src/webviews/components/organisms/SearchableList';

interface TestItem extends SearchableListItem {
    id: string;
    title: string;
    description?: string;
}

const mockItems: TestItem[] = [
    { id: '1', title: 'Project Alpha', description: 'First project' },
    { id: '2', title: 'Project Beta', description: 'Second project' },
    { id: '3', title: 'Apple Tree', description: 'Fruit project' },
    { id: '4', title: 'Banana Split', description: 'Dessert project' },
];

describe('SearchableList', () => {
    describe('Rendering', () => {
        it('renders all items initially', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('Project Alpha')).toBeInTheDocument();
            expect(screen.getByText('Project Beta')).toBeInTheDocument();
            expect(screen.getByText('Apple Tree')).toBeInTheDocument();
            expect(screen.getByText('Banana Split')).toBeInTheDocument();
        });

        it('renders item descriptions', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('First project')).toBeInTheDocument();
            expect(screen.getByText('Second project')).toBeInTheDocument();
        });

        it('renders with ListView role', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
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
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    searchThreshold={3}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByRole('searchbox')).toBeInTheDocument();
        });

        it('does not show search field when items below threshold', () => {
            const fewItems = mockItems.slice(0, 2);
            renderWithProviders(
                <SearchableList
                    items={fewItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={fewItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    searchThreshold={5}
                    ariaLabel="Test list"
                />
            );

            expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
        });

        it('calls onSearchQueryChange when typing in search', async () => {
            const user = userEvent.setup();
            const handleSearch = jest.fn();

            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={handleSearch}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    searchThreshold={3}
                    ariaLabel="Test list"
                />
            );

            const searchBox = screen.getByRole('searchbox');
            await user.type(searchBox, 'Apple');

            expect(handleSearch).toHaveBeenCalled();
        });

        it('displays search query value', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery="Project"
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    searchThreshold={3}
                    ariaLabel="Test list"
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
                    items={mockItems}
                    searchQuery="Project"
                    onSearchQueryChange={jest.fn()}
                    filteredItems={filtered}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('Project Alpha')).toBeInTheDocument();
            expect(screen.getByText('Project Beta')).toBeInTheDocument();
            expect(screen.queryByText('Apple Tree')).not.toBeInTheDocument();
        });

        it('shows "no results" message when filter returns empty', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery="NonExistent"
                    onSearchQueryChange={jest.fn()}
                    filteredItems={[]}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('No items match "NonExistent"')).toBeInTheDocument();
        });
    });

    describe('Selection', () => {
        it('calls onSelectionChange when item selected', async () => {
            const user = userEvent.setup();
            const handleSelection = jest.fn();

            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    selectedKeys={[]}
                    onSelectionChange={handleSelection}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            const item = screen.getByText('Project Alpha');
            await user.click(item);

            expect(handleSelection).toHaveBeenCalled();
        });

        it('shows selected item', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    selectedKeys={['1']}
                    onSelectionChange={jest.fn()}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
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
                    items={[]}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={[]}
                    isLoading={true}
                    hasLoadedOnce={false}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('disables refresh button when loading', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={true}
                    hasLoadedOnce={true}
                    onRefresh={jest.fn()}
                    searchThreshold={3}
                    ariaLabel="Test list"
                />
            );

            const refreshButton = screen.getByLabelText('Refresh list');
            expect(refreshButton).toBeDisabled();
        });

        it('applies opacity during refresh', () => {
            const { container } = renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    isRefreshing={true}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            const listContainer = container.querySelector('[style*="opacity"]');
            expect(listContainer).toHaveStyle({ opacity: 0.5 });
        });
    });

    describe('Refresh Functionality', () => {
        it('renders refresh button when onRefresh provided', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    onRefresh={jest.fn()}
                    searchThreshold={3}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByLabelText('Refresh list')).toBeInTheDocument();
        });

        it('calls onRefresh when refresh button clicked', async () => {
            const user = userEvent.setup();
            const handleRefresh = jest.fn();

            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    onRefresh={handleRefresh}
                    searchThreshold={3}
                    ariaLabel="Test list"
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
                    items={fewItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={fewItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    onRefresh={jest.fn()}
                    searchThreshold={5}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByLabelText('Refresh list')).toBeInTheDocument();
        });
    });

    describe('Item Count Display', () => {
        it('shows item count when loaded', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('Showing 4 of 4 items')).toBeInTheDocument();
        });

        it('shows singular "item" for single item', () => {
            const singleItem = [mockItems[0]];
            renderWithProviders(
                <SearchableList
                    items={singleItem}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={singleItem}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('Showing 1 of 1 item')).toBeInTheDocument();
        });

        it('shows filtered count vs total', () => {
            const filtered = mockItems.slice(0, 2);
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery="Project"
                    onSearchQueryChange={jest.fn()}
                    filteredItems={filtered}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('Showing 2 of 4 items')).toBeInTheDocument();
        });

        it('does not show count when not loaded once', () => {
            renderWithProviders(
                <SearchableList
                    items={[]}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={[]}
                    isLoading={true}
                    hasLoadedOnce={false}
                    ariaLabel="Test list"
                />
            );

            expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
        });
    });

    describe('AutoFocus', () => {
        it('does not autofocus by default', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    searchThreshold={3}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByRole('searchbox')).toBeInTheDocument();
        });

        it('autofocuses search when autoFocus is true and no selection', () => {
            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    selectedKeys={[]}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    searchThreshold={3}
                    autoFocus={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByRole('searchbox')).toBeInTheDocument();
        });
    });

    describe('Custom Item Renderer', () => {
        it('uses custom renderer when provided', () => {
            const customRenderer = (item: TestItem) => (
                <div data-testid={`custom-${item.id}`}>
                    Custom: {item.title}
                </div>
            );

            renderWithProviders(
                <SearchableList
                    items={mockItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={mockItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    renderItem={customRenderer}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByTestId('custom-1')).toBeInTheDocument();
            expect(screen.getByText('Custom: Project Alpha')).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('handles empty items array', () => {
            renderWithProviders(
                <SearchableList
                    items={[]}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={[]}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('Showing 0 of 0 items')).toBeInTheDocument();
        });

        it('handles items without descriptions', () => {
            const noDescItems: TestItem[] = [
                { id: '1', title: 'Item 1' },
                { id: '2', title: 'Item 2' }
            ];

            renderWithProviders(
                <SearchableList
                    items={noDescItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={noDescItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('Item 1')).toBeInTheDocument();
            expect(screen.getByText('Item 2')).toBeInTheDocument();
        });

        it('handles items with name instead of title', () => {
            const nameItems = [
                { id: '1', name: 'Named Item' },
            ] as any[];

            renderWithProviders(
                <SearchableList
                    items={nameItems}
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    filteredItems={nameItems}
                    isLoading={false}
                    hasLoadedOnce={true}
                    ariaLabel="Test list"
                />
            );

            expect(screen.getByText('Named Item')).toBeInTheDocument();
        });
    });
});
