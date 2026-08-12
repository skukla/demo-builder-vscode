/**
 * DataInstallerScreen tests — the panel shell.
 *
 * The shell owns the page chrome and which view is on screen; it owns no data.
 * The connectivity line it used to render is gone: the catalog request runs
 * through the same guard, so a second round trip to `check-datapack-service`
 * only bought a slower first paint (and, because a guard refusal RETURNS rather
 * than throws, it reported "Connected" for every refusal it was meant to catch).
 *
 * Strict TDD: written BEFORE the rewire.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DataInstallerScreen } from '@/features/data-installer/ui/DataInstallerScreen';

const mockRequest = webviewClient.request as jest.Mock;

describe('DataInstallerScreen', () => {
    beforeEach(() => {
        mockRequest.mockReset();
        mockRequest.mockResolvedValue({ success: true, data: { items: [], count: 0, total: 0 } });
    });

    it('renders the page header', () => {
        render(<DataInstallerScreen />);

        expect(screen.getByText('Data Installer')).toBeInTheDocument();
    });

    it('hosts the catalog view', async () => {
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
        const types = mockRequest.mock.calls.map((call) => call[0]);
        expect(types).not.toContain('check-datapack-service');
    });

    it('renders no view switcher while the catalog is the only view', async () => {
        render(<DataInstallerScreen />);

        await waitFor(() => expect(mockRequest).toHaveBeenCalled());
        expect(screen.queryByRole('button', { name: 'Catalog' })).not.toBeInTheDocument();
    });
});
