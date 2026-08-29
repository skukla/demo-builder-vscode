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

import { settle } from '../../../helpers/reactSettle';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DataInstallerScreen } from '@/features/data-installer/ui/DataInstallerScreen';

const mockRequest = webviewClient.request as jest.Mock;

/**
 * Every list handler answers with an empty page — plus a project target, which
 * the activity view now asks for FIRST. Without an instance it scopes to nothing
 * and never requests the log at all, which is the correct behaviour and would
 * make the swap test look broken.
 */
function resolveEmpty(): void {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'get-datapack-import-target') {
            return { success: true, data: { instance: 'TENANT123', projectName: 'demo-1' } };
        }
        return { success: true, data: { items: [], count: 0, total: 0 } };
    });
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

    it('renders the page header', async () => {
        render(<DataInstallerScreen />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        expect(screen.getByText('Data Installer')).toBeInTheDocument();
    });

    it('opens on the catalog', async () => {
        render(<DataInstallerScreen />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        // `request(type, payload, timeoutMs)` takes a third argument the view
        // leaves undefined; only the first two are this test's business.
        await waitFor(() => expect(mockRequest).toHaveBeenCalled());
        const [type, payload] = mockRequest.mock.calls[0];
        expect(type).toBe('find-datapacks');
        expect(payload).toEqual({ includeCommunity: false });
    });

    it('no longer spends a round trip on the connectivity check', async () => {
        render(<DataInstallerScreen />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await waitFor(() => expect(mockRequest).toHaveBeenCalled());
        expect(requestedTypes()).not.toContain('check-datapack-service');
    });

    describe('view switcher', () => {
        it('offers the two views', async () => {
            render(<DataInstallerScreen />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            expect(screen.getByRole('button', { name: 'Catalog' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Activity' })).toBeInTheDocument();
        });

        /**
         * Installed is GONE, not hidden. It listed the service's global,
         * self-reported tracking — which `DELETE get-installed-datapacks` clears
         * without uninstalling, so it could call a pack absent while its data sat
         * on the instance. The scoped activity log answers the same question from
         * the request log.
         */
        it('no longer offers Installed', async () => {
            render(<DataInstallerScreen />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            expect(screen.queryByRole('button', { name: 'Installed' })).not.toBeInTheDocument();
        });

        it('marks the catalog active on open', async () => {
            render(<DataInstallerScreen />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            expect(screen.getByRole('button', { name: 'Catalog' })).toHaveAttribute(
                'aria-pressed',
                'true'
            );
        });

        it('swaps to the activity view', async () => {
            render(<DataInstallerScreen />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            fireEvent.click(screen.getByRole('button', { name: 'Activity' }));

            await waitFor(() => expect(requestedTypes()).toContain('get-datapack-activity'));
        });

        // Each view owns its own request, so only the visible one should be
        // spending round trips.
        it('does not fetch for a view that is not on screen', async () => {
            render(<DataInstallerScreen />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await waitFor(() => expect(mockRequest).toHaveBeenCalled());

            // `get-datapack-activity` is made by exactly one view
            // (DatapackActivityView.tsx:76), so its absence is real evidence
            // that the off-screen view never mounted.
            expect(requestedTypes()).not.toContain('get-datapack-activity');

            // NOT `list-installed-datapacks`, though this test used to assert
            // that too. It is not exclusive to the off-screen installed view:
            // the VISIBLE catalog fetches it as soon as it learns the Commerce
            // instance, to mark which packs are already present
            // (DatapackCatalogView.tsx:128-134). The old assertion held only
            // because the project-context request had not resolved yet, so the
            // follow-on fetch had not been issued when the assertion ran.
            // Settling removed that race and showed the proxy was wrong — the
            // claim it was standing in for is still true, and the line above is
            // what actually tests it.
        });
    });
});
