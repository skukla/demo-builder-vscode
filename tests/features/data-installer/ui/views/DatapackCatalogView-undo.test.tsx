/**
 * DatapackCatalogView — Undo Last Save (Phase 2, owner 2026-11-12: "Undo Last Save?", then Commerce
 * goes back through the same run window). The flyout of the datapack the demo uses offers it when the
 * demo is on the newest of the SC's two saves; once the undo is accepted, the import window opens on
 * the earlier save and picks the running job up.
 */

import { render, screen, within } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';
import {
    CATALOG,
    DatapackCatalogView,
    INVENTORY_COMPLETE,
    makeSummary,
    mockRequest,
} from './DatapackCatalogView.testUtils';
import type { DatapackSummary, ImportJobRecord } from '@/features/data-installer/types';
import type { ProjectDatapack } from '@/types/datapack';

const PREVIOUS = makeSummary('my-luma', '20261111-090000', {
    displayName: 'My Luma',
    store: 'library',
    mine: true,
});
const NEWEST = makeSummary('my-luma', '20261112-120000', {
    displayName: 'My Luma',
    store: 'library',
    mine: true,
});
const ITEMS: DatapackSummary[] = [PREVIOUS, NEWEST, ...CATALOG];
const ON_NEWEST: ProjectDatapack = {
    name: 'my-luma',
    version: NEWEST.id.version,
    store: 'library',
};
const AT = '2026-11-12T12:00:00.000Z';

/** The undo's job, as the status read reports it while it runs. */
const RUNNING: ImportJobRecord = {
    activationId: 'act-undo',
    datapackName: 'my-luma',
    version: PREVIOUS.id.version,
    commerceInstance: 'inst',
    dataTypes: ['products'],
    startedAt: AT,
    outcome: 'watching',
    perType: {},
};

function store(
    held: ProjectDatapack,
    undo: { success: boolean; data?: unknown; error?: string }
): void {
    mockRequest.mockImplementation(
        (type: string, payload?: { datapackName?: string; version?: string }) => {
            if (type === 'find-datapacks')
                return Promise.resolve({
                    success: true,
                    data: { items: ITEMS, count: ITEMS.length, total: ITEMS.length },
                });
            if (type === 'get-datapack-import-target') {
                return Promise.resolve({
                    success: true,
                    data: {
                        instance: 'inst',
                        projectName: 'acme',
                        datapack: held,
                        installedAt: AT,
                    },
                });
            }
            if (type === 'get-datapack-detail') {
                const detail =
                    ITEMS.find(
                        (item) =>
                            item.id.name === payload?.datapackName &&
                            item.id.version === payload.version
                    ) ?? ITEMS[0];
                return Promise.resolve({
                    success: true,
                    data: { detail, inventory: INVENTORY_COMPLETE },
                });
            }
            if (type === 'undo-last-save') return Promise.resolve(undo);
            if (type === 'get-datapack-import-status') {
                const undone = mockRequest.mock.calls.some(([sent]) => sent === 'undo-last-save');
                return Promise.resolve({ success: true, data: undone ? RUNNING : null });
            }
            return Promise.resolve({ success: true, data: null });
        }
    );
}

const card = (name: string) =>
    screen
        .getAllByTestId('datapack-card')
        .find((each) => each.getAttribute('data-datapack') === name) as HTMLElement;
const inFlyout = () => within(screen.getByRole('dialog', { name: / details$/ }));

async function openUndo(): Promise<void> {
    render(<DatapackCatalogView />);
    await settle();
    await screen.findAllByTestId('datapack-card');
    await press(card('my-luma'));
    await press(await inFlyout().findByRole('button', { name: 'More actions for My Luma' }));
}

describe('Undo Last Save, in the flyout', () => {
    it('opens the run on the earlier save once the undo is accepted, watching the running job', async () => {
        store(ON_NEWEST, { success: true, data: { activationId: 'act-undo' } });
        await openUndo();

        await press(screen.getByRole('menuitem', { name: 'Undo Last Save' }));
        await press(screen.getByRole('button', { name: 'Undo' }));
        await settle();

        const sent = mockRequest.mock.calls.find(([type]) => type === 'undo-last-save');
        expect(sent?.[1]).toEqual({ datapackName: 'my-luma', confirm: true });
        // The window watches the job: no form to fill, and closing it leaves the run going.
        expect(
            await screen.findByRole('button', { name: 'Run in Background' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'Products' })).not.toBeInTheDocument();
    });

    it('CONTROL: is not offered when the demo is on the earlier save', async () => {
        store({ ...ON_NEWEST, version: PREVIOUS.id.version }, { success: true });
        await openUndo();

        expect(screen.getAllByRole('menuitem').map((row) => row.textContent)).not.toContain(
            'Undo Last Save'
        );
    });

    it('CONTROL: opens no window when the undo is refused', async () => {
        store(ON_NEWEST, { success: false, error: 'There is no earlier save to go back to.' });
        await openUndo();

        await press(screen.getByRole('menuitem', { name: 'Undo Last Save' }));
        await press(screen.getByRole('button', { name: 'Undo' }));
        await settle();

        expect(
            inFlyout().getByText(/There is no earlier save to go back to\./u)
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Run in Background' })).not.toBeInTheDocument();
    });
});
