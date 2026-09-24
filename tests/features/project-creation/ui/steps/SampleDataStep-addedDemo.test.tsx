/**
 * The Sample Data step when an added demo asks for a datapack (D26, D31): the
 * catalog is fetched with the community half, the pack starts selected, and a
 * line says why — or says the pack is not published yet.
 */

import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CATALOG, envelope, mockExecute, renderStep, setMockState } from './SampleDataStep.testUtils';

const demo = (datapack: { name: string; version?: string }) => ({
    kind: 'demo' as const,
    version: 1,
    name: 'Bodea by Steve',
    source: { owner: 'steve', repo: 'bodea-demo' },
    storefrontKind: 'eds' as const,
    datapack,
});

describe('SampleDataStep — a demo that asks for a pack', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExecute.mockResolvedValue(undefined);
        setMockState(envelope(CATALOG));
    });

    it('fetches the catalog with the community half, pre-selects the pack at the asked version, and says why', async () => {
        const { updateState } = renderStep({ demo: demo({ name: 'bodea', version: 'hold' }) });

        expect(mockExecute).toHaveBeenCalledWith({ includeCommunity: true });
        await waitFor(() => expect(updateState).toHaveBeenCalledWith({ datapack: { name: 'bodea', version: 'hold' } }));
        expect(screen.getByTestId('demo-datapack-note')).toHaveTextContent('This demo asks for Bodea.');
    });

    it('falls back to the default version when the asked one is gone, and says so', async () => {
        const { updateState } = renderStep({ demo: demo({ name: 'bodea', version: 'vanished' }) });

        await waitFor(() => expect(updateState).toHaveBeenCalledWith({ datapack: { name: 'bodea', version: 'main' } }));
        expect(screen.getByTestId('demo-datapack-note')).toHaveTextContent(/version vanished is no longer published/);
    });

    it("says the pack is not published when the catalog does not have it, and selects nothing", async () => {
        const { updateState } = renderStep({ demo: demo({ name: 'isle5' }) });

        await screen.findByTestId('demo-datapack-note');
        expect(screen.getByTestId('demo-datapack-note')).toHaveTextContent(/isle5, which isn't published yet/);
        expect(updateState).not.toHaveBeenCalled();
    });

    it('never overrides a choice the SC already made', async () => {
        const { updateState } = renderStep({ demo: demo({ name: 'bodea' }), datapack: { name: 'citisignal_new', version: 'main' } });
        await screen.findByTestId('demo-datapack-note');
        expect(updateState).not.toHaveBeenCalled();
    });

    it('fetches the curated catalog only when no demo asks', () => {
        renderStep({});
        expect(mockExecute).toHaveBeenCalledWith({ includeCommunity: false });
    });
});
