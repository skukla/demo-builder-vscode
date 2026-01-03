/**
 * List Component Tests
 *
 * Tests for the List and ListItem components that replace
 * @adobe/react-spectrum ListView component for non-virtualized lists.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { List, ListItem } from '@/core/ui/components/aria/primitives/List';

describe('List', () => {
    const sampleItems = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' },
    ];

    describe('Rendering', () => {
        it('should render list items', () => {
            render(
                <List>
                    {sampleItems.map(item => (
                        <ListItem key={item.id} id={item.id}>
                            {item.name}
                        </ListItem>
                    ))}
                </List>
            );

            expect(screen.getByText('Item 1')).toBeInTheDocument();
            expect(screen.getByText('Item 2')).toBeInTheDocument();
            expect(screen.getByText('Item 3')).toBeInTheDocument();
        });

        it('should have proper listbox role', () => {
            render(
                <List aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                </List>
            );

            expect(screen.getByRole('listbox')).toBeInTheDocument();
        });

        it('should render list items with option role', () => {
            render(
                <List>
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            const options = screen.getAllByRole('option');
            expect(options).toHaveLength(2);
        });

        it('should support aria-label', () => {
            render(
                <List aria-label="Project list">
                    <ListItem id="1">Item 1</ListItem>
                </List>
            );

            expect(screen.getByRole('listbox')).toHaveAttribute('aria-label', 'Project list');
        });

        it('should render empty list without errors', () => {
            render(<List aria-label="Empty list" />);

            expect(screen.getByRole('listbox')).toBeInTheDocument();
        });
    });

    describe('Single Selection', () => {
        it('should support single selection mode', () => {
            render(
                <List selectionMode="single" aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            expect(screen.getByRole('listbox')).toBeInTheDocument();
        });

        it('should show selected item when selectedKeys is provided', () => {
            render(
                <List selectionMode="single" selectedKeys={new Set(['2'])} aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            const options = screen.getAllByRole('option');
            expect(options[0]).not.toHaveAttribute('aria-selected', 'true');
            expect(options[1]).toHaveAttribute('aria-selected', 'true');
        });

        it('should call onSelectionChange when item is clicked', async () => {
            const user = userEvent.setup();
            const handleSelectionChange = jest.fn();

            render(
                <List
                    selectionMode="single"
                    onSelectionChange={handleSelectionChange}
                    aria-label="Test list"
                >
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            await user.click(screen.getByText('Item 2'));

            expect(handleSelectionChange).toHaveBeenCalled();
            // First argument should be a Set containing '2'
            const selectionArg = handleSelectionChange.mock.calls[0][0];
            expect(selectionArg).toBeInstanceOf(Set);
            expect(selectionArg.has('2')).toBe(true);
        });

        it('should update selection when controlled selectedKeys changes', () => {
            const { rerender } = render(
                <List selectionMode="single" selectedKeys={new Set(['1'])} aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

            rerender(
                <List selectionMode="single" selectedKeys={new Set(['2'])} aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
        });
    });

    describe('Multiple Selection', () => {
        it('should support multiple selection mode', () => {
            render(
                <List selectionMode="multiple" aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            expect(screen.getByRole('listbox')).toBeInTheDocument();
        });

        it('should show multiple selected items', () => {
            render(
                <List selectionMode="multiple" selectedKeys={new Set(['1', '3'])} aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                    <ListItem id="3">Item 3</ListItem>
                </List>
            );

            const options = screen.getAllByRole('option');
            expect(options[0]).toHaveAttribute('aria-selected', 'true');
            expect(options[1]).not.toHaveAttribute('aria-selected', 'true');
            expect(options[2]).toHaveAttribute('aria-selected', 'true');
        });

        it('should add to selection on click in multiple mode', async () => {
            const user = userEvent.setup();
            const handleSelectionChange = jest.fn();

            render(
                <List
                    selectionMode="multiple"
                    selectedKeys={new Set(['1'])}
                    onSelectionChange={handleSelectionChange}
                    aria-label="Test list"
                >
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            await user.click(screen.getByText('Item 2'));

            expect(handleSelectionChange).toHaveBeenCalled();
        });
    });

    describe('No Selection', () => {
        it('should support no selection mode', () => {
            render(
                <List selectionMode="none" aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            const options = screen.getAllByRole('option');
            options.forEach(option => {
                expect(option).not.toHaveAttribute('aria-selected', 'true');
            });
        });

        it('should not call onSelectionChange when selectionMode is none', async () => {
            const user = userEvent.setup();
            const handleSelectionChange = jest.fn();

            render(
                <List
                    selectionMode="none"
                    onSelectionChange={handleSelectionChange}
                    aria-label="Test list"
                >
                    <ListItem id="1">Item 1</ListItem>
                </List>
            );

            await user.click(screen.getByText('Item 1'));

            expect(handleSelectionChange).not.toHaveBeenCalled();
        });
    });

    describe('Keyboard Navigation', () => {
        it('should navigate with arrow keys', async () => {
            const user = userEvent.setup();

            render(
                <List selectionMode="single" aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                    <ListItem id="3">Item 3</ListItem>
                </List>
            );

            // Tab to focus the first item
            await user.tab();

            // Navigate down should move focus
            await user.keyboard('{ArrowDown}');

            // Second item should now have focus after pressing ArrowDown
            const options = screen.getAllByRole('option');
            expect(options[1]).toHaveFocus();
        });

        it('should select item on Enter key', async () => {
            const user = userEvent.setup();
            const handleSelectionChange = jest.fn();

            render(
                <List
                    selectionMode="single"
                    onSelectionChange={handleSelectionChange}
                    aria-label="Test list"
                >
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            // Focus first item and press Enter
            const options = screen.getAllByRole('option');
            options[0].focus();
            await user.keyboard('{Enter}');

            expect(handleSelectionChange).toHaveBeenCalled();
        });

        it('should select item on Space key', async () => {
            const user = userEvent.setup();
            const handleSelectionChange = jest.fn();

            render(
                <List
                    selectionMode="single"
                    onSelectionChange={handleSelectionChange}
                    aria-label="Test list"
                >
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            const options = screen.getAllByRole('option');
            options[0].focus();
            await user.keyboard(' ');

            expect(handleSelectionChange).toHaveBeenCalled();
        });
    });

    describe('Disabled State', () => {
        it('should support disabled items', () => {
            render(
                <List selectionMode="single" aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2" isDisabled>Item 2</ListItem>
                    <ListItem id="3">Item 3</ListItem>
                </List>
            );

            const options = screen.getAllByRole('option');
            expect(options[1]).toHaveAttribute('aria-disabled', 'true');
        });

        it('should not allow selecting disabled items', async () => {
            const user = userEvent.setup();
            const handleSelectionChange = jest.fn();

            render(
                <List
                    selectionMode="single"
                    onSelectionChange={handleSelectionChange}
                    aria-label="Test list"
                >
                    <ListItem id="1" isDisabled>Item 1</ListItem>
                </List>
            );

            await user.click(screen.getByText('Item 1'));

            expect(handleSelectionChange).not.toHaveBeenCalled();
        });

        it('should support disabledKeys prop', () => {
            render(
                <List selectionMode="single" disabledKeys={new Set(['2'])} aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            const options = screen.getAllByRole('option');
            expect(options[0]).not.toHaveAttribute('aria-disabled', 'true');
            expect(options[1]).toHaveAttribute('aria-disabled', 'true');
        });
    });

    describe('Styling', () => {
        it('should support className prop on List', () => {
            const { container } = render(
                <List className="custom-list" aria-label="Test list">
                    <ListItem id="1">Item 1</ListItem>
                </List>
            );

            expect(container.querySelector('.custom-list')).toBeInTheDocument();
        });

        it('should support className prop on ListItem', () => {
            const { container } = render(
                <List aria-label="Test list">
                    <ListItem id="1" className="custom-item">Item 1</ListItem>
                </List>
            );

            expect(container.querySelector('.custom-item')).toBeInTheDocument();
        });
    });

    describe('TextValue', () => {
        it('should support textValue prop for accessibility', () => {
            render(
                <List aria-label="Test list">
                    <ListItem id="1" textValue="First item">
                        <span>Complex Content</span>
                    </ListItem>
                </List>
            );

            // The option should exist with the complex content
            expect(screen.getByText('Complex Content')).toBeInTheDocument();
        });
    });

    describe('Items Prop', () => {
        it('should support items prop for dynamic rendering', () => {
            render(
                <List aria-label="Test list" items={sampleItems}>
                    {(item) => <ListItem id={item.id}>{item.name}</ListItem>}
                </List>
            );

            expect(screen.getByText('Item 1')).toBeInTheDocument();
            expect(screen.getByText('Item 2')).toBeInTheDocument();
            expect(screen.getByText('Item 3')).toBeInTheDocument();
        });
    });

    describe('DisplayName', () => {
        it('should have displayName set on List', () => {
            expect(List.displayName).toBe('List');
        });

        it('should have displayName set on ListItem', () => {
            expect(ListItem.displayName).toBe('ListItem');
        });
    });

    describe('Default Selection', () => {
        it('should support defaultSelectedKeys for uncontrolled selection', async () => {
            const user = userEvent.setup();
            const handleSelectionChange = jest.fn();

            render(
                <List
                    selectionMode="single"
                    defaultSelectedKeys={new Set(['1'])}
                    onSelectionChange={handleSelectionChange}
                    aria-label="Test list"
                >
                    <ListItem id="1">Item 1</ListItem>
                    <ListItem id="2">Item 2</ListItem>
                </List>
            );

            // Initial selection should be set
            const options = screen.getAllByRole('option');
            expect(options[0]).toHaveAttribute('aria-selected', 'true');

            // Click another item should trigger change
            await user.click(screen.getByText('Item 2'));
            expect(handleSelectionChange).toHaveBeenCalled();
        });
    });
});

describe('ListItem', () => {
    it('should render children', () => {
        render(
            <List aria-label="Test list">
                <ListItem id="1">
                    <span data-testid="custom-content">Custom Content</span>
                </ListItem>
            </List>
        );

        expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    });

    it('should support id prop', () => {
        render(
            <List aria-label="Test list">
                <ListItem id="unique-id">Item</ListItem>
            </List>
        );

        expect(screen.getByRole('option')).toBeInTheDocument();
    });
});
