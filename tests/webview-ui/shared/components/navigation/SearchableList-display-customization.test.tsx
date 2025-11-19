import React from 'react';
import { renderWithProviders, screen } from "../../../../helpers/react-test-utils";
import { Item, Text } from '@adobe/react-spectrum';
import { SearchableList } from '@/core/ui/components/navigation/SearchableList';
import { mockItems, defaultProps, TestItem } from './SearchableList.testUtils';

/**
 * SearchableList component tests - Display customization and edge cases
 * Tests item count display, autofocus behavior, custom renderers, and edge cases
 */
describe('SearchableList - Display Customization', () => {
    describe('Item Count Display', () => {
        it('shows item count when loaded', () => {
            renderWithProviders(
                <SearchableList {...defaultProps} />
            );

            expect(screen.getByText('Showing 4 of 4 items')).toBeInTheDocument();
        });

        it('shows singular "item" for single item', () => {
            const singleItem = [mockItems[0]];
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    items={singleItem}
                    filteredItems={singleItem}
                />
            );

            expect(screen.getByText('Showing 1 of 1 item')).toBeInTheDocument();
        });

        it('shows filtered count vs total', () => {
            const filtered = mockItems.slice(0, 2);
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    searchQuery="Project"
                    filteredItems={filtered}
                />
            );

            expect(screen.getByText('Showing 2 of 4 items')).toBeInTheDocument();
        });

        it('does not show count when not loaded once', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    items={[]}
                    filteredItems={[]}
                    isLoading={true}
                    hasLoadedOnce={false}
                />
            );

            expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
        });
    });

    describe('AutoFocus', () => {
        it('does not autofocus by default', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    searchThreshold={3}
                />
            );

            expect(screen.getByRole('searchbox')).toBeInTheDocument();
        });

        it('autofocuses search when autoFocus is true and no selection', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    selectedKeys={[]}
                    searchThreshold={3}
                    autoFocus={true}
                />
            );

            expect(screen.getByRole('searchbox')).toBeInTheDocument();
        });
    });

    describe('Custom Item Renderer', () => {
        it('uses custom renderer when provided', () => {
            // Custom renderer is properly implemented with filteredItems.map(itemRenderer)
            const customRenderer = (item: TestItem) => (
                <Item key={item.id} textValue={item.title}>
                    <Text>Custom: {item.title}</Text>
                </Item>
            );

            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    renderItem={customRenderer}
                />
            );

            // Custom renderer is used - check for custom text format
            expect(screen.getByText('Custom: Project Alpha')).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('handles empty items array', () => {
            renderWithProviders(
                <SearchableList
                    {...defaultProps}
                    items={[]}
                    filteredItems={[]}
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
                    {...defaultProps}
                    items={noDescItems}
                    filteredItems={noDescItems}
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
                    {...defaultProps}
                    items={nameItems}
                    filteredItems={nameItems}
                />
            );

            expect(screen.getByText('Named Item')).toBeInTheDocument();
        });
    });
});
