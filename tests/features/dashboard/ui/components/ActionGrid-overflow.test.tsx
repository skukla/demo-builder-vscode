/**
 * Reset and Delete, and the Share row.
 *
 * The overflow used to hold ten items, everyday doors beside Delete. On
 * 2026-10-06 (owner) it shrank to the two rare, destructive actions, and once
 * the two-tier layout freed the room it went entirely: Reset and Delete are
 * tiles at the foot of Build, set apart from the everyday ones. These specs pin
 * that, and that each item that left the menu became a tile with the same gating.
 *
 * Mocks and fixtures come from the shared harness; see ActionGrid.testUtils for
 * why the SUT is imported from there.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ActionGrid, defaultProps, edsProps, getZone } from './ActionGrid.testUtils';

const tile = (container: HTMLElement, action: string): HTMLElement | null =>
    container.querySelector(`[data-action="${action}"]`);

describe('ActionGrid — Reset and Delete tiles', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders no menu at all — nothing is hidden behind a More', () => {
        const { container } = render(<ActionGrid {...edsProps} />);

        expect(container.querySelector('[role="menu"]')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Reset or Delete')).not.toBeInTheDocument();
    });

    it.each([
        ['non-EDS', () => defaultProps],
        ['EDS', () => edsProps],
    ])('ends the Build row with Reset then Delete for a %s project', (_label, props) => {
        const { container } = render(<ActionGrid {...props()} />);

        const actions = Array.from(getZone(container, 'build').querySelectorAll('[data-action]')).map(
            (el) => el.getAttribute('data-action')
        );
        expect(actions.slice(-2)).toEqual(['reset', 'delete']);
    });

    it('sets the two apart from the everyday tiles', () => {
        const { container } = render(<ActionGrid {...defaultProps} />);

        const group = container.querySelector('.dashboard-compact-danger') as HTMLElement;
        expect(group.contains(tile(container, 'reset'))).toBe(true);
        expect(group.contains(tile(container, 'delete'))).toBe(true);
        expect(group.querySelectorAll('[data-action]')).toHaveLength(2);
    });

    it('marks Delete, and only Delete, as destructive', () => {
        const { container } = render(<ActionGrid {...defaultProps} />);

        expect(tile(container, 'delete')).toHaveClass('dashboard-action-button--danger');
        expect(tile(container, 'reset')).not.toHaveClass('dashboard-action-button--danger');
    });

    it.each([
        ['reset', 'handleResetProject'],
        ['delete', 'handleDeleteProject'],
    ] as const)('runs its handler when %s is pressed', async (action, prop) => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { container } = render(<ActionGrid {...defaultProps} />);

        await user.click(tile(container, action) as HTMLElement);

        expect(defaultProps[prop]).toHaveBeenCalledTimes(1);
    });

    it('offers no Rename anywhere — renaming is inline on the dashboard title', () => {
        render(<ActionGrid {...defaultProps} />);

        expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    });

    it('renders no separate delete footer zone', () => {
        const { container } = render(<ActionGrid {...defaultProps} />);

        expect(container.querySelector('[data-zone="delete"]')).not.toBeInTheDocument();
    });
});

describe('ActionGrid — the Share row', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('offers Export for every project type', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { container } = render(<ActionGrid {...defaultProps} />);

        const exportTile = tile(container, 'export');
        expect(getZone(container, 'share').contains(exportTile)).toBe(true);
        await user.click(exportTile!);
        expect(defaultProps.handleExportProject).toHaveBeenCalled();
    });

    it('offers Save as Package, after Export, to an EDS project only', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const handleSaveDemoPackage = jest.fn();
        const headless = render(
            <ActionGrid {...defaultProps} handleSaveDemoPackage={handleSaveDemoPackage} />
        );
        expect(tile(headless.container, 'save-demo-package')).not.toBeInTheDocument();
        headless.unmount();

        const { container } = render(
            <ActionGrid {...edsProps} handleSaveDemoPackage={handleSaveDemoPackage} />
        );
        const save = tile(container, 'save-demo-package')!;
        expect(tile(container, 'export')!.compareDocumentPosition(save)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
        );
        await user.click(save);
        expect(handleSaveDemoPackage).toHaveBeenCalled();
    });

    it('offers Change Source only for a project built on an added demo', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const first = render(<ActionGrid {...defaultProps} />);
        expect(tile(first.container, 'change-demo-source')).not.toBeInTheDocument();
        first.unmount();

        const handleChangeDemoSource = jest.fn();
        const { container } = render(
            <ActionGrid {...defaultProps} handleChangeDemoSource={handleChangeDemoSource} />
        );
        const change = tile(container, 'change-demo-source')!;
        expect(getZone(container, 'share').contains(change)).toBe(true);
        await user.click(change);
        expect(handleChangeDemoSource).toHaveBeenCalled();
    });
});

/**
 * The EDS-only Storefront tiles need BOTH halves: each is an EDS concept, and a
 * door to a handler the host only wires for projects that have one.
 */
describe.each([
    ['Refresh Blocks', 'refresh-block-library', 'handleRefreshBlockLibrary'],
    ['Site Access', 'site-access', 'handleOpenSiteAccess'],
] as const)('%s tile — EDS AND wired, not either', (_label, action, prop) => {
    it('appears in the Storefront row for an EDS project whose host wired the handler', () => {
        const { container } = render(<ActionGrid {...edsProps} {...{ [prop]: jest.fn() }} />);

        expect(getZone(container, 'storefront').contains(tile(container, action))).toBe(true);
    });

    it('is absent for a non-EDS project even when the handler is passed', () => {
        const { container } = render(<ActionGrid {...defaultProps} {...{ [prop]: jest.fn() }} />);

        expect(tile(container, action)).not.toBeInTheDocument();
    });

    it('is absent for an EDS project with no handler wired', () => {
        const { container } = render(<ActionGrid {...edsProps} />);

        expect(tile(container, action)).not.toBeInTheDocument();
    });

    it('runs its handler when pressed', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const handler = jest.fn();
        const { container } = render(<ActionGrid {...edsProps} {...{ [prop]: handler }} />);

        await user.click(tile(container, action)!);

        expect(handler).toHaveBeenCalled();
    });
});
