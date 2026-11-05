/**
 * The Datapacks step and a pack the project arrived with (datapack-engine step 07, and the
 * research on project export/import/copy, 2026-10-29): it is shown as chosen when the catalog
 * lists it, the library is listed when it is a library pack, and when it cannot be read the
 * step says what creation will install instead, for an imported file as well as an added demo.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    CATALOG,
    answerFor,
    cardFor,
    envelope,
    mockExecute,
    renderStep,
    resetDataInstallerMocks,
    setMockState,
} from './SampleDataStep.testUtils';
import type { RecordedPackCheck } from '@/types/datapack';

const OWN = { name: 'acme-demo-1a2b3c', version: '20261029-183000', store: 'library' as const, origin: { name: 'bodea', version: 'main' } };

const LIBRARY_ROW = {
    id: { name: OWN.name, version: OWN.version },
    displayName: 'Acme Demo',
    shared: false,
    mine: true,
    dataTypes: [],
    art: {},
    store: 'library' as const,
};

beforeEach(() => resetDataInstallerMocks());

describe('SampleDataStep — no line about an automatic pack', () => {
    // There is no pack made for a demo without being asked any more (owner, 2026-11-03).
    it('says nothing about where changes go', async () => {
        renderStep({});

        await screen.findByRole('searchbox', { name: /filter datapacks/i });
        expect(screen.queryByText(/own pack/)).not.toBeInTheDocument();
    });
});

describe('SampleDataStep — a pack the project arrived with', () => {
    it("lists a colleague's packs too when the project arrived with one, and shows it chosen", async () => {
        setMockState(envelope({ ...CATALOG, items: [...CATALOG.items, LIBRARY_ROW] }));
        const check = answerFor('check-recorded-datapack', envelope(null));

        renderStep({ datapack: OWN });

        expect(mockExecute).toHaveBeenCalledWith({ includeCommunity: true });
        await waitFor(() => expect(cardFor('Acme Demo')).toHaveAttribute('aria-checked', 'true'));
        expect(cardFor('Bodea')).toHaveAttribute('aria-checked', 'false');
        // Listed, so nothing to ask.
        expect(check).not.toHaveBeenCalled();
    });

    // The one list shows a pack once, whichever store holds it, so the card is matched by name.
    it('shows the card chosen by name, whichever store the project recorded', async () => {
        renderStep({ datapack: { name: 'bodea', version: 'main', store: 'library' } });

        await waitFor(() => expect(cardFor('Bodea')).toHaveAttribute('aria-checked', 'true'));
    });

    it("says what creation will install when the pack can't be read, and offers it", async () => {
        const fallback: RecordedPackCheck = {
            verdict: 'fallback',
            pack: { name: 'bodea', version: 'main', store: 'installer' },
            displayName: 'Bodea',
            note: "The acme-demo-1a2b3c pack this project uses can't be read: its owner has deleted it or not shared it. You can continue with Bodea, the pack it was made from; their changes won't be included.",
        };
        const check = answerFor('check-recorded-datapack', envelope(fallback));
        const { updateState } = renderStep({ datapack: OWN });

        const notice = await screen.findByTestId('recorded-datapack-notice');
        expect(check).toHaveBeenCalledWith({ datapack: OWN });
        expect(notice).toHaveTextContent(/can't be read: its owner has deleted it or not shared it/);

        fireEvent.click(screen.getByRole('button', { name: 'Continue with Bodea' }));
        expect(updateState).toHaveBeenCalledWith({ datapack: { name: 'bodea', version: 'main', store: 'installer' } });
    });

    it('says the project will be created without sample data when nothing can be read', async () => {
        answerFor('check-recorded-datapack', envelope({ verdict: 'none', note: 'This project will be created without sample data.' }));

        renderStep({ datapack: { name: 'gone', version: '1', store: 'installer' } });

        expect(await screen.findByTestId('recorded-datapack-notice')).toHaveTextContent('This project will be created without sample data.');
        expect(screen.queryByRole('button', { name: /Continue with/ })).not.toBeInTheDocument();
    });

    it('says nothing when the store could not be asked', async () => {
        answerFor('check-recorded-datapack', envelope({ verdict: 'unknown' }));

        renderStep({ datapack: OWN });

        await screen.findByRole('searchbox', { name: /filter datapacks/i });
        expect(screen.queryByTestId('recorded-datapack-notice')).not.toBeInTheDocument();
    });

    it('asks nothing about a recorded pack for a project that arrived with no pack', () => {
        const check = answerFor('check-recorded-datapack', envelope(null));

        renderStep({});

        expect(mockExecute).toHaveBeenCalledWith({ includeCommunity: true });
        expect(check).not.toHaveBeenCalled();
    });
});
