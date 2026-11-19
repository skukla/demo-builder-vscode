/**
 * WHICH ENGINE RAN IT (datapack step 14, item 17).
 *
 * The log holds Demo Builder's engine's runs as well as the service's, so each row says which,
 * a run of ours that failed says so and why, and a source that could not be read says why its
 * rows are missing instead of the feed quietly showing less.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { makeEntry, mockRequest, resolveWith, resolveWithPage } from './DatapackActivityView.testUtils';

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { DatapackActivityView } from '@/features/data-installer/ui/views/DatapackActivityView';
import { plain } from '@/core/utils/plainText';

describe('DatapackActivityView sources', () => {
    beforeEach(() => {
        // Real timers: the view chains two requests (see the main suite).
        jest.useRealTimers();
        mockRequest.mockReset();
    });

    it('says on each row which engine ran it', async () => {
        resolveWith([makeEntry({ source: 'demo-builder', outcome: 'success' }), makeEntry({ source: 'service' })]);

        render(<DatapackActivityView />);
        const rows = await screen.findAllByTestId('activity-row');

        expect(rows[0]).toHaveTextContent('Demo Builder');
        expect(rows[1]).toHaveTextContent('Data Installer');
    });

    it('says a run of Demo Builder\'s failed, and why, in plain words (walk F221)', async () => {
        resolveWith([makeEntry({ source: 'demo-builder', mode: 'delete', outcome: 'failed', detail: 'Commerce answered 500 for categories/40' })]);

        render(<DatapackActivityView />);
        const [row] = await screen.findAllByTestId('activity-row');

        expect(row).toHaveTextContent('Failed');
        // An entry from before walk F221 has no plain words of its own: the raw detail is translated.
        expect(row).toHaveTextContent('Commerce ran into a problem.');
        expect(row).not.toHaveTextContent('categories/40');
    });

    it('draws the plain words an entry keeps, never its raw detail', async () => {
        resolveWith([
            makeEntry({
                source: 'demo-builder',
                outcome: 'success',
                detail: 'Skipped 1 row, and installed the rest: products p2 (Invalid SKU).',
                shown: plain("Product p2 wasn't added: Commerce didn't accept its SKU."),
            }),
        ]);

        render(<DatapackActivityView />);
        const [row] = await screen.findAllByTestId('activity-row');

        expect(row).toHaveTextContent("Product p2 wasn't added: Commerce didn't accept its SKU.");
        expect(row).not.toHaveTextContent('products p2');
    });

    it('does not call a run that worked failed', async () => {
        resolveWith([makeEntry({ source: 'demo-builder', outcome: 'success', detail: 'Kept the category Sale.' })]);

        render(<DatapackActivityView />);
        const [row] = await screen.findAllByTestId('activity-row');

        expect(row).not.toHaveTextContent(/failed/i);
        expect(row).toHaveTextContent('Kept the category Sale.');
    });

    it("shows Demo Builder's runs and says why the service's are missing when it could not be read", async () => {
        resolveWithPage({
            items: [makeEntry({ source: 'demo-builder' })],
            count: 1,
            total: 1,
            serviceError: 'The Data Installer is turned off.',
        });

        render(<DatapackActivityView />);

        await waitFor(() => expect(screen.getAllByTestId('activity-row')).toHaveLength(1));
        expect(screen.getByText(/Couldn't read the Data Installer's activity: The Data Installer is turned off\./)).toBeInTheDocument();
    });

    it("says when Demo Builder's own records could not be read", async () => {
        resolveWithPage({
            items: [makeEntry({ source: 'service' })],
            count: 1,
            total: 1,
            engineError: "Demo Builder's own records could not be read: bad file",
        });

        render(<DatapackActivityView />);

        expect(await screen.findByText("Demo Builder's own records could not be read: bad file")).toBeInTheDocument();
    });
});
