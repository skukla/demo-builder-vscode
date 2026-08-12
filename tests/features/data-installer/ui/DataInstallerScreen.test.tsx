/**
 * DataInstallerScreen tests — the panel shell.
 *
 * The shell owns the page chrome and which view is on screen; it owns no data.
 * The connectivity line it used to render is gone: the catalog request runs
 * through the same guard, so a second round trip to `check-datapack-service`
 * only bought a slower first paint (and, because a guard refusal RETURNS rather
 * than throws, it reported "Connected" for every refusal it was meant to catch).
 *
 * With the installed and activity views landed, the switcher has three views and
 * finally renders — the condition `ViewSwitcher` has been waiting on since it was
 * written to hide itself below two.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DataInstallerScreen } from '@/features/data-installer/ui/DataInstallerScreen';

const mockRequest = webviewClient.request as jest.Mock;

/** Every list handler answers with an empty page, whatever is asked. */
function resolveEmpty(): void {
    mockRequest.mockResolvedValue({ success: true, data: { items: [], count: 0, total: 0 } });
}

/** The message types requested so far, in order. */
function requestedTypes(): unknown[] {
    return mockRequest.mock.calls.map((call) => call[0]);
}

describe('DataInstallerScreen', () => {
    beforeEach(() => {
        mockRequest.mockReset();
        resolveEmpty();
    });

    it('renders the page header', () => {
        render(<DataInstallerScreen />);

        expect(screen.getByText('Data Installer')).toBeInTheDocument();
    });

    it('opens on the catalog', async () => {
        render(<DataInstallerScreen />);

        // `request(type, payload, timeoutMs)` takes a third argument the view
        // leaves undefined; only the first two are this test's business.
        await waitFor(() => expect(mockRequest).toHaveBeenCalled());
        const [type, payload] = mockRequest.mock.calls[0];
        expect(type).toBe('find-datapacks');
        expect(payload).toEqual({ includeCommunity: false });
    });

    it('no longer spends a round trip on the connectivity check', async () => {
        render(<DataInstallerScreen />);

        await waitFor(() => expect(mockRequest).toHaveBeenCalled());
        expect(requestedTypes()).not.toContain('check-datapack-service');
    });

    describe('view switcher', () => {
        it('offers all three views', async () => {
            render(<DataInstallerScreen />);
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            expect(screen.getByRole('button', { name: 'Catalog' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Installed' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Activity' })).toBeInTheDocument();
        });

        it('marks the catalog active on open', async () => {
            render(<DataInstallerScreen />);
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            expect(screen.getByRole('button', { name: 'Catalog' })).toHaveAttribute(
                'aria-pressed',
                'true',
            );
        });

        it('swaps to the installed view, which fetches its own data', async () => {
            render(<DataInstallerScreen />);
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            fireEvent.click(screen.getByRole('button', { name: 'Installed' }));

            await waitFor(() =>
                expect(requestedTypes()).toContain('list-installed-datapacks'),
            );
            expect(screen.getByRole('button', { name: 'Installed' })).toHaveAttribute(
                'aria-pressed',
                'true',
            );
        });

        it('swaps to the activity view', async () => {
            render(<DataInstallerScreen />);
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            fireEvent.click(screen.getByRole('button', { name: 'Activity' }));

            await waitFor(() => expect(requestedTypes()).toContain('get-datapack-activity'));
        });

        // Each view owns its own request, so only the visible one should be
        // spending round trips.
        it('does not fetch for a view that is not on screen', async () => {
            render(<DataInstallerScreen />);
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            expect(requestedTypes()).not.toContain('list-installed-datapacks');
            expect(requestedTypes()).not.toContain('get-datapack-activity');
        });
    });
});
