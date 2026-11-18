/**
 * DatapackCatalogView — no screen marks a datapack as Demo Builder's (owner, 2026-11-18, walk F226,
 * replacing 2026-11-14). The mark is the datapack maintainer's job, so an SC does not see it; the store also
 * refuses anyone not on its list of Demo Builder datapack owners. Neither the Datapack
 * Library nor a project's Datapacks offers a mark row, on an own Demo Builder pack or an own other pack.
 */

import { render, screen, within } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';
import { DatapackCatalogView, INVENTORY_COMPLETE, makeSummary, mockRequest } from './DatapackCatalogView.testUtils';

const OWN_DEMO_BUILDER = makeSummary('bodea', 'main', { displayName: 'Bodea', store: 'library', mine: true, team: true, shared: true });
const OWN_OTHER = makeSummary('acme', '20261101-090000', { displayName: 'Acme', store: 'library', mine: true });

function answer(pack: typeof OWN_DEMO_BUILDER): void {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'find-datapacks') return Promise.resolve({ success: true, data: { items: [pack], count: 1, engine: 'demo-builder' } });
        if (type === 'get-datapack-detail') return Promise.resolve({ success: true, data: { detail: pack, inventory: INVENTORY_COMPLETE } });
        return Promise.resolve({ success: true, data: null });
    });
}

async function openFlyout(library: boolean): Promise<HTMLElement> {
    render(library ? <DatapackCatalogView library /> : <DatapackCatalogView />);
    await settle();
    await press((await screen.findAllByTestId('datapack-card'))[0]);
    return screen.findByRole('region', { name: 'Actions' });
}

const MARK_ROWS = /Demo Builder (Mark|Datapack)/u;

it.each([
    ['the Datapack Library, an own Demo Builder pack', true, OWN_DEMO_BUILDER],
    ['the Datapack Library, an own other pack', true, OWN_OTHER],
    ["a project's Datapacks", false, OWN_DEMO_BUILDER],
])('offers no mark row in %s', async (_where, library, pack) => {
    answer(pack);
    const actions = await openFlyout(library);

    expect(within(actions).getByRole('button', { name: 'Save as File' })).toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: MARK_ROWS })).not.toBeInTheDocument();
    expect(mockRequest.mock.calls.some((call) => call[0] === 'mark-team-datapack')).toBe(false);
});
