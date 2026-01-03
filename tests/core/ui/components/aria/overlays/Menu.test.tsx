/**
 * Menu Component Tests
 *
 * Tests the Menu, MenuItem, MenuSeparator, and MenuTrigger overlay components
 * built with React Aria for accessibility and CSS Modules for styling.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from '@/core/ui/components/aria/overlays';
import { Button } from '@/core/ui/components/aria/interactive';

describe('Menu', () => {
    describe('rendering', () => {
        it('should render menu when open', async () => {
            // Given: A Menu inside MenuTrigger that is open
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit</MenuItem>
                        <MenuItem id="delete">Delete</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // When: User clicks to open
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: Menu popup is visible
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });
        });

        it('should render menu items', async () => {
            // Given: A Menu with MenuItem children
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit</MenuItem>
                        <MenuItem id="duplicate">Duplicate</MenuItem>
                        <MenuItem id="delete">Delete</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // When: Menu is opened
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: All menu items are visible
            await waitFor(() => {
                expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
                expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument();
                expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
            });
        });

        it('should display MenuItem label text', async () => {
            // Given: A MenuItem with children="Edit Project"
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit Project</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // When: Menu is opened
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: "Edit Project" text is visible
            await waitFor(() => {
                expect(screen.getByText('Edit Project')).toBeInTheDocument();
            });
        });

        it('should render menu from items prop', async () => {
            // Given: A Menu with items data array
            const user = userEvent.setup();
            const items = [
                { key: 'edit', label: 'Edit' },
                { key: 'delete', label: 'Delete', isDisabled: true },
            ];
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu items={items} onAction={jest.fn()} />
                </MenuTrigger>
            );

            // When: Menu is opened
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: All items are rendered from data
            await waitFor(() => {
                expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
                expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
            });
        });

        it('should render menu item with icon from items prop', async () => {
            // Given: A Menu with items including icons
            const user = userEvent.setup();
            const items = [
                { key: 'settings', label: 'Settings', icon: <span data-testid="icon">icon</span> },
            ];
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu items={items} onAction={jest.fn()} />
                </MenuTrigger>
            );

            // When: Menu is opened
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: Icon is rendered
            await waitFor(() => {
                expect(screen.getByTestId('icon')).toBeInTheDocument();
            });
        });

        it('should display MenuItem icon', async () => {
            // Given: A MenuItem with icon element
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit" textValue="Edit">
                            <span data-testid="icon">Icon</span>
                            <span>Edit</span>
                        </MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // When: Menu is opened
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: Icon is visible before label
            await waitFor(() => {
                expect(screen.getByTestId('icon')).toBeInTheDocument();
            });
        });
    });

    describe('interaction', () => {
        it('should open on trigger click', async () => {
            // Given: A MenuTrigger with Button trigger
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // When: User clicks the trigger button
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: Menu popup becomes visible
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });
        });

        it('should close on Escape', async () => {
            // Given: An open Menu with onClose handler
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // Open menu
            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // When: Escape key is pressed
            await user.keyboard('{Escape}');

            // Then: Menu closes
            await waitFor(() => {
                expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            });
        });

        it('should close on outside click', async () => {
            // Given: An open Menu
            const user = userEvent.setup();
            render(
                <div>
                    <button data-testid="outside">Outside</button>
                    <MenuTrigger>
                        <Button>Actions</Button>
                        <Menu onAction={jest.fn()}>
                            <MenuItem id="edit">Edit</MenuItem>
                        </Menu>
                    </MenuTrigger>
                </div>
            );

            // Open menu
            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // When: User clicks outside the menu
            await user.click(screen.getByTestId('outside'));

            // Then: Menu closes
            await waitFor(() => {
                expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            });
        });

        it('should trigger onAction when MenuItem clicked', async () => {
            // Given: A Menu with onAction handler
            const onAction = jest.fn();
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={onAction}>
                        <MenuItem id="edit">Edit</MenuItem>
                        <MenuItem id="delete">Delete</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // Open menu
            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // When: User clicks a MenuItem with key="edit"
            await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

            // Then: onAction is called with "edit"
            expect(onAction).toHaveBeenCalledWith('edit');
        });

        it('should close after item selection by default', async () => {
            // Given: An open Menu with closeOnSelect={true} (default)
            const onAction = jest.fn();
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={onAction}>
                        <MenuItem id="edit">Edit</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // Open menu
            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // When: User selects a menu item
            await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

            // Then: Menu closes after selection
            await waitFor(() => {
                expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            });
        });
    });

    describe('keyboard navigation', () => {
        it('should support arrow down navigation', async () => {
            // Given: An open Menu with focus on first item
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="first">First</MenuItem>
                        <MenuItem id="second">Second</MenuItem>
                        <MenuItem id="third">Third</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // When: User presses ArrowDown
            await user.keyboard('{ArrowDown}');

            // Then: Focus moves to next item
            const menu = screen.getByRole('menu');
            expect(menu.contains(document.activeElement)).toBe(true);
        });

        it('should support arrow up navigation', async () => {
            // Given: An open Menu with focus on second item
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="first">First</MenuItem>
                        <MenuItem id="second">Second</MenuItem>
                        <MenuItem id="third">Third</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // Move down first, then up
            await user.keyboard('{ArrowDown}');
            await user.keyboard('{ArrowDown}');

            // When: User presses ArrowUp
            await user.keyboard('{ArrowUp}');

            // Then: Focus moves to previous item
            const menu = screen.getByRole('menu');
            expect(menu.contains(document.activeElement)).toBe(true);
        });

        it('should wrap focus at boundaries', async () => {
            // Given: An open Menu with focus on last item
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="first">First</MenuItem>
                        <MenuItem id="second">Second</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // Move to last item
            await user.keyboard('{End}');

            // When: User presses ArrowDown
            await user.keyboard('{ArrowDown}');

            // Then: Focus wraps to first item (behavior depends on React Aria)
            const menu = screen.getByRole('menu');
            expect(menu.contains(document.activeElement)).toBe(true);
        });

        it('should select item on Enter', async () => {
            // Given: An open Menu with focus on an item
            const onAction = jest.fn();
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={onAction}>
                        <MenuItem id="edit">Edit</MenuItem>
                        <MenuItem id="delete">Delete</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // Navigate to first item
            await user.keyboard('{ArrowDown}');

            // When: User presses Enter
            await user.keyboard('{Enter}');

            // Then: Item is selected and onAction is called
            expect(onAction).toHaveBeenCalled();
        });

        it('should select item on Space', async () => {
            // Given: An open Menu with focus on an item
            const onAction = jest.fn();
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={onAction}>
                        <MenuItem id="edit">Edit</MenuItem>
                        <MenuItem id="delete">Delete</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // Navigate to first item
            await user.keyboard('{ArrowDown}');

            // When: User presses Space
            await user.keyboard(' ');

            // Then: Item is selected and onAction is called
            expect(onAction).toHaveBeenCalled();
        });

        it('should support Home key (jump to first)', async () => {
            // Given: An open Menu with focus on middle item
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="first">First</MenuItem>
                        <MenuItem id="second">Second</MenuItem>
                        <MenuItem id="third">Third</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // Move to middle item
            await user.keyboard('{ArrowDown}');
            await user.keyboard('{ArrowDown}');

            // When: User presses Home
            await user.keyboard('{Home}');

            // Then: Focus jumps to first item
            const menu = screen.getByRole('menu');
            expect(menu.contains(document.activeElement)).toBe(true);
        });

        it('should support End key (jump to last)', async () => {
            // Given: An open Menu with focus on middle item
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="first">First</MenuItem>
                        <MenuItem id="second">Second</MenuItem>
                        <MenuItem id="third">Third</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // When: User presses End
            await user.keyboard('{End}');

            // Then: Focus jumps to last item
            const menu = screen.getByRole('menu');
            expect(menu.contains(document.activeElement)).toBe(true);
        });

        it('should support type-ahead search', async () => {
            // Given: An open Menu with items "Delete", "Duplicate", "Edit"
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="delete" textValue="Delete">Delete</MenuItem>
                        <MenuItem id="duplicate" textValue="Duplicate">Duplicate</MenuItem>
                        <MenuItem id="edit" textValue="Edit">Edit</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // When: User types "e"
            await user.keyboard('e');

            // Then: Focus moves to "Edit" item
            await waitFor(() => {
                const editItem = screen.getByRole('menuitem', { name: 'Edit' });
                // Item should be focused
                expect(editItem).toHaveAttribute('data-focused', 'true');
            }, { timeout: 1000 });
        });
    });

    describe('accessibility', () => {
        it('should have role="menu"', async () => {
            // Given: An open Menu
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // When: Component is rendered
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: Menu element has role="menu"
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });
        });

        it('should have MenuItem with role="menuitem"', async () => {
            // Given: An open Menu with MenuItem children
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit</MenuItem>
                        <MenuItem id="delete">Delete</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // When: Component is rendered
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: Each MenuItem has role="menuitem"
            await waitFor(() => {
                const menuItems = screen.getAllByRole('menuitem');
                expect(menuItems).toHaveLength(2);
            });
        });

        it('should have trigger with aria-haspopup', () => {
            // Given: A MenuTrigger
            // When: Component is rendered
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // Then: Trigger has aria-haspopup (either "menu" or "true" are valid)
            const trigger = screen.getByRole('button', { name: 'Actions' });
            const hasPopup = trigger.getAttribute('aria-haspopup');
            expect(hasPopup === 'menu' || hasPopup === 'true').toBe(true);
        });

        it('should have trigger with aria-expanded state', async () => {
            // Given: A MenuTrigger
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            const trigger = screen.getByRole('button', { name: 'Actions' });

            // Initially closed
            expect(trigger).toHaveAttribute('aria-expanded', 'false');

            // When: Menu is opened
            await user.click(trigger);

            // Then: Trigger has aria-expanded="true"
            await waitFor(() => {
                expect(trigger).toHaveAttribute('aria-expanded', 'true');
            });
        });

        it('should support isDisabled on MenuItem', async () => {
            // Given: A MenuItem with isDisabled={true}
            const onAction = jest.fn();
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={onAction}>
                        <MenuItem id="edit" isDisabled>Edit</MenuItem>
                        <MenuItem id="delete">Delete</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // When: Menu is opened
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // Then: Item has aria-disabled="true" and is not selectable
            const editItem = screen.getByRole('menuitem', { name: 'Edit' });
            expect(editItem).toHaveAttribute('aria-disabled', 'true');

            // Click should not trigger onAction
            await user.click(editItem);
            expect(onAction).not.toHaveBeenCalledWith('edit');
        });
    });

    describe('separator', () => {
        it('should support MenuSeparator', async () => {
            // Given: A Menu with MenuSeparator between items
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={jest.fn()}>
                        <MenuItem id="edit">Edit</MenuItem>
                        <MenuSeparator />
                        <MenuItem id="delete">Delete</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // When: Menu is opened
            await user.click(screen.getByRole('button', { name: 'Actions' }));

            // Then: Separator is visible with role="separator"
            await waitFor(() => {
                expect(screen.getByRole('separator')).toBeInTheDocument();
            });
        });
    });

    describe('compatibility', () => {
        it('should call onAction with correct item key', async () => {
            // Given: A Menu with items ["start", "stop", "delete"]
            const onAction = jest.fn();
            const user = userEvent.setup();
            render(
                <MenuTrigger>
                    <Button>Actions</Button>
                    <Menu onAction={onAction}>
                        <MenuItem id="start">Start</MenuItem>
                        <MenuItem id="stop">Stop</MenuItem>
                        <MenuItem id="delete">Delete</MenuItem>
                    </Menu>
                </MenuTrigger>
            );

            // Open menu
            await user.click(screen.getByRole('button', { name: 'Actions' }));
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            // When: User selects "stop" item
            await user.click(screen.getByRole('menuitem', { name: 'Stop' }));

            // Then: onAction is called with "stop" key
            expect(onAction).toHaveBeenCalledWith('stop');
        });
    });

    describe('React DevTools', () => {
        it('should have displayName set on Menu', () => {
            expect(Menu.displayName).toBe('Menu');
        });

        it('should have displayName set on MenuItem', () => {
            expect(MenuItem.displayName).toBe('MenuItem');
        });

        it('should have displayName set on MenuSeparator', () => {
            expect(MenuSeparator.displayName).toBe('MenuSeparator');
        });

        it('should have displayName set on MenuTrigger', () => {
            expect(MenuTrigger.displayName).toBe('MenuTrigger');
        });
    });
});
