/**
 * The "More" overflow menu — contents, per-item gating, and Delete isolation.
 *
 * Split from ActionGrid.test.tsx when that file crossed the 500-line warning.
 * Mocks and fixtures come from the shared harness; see ActionGrid.testUtils for
 * why the SUT is imported from there.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ActionGrid, defaultProps, edsProps } from './ActionGrid.testUtils';

describe('ActionGrid — overflow menu', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Overflow Menu', () => {
        it('should render a More overflow trigger with an accessible label', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByLabelText('More actions')).toBeInTheDocument();
        });

        it('should expose Dev Console inside the overflow menu', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const menu = container.querySelector('[role="menu"]') as HTMLElement;
            expect(within(menu).getByText('Dev Console')).toBeInTheDocument();
        });

        it('should call handleOpenDevConsole when Dev Console menu item clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Dev Console'));

            expect(defaultProps.handleOpenDevConsole).toHaveBeenCalled();
        });

        it('should expose Export in the overflow menu', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const menu = container.querySelector('[role="menu"]') as HTMLElement;
            expect(within(menu).getByText('Export')).toBeInTheDocument();
        });

        it('should expose Delete as the LAST overflow item (destructive-last convention)', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const menu = container.querySelector('[role="menu"]') as HTMLElement;
            const items = within(menu).getAllByRole('menuitem');
            expect(items[items.length - 1]).toHaveTextContent('Delete');
            expect(items[items.length - 2]).toHaveTextContent('Reset');
        });

        it('should call handleExportProject when Export clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Export'));

            expect(defaultProps.handleExportProject).toHaveBeenCalled();
        });

        it('should call handleResetProject when Reset clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Reset'));

            expect(defaultProps.handleResetProject).toHaveBeenCalled();
        });
    });

    describe('Overflow Menu - No Rename item', () => {
        it('offers no Rename anywhere — renaming is inline on the dashboard title', () => {
            const { container } = render(<ActionGrid {...defaultProps} isRunning={false} />);

            const menu = container.querySelector('[role="menu"]') as HTMLElement;
            expect(within(menu).queryByText('Rename')).not.toBeInTheDocument();
            expect(screen.queryByText('Rename')).not.toBeInTheDocument();
        });
    });

    /**
     * Edit is a TILE now, not a menu item — it applies to every project type and
     * changes what the demo contains, which earns a place in the row. Its
     * running-state gating moved with it: the tile disables rather than
     * disappears, so the grid does not reshuffle. Covered in
     * ActionGrid-zoneStatus.test.tsx.
     */
    describe('Overflow Menu - no Edit item', () => {
        it.each([
            ['stopped non-EDS', () => defaultProps],
            ['EDS', () => edsProps],
        ])('offers no Edit for a %s project', (_label, props) => {
            const { container } = render(<ActionGrid {...props()} />);

            const menu = container.querySelector('[role="menu"]') as HTMLElement;
            expect(within(menu).queryByText('Edit')).not.toBeInTheDocument();
        });
    });

    describe('Overflow Menu - no per-component deploy actions', () => {
        it.each([
            ['EDS', () => edsProps],
            ['non-EDS', () => defaultProps],
        ])('offers no Republish Content for a %s project', (_label, props) => {
            const { container } = render(<ActionGrid {...props()} />);

            const menu = container.querySelector('[role="menu"]') as HTMLElement;
            expect(within(menu).queryByText('Republish Content')).not.toBeInTheDocument();
        });
    });

    describe('Delete (destructive, in the More overflow)', () => {
        it('renders NO isolated delete footer zone (Delete moved into More)', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            expect(container.querySelector('[data-zone="delete"]')).not.toBeInTheDocument();
        });

        it('renders Delete inside the overflow menu, not as a tile', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const menu = container.querySelector('[role="menu"]') as HTMLElement;
            expect(within(menu).getByText('Delete')).toBeInTheDocument();
            // Not a standalone action tile anywhere outside the menu.
            expect(screen.getByText('Delete').closest('[role="menu"]')).toBe(menu);
        });

        it('marks the Delete menu item with the destructive text class', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByText('Delete').className).toContain('menu-item-destructive');
        });

        it('should call handleDeleteProject when Delete clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Delete'));

            expect(defaultProps.handleDeleteProject).toHaveBeenCalled();
        });
    });
});
