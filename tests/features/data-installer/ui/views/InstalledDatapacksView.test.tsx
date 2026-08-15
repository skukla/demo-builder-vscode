/**
 * InstalledDatapacksView tests — what the service records as installed, and where.
 *
 * A row list, not a card grid: an installation is a record (pack · instance ·
 * when), and it has no art of its own worth a 16:9 band. `ProjectRowList` is the
 * shape — a plain container plus row components.
 *
 * `commerce_instance` in every real record is an ACCS INSTANCE ID, never a REST
 * URL, so the row shows it verbatim rather than trying to make it a link.
 *
 * Strict TDD: written BEFORE the view exists.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { InstalledDatapacksView } from '@/features/data-installer/ui/views/InstalledDatapacksView';
import type { InstalledDatapack } from '@/features/data-installer/types';

const mockRequest = webviewClient.request as jest.Mock;

function lastRequest(): { type: unknown; payload: unknown } {
    const call = mockRequest.mock.calls[mockRequest.mock.calls.length - 1] ?? [];
    return { type: call[0], payload: call[1] };
}

function makeInstalled(overrides: Partial<InstalledDatapack> = {}): InstalledDatapack {
    return {
        commerceInstance: 'aBcDeFgHiJkLmNoPqRsTu',
        id: { name: 'bodea', version: 'main' },
        displayName: 'Bodea',
        dataTypes: ['categories', 'products'],
        art: {},
        installedAt: '2026-08-06T18:12:13.115Z',
        processingTimeMs: 175000,
        ...overrides,
    };
}

const INSTALLED = [
    makeInstalled(),
    makeInstalled({
        id: { name: 'wknd', version: 'eds-compatible' },
        displayName: 'WKND',
        commerceInstance: 'vWxYz0123456789AbCdEf',
    }),
];

function resolveWith(items: InstalledDatapack[]) {
    mockRequest.mockResolvedValue({
        success: true,
        data: { items, count: items.length, total: items.length },
    });
}

describe('InstalledDatapacksView', () => {
    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('asks the service on mount', async () => {
        resolveWith(INSTALLED);

        render(<InstalledDatapacksView />);

        await waitFor(() => expect(lastRequest().type).toBe('list-installed-datapacks'));
    });

    it('shows the loading display first', () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));

        render(<InstalledDatapacksView />);

        expect(screen.getByText(/loading installed/i)).toBeInTheDocument();
    });

    it('renders a row per installation', async () => {
        resolveWith(INSTALLED);

        render(<InstalledDatapacksView />);

        await waitFor(() => expect(screen.getAllByTestId('installed-row')).toHaveLength(2));
    });

    it('shows the pack, its version, and the instance it went into', async () => {
        resolveWith(INSTALLED);

        render(<InstalledDatapacksView />);
        const rows = await screen.findAllByTestId('installed-row');

        expect(rows[0]).toHaveTextContent('Bodea');
        expect(rows[0]).toHaveTextContent('main');
        // The instance id verbatim — it is an ACCS id, never a URL.
        expect(rows[0]).toHaveTextContent('aBcDeFgHiJkLmNoPqRsTu');
    });

    it('falls back to the pack name when a record carries no display name', async () => {
        resolveWith([makeInstalled({ displayName: undefined })]);

        render(<InstalledDatapacksView />);
        const rows = await screen.findAllByTestId('installed-row');

        expect(rows[0]).toHaveTextContent('bodea');
    });

    describe('search', () => {
        it('filters by pack name', async () => {
            resolveWith(INSTALLED);

            render(<InstalledDatapacksView />);
            await screen.findAllByTestId('installed-row');

            fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'wknd' } });

            expect(screen.getAllByTestId('installed-row')).toHaveLength(1);
        });

        it('filters by the instance it was installed into', async () => {
            resolveWith(INSTALLED);

            render(<InstalledDatapacksView />);
            await screen.findAllByTestId('installed-row');

            fireEvent.change(screen.getByRole('searchbox'), {
                target: { value: 'vWxYz0123456789AbCdEf' },
            });

            expect(screen.getAllByTestId('installed-row')).toHaveLength(1);
        });

        it('says so when nothing matches', async () => {
            resolveWith(INSTALLED);

            render(<InstalledDatapacksView />);
            await screen.findAllByTestId('installed-row');

            fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nope' } });

            expect(screen.queryAllByTestId('installed-row')).toHaveLength(0);
            expect(screen.getByText(/no installations match/i)).toBeInTheDocument();
        });
    });

    describe('states', () => {
        it('shows an empty state when nothing is installed', async () => {
            resolveWith([]);

            render(<InstalledDatapacksView />);

            expect(await screen.findByText('No installations recorded')).toBeInTheDocument();
        });

        it('offers sign-in — never Retry — for a returned AUTH_REQUIRED refusal', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                error: 'Adobe sign-in is required.',
                code: 'AUTH_REQUIRED',
            });

            render(<InstalledDatapacksView />);

            expect(await screen.findByText('Adobe sign-in required')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
        });

        it('retries a transport failure', async () => {
            mockRequest.mockRejectedValueOnce(new Error('Request timeout'));
            resolveWith(INSTALLED);

            render(<InstalledDatapacksView />);
            fireEvent.click(await screen.findByRole('button', { name: /try again/i }));

            await waitFor(() => expect(screen.getAllByTestId('installed-row')).toHaveLength(2));
        });
    });
});
