/**
 * DatapackCatalogView — the Demo Builder mark on the screen (owner, 2026-11-14; rule 1).
 *
 * The Datapack Library offers Remove Demo Builder Mark on the SC's own Demo Builder datapack, asks in
 * the house confirm window, sends `mark-team-datapack` with `demoBuilder: false`, and reads the catalog and
 * the pack again. A project's Datapacks offers no mark row.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';
import { DatapackCatalogView, INVENTORY_COMPLETE, makeSummary, mockRequest } from './DatapackCatalogView.testUtils';

const OWN_DEMO_BUILDER = makeSummary('bodea', 'main', { displayName: 'Bodea', store: 'library', mine: true, team: true, shared: true });

beforeEach(() => {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'find-datapacks') return Promise.resolve({ success: true, data: { items: [OWN_DEMO_BUILDER], count: 1, engine: 'demo-builder' } });
        if (type === 'get-datapack-detail') return Promise.resolve({ success: true, data: { detail: OWN_DEMO_BUILDER, inventory: INVENTORY_COMPLETE } });
        if (type === 'mark-team-datapack') return Promise.resolve({ success: true, data: { datapackName: 'bodea', demoBuilder: false, versions: 1 } });
        return Promise.resolve({ success: true, data: null });
    });
});

const calls = (type: string) => mockRequest.mock.calls.filter((c) => c[0] === type);

async function openFlyout(library: boolean): Promise<void> {
    render(library ? <DatapackCatalogView library /> : <DatapackCatalogView />);
    await settle();
    await press((await screen.findAllByTestId('datapack-card'))[0]);
    await screen.findByRole('button', { name: 'More actions for Bodea' });
}

it('takes the mark off in the Datapack Library, after asking, then reads the catalog and the pack again', async () => {
    await openFlyout(true);

    await press(screen.getByRole('menuitem', { name: 'Remove Demo Builder Mark' }));
    expect(screen.getByRole('heading', { name: 'Remove the Demo Builder Mark?' })).toBeInTheDocument();
    const findsBefore = calls('find-datapacks').length;
    await press(screen.getByRole('button', { name: 'Remove Mark' }));
    await settle();

    expect(calls('mark-team-datapack').map((c) => c[1])).toEqual([{ datapackName: 'bodea', demoBuilder: false }]);
    await waitFor(() => expect(calls('find-datapacks').length).toBeGreaterThan(findsBefore));
    expect(calls('get-datapack-detail').length).toBeGreaterThan(1);
});

it("offers no mark row in a project's Datapacks", async () => {
    await openFlyout(false);

    expect(screen.queryByRole('menuitem', { name: 'Remove Demo Builder Mark' })).not.toBeInTheDocument();
});
