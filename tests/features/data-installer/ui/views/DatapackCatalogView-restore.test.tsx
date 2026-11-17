/**
 * DatapackCatalogView — Restore and Update (Phase 3/5, J4-2; step 03, S8; step-07 U1, J9-1). On the
 * datapack the demo uses, the flyout's main button reads "Restore My Luma" in place of Install, or
 * "Install Newer Version" while a newer version waits. Pressing it opens the job window on that check; the
 * check, its question or summary, its result and its run are the window's, pinned in
 * `DatapackJobWindow-restore.test.tsx` and `DatapackJobWindow-update.test.tsx`. Here: the buttons,
 * and that each reaches its window end to end.
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

const SAVE = makeSummary('my-luma', '20261112-120000', {
    displayName: 'My Luma',
    store: 'library',
    mine: true,
});
/** A newer save of My Luma, made from another demo: Update waits (J9-1). */
const NEWER_SAVE = makeSummary('my-luma', '20261113-090000', { displayName: 'My Luma', store: 'library', mine: true });
let ITEMS: DatapackSummary[] = [SAVE, ...CATALOG];
const HELD: ProjectDatapack = { name: 'my-luma', version: SAVE.id.version, store: 'library' };
const AT = '2026-11-12T12:00:00.000Z';

/** The restore's job, as the status read reports it while it runs. */
const RUNNING: ImportJobRecord = {
    activationId: 'act-restore',
    datapackName: 'my-luma',
    version: SAVE.id.version,
    commerceInstance: 'inst',
    dataTypes: ['products'],
    startedAt: AT,
    outcome: 'watching',
    perType: {},
};

type Answer = { success: boolean; data?: unknown; error?: string; code?: string };

/** The screen's reads, with `restore` answering the check and `confirmed` the confirmed send. */
function store(
    restore: Answer,
    confirmed: Answer = restore,
    installedAt: string | null = AT
): void {
    mockRequest.mockImplementation(
        (
            type: string,
            payload?: { datapackName?: string; version?: string; confirm?: boolean }
        ) => {
            if (type === 'find-datapacks')
                return Promise.resolve({
                    success: true,
                    data: { items: ITEMS, count: ITEMS.length, total: ITEMS.length },
                });
            if (type === 'get-datapack-import-target') {
                return Promise.resolve({
                    success: true,
                    data: { instance: 'inst', projectName: 'acme', datapack: HELD, ...(installedAt ? { installedAt } : {}) },
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
            if (type === 'restore-datapack')
                return Promise.resolve(payload?.confirm ? confirmed : restore);
            if (type === 'update-datapack') return Promise.resolve(payload?.confirm ? confirmed : restore);
            if (type === 'get-datapack-import-status') {
                const started = mockRequest.mock.calls.some(
                    ([sent, body]) => (sent === 'restore-datapack' || sent === 'update-datapack') && (body as { confirm?: boolean } | undefined)?.confirm === true
                );
                return Promise.resolve({ success: true, data: started ? RUNNING : null });
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
const restoreSends = () =>
    mockRequest.mock.calls.filter(([type]) => type === 'restore-datapack').map(([, sent]) => sent);

async function openFlyout(name = 'my-luma'): Promise<void> {
    render(<DatapackCatalogView />);
    await settle();
    await screen.findAllByTestId('datapack-card');
    await press(card(name));
}

const STARTED: Answer = {
    success: true,
    data: { activationId: 'act-restore', target: { name: 'my-luma', version: SAVE.id.version } },
};
/** Restore's check on My Luma with nothing unsaved: its original is the one point (J9-6). */
const QUESTION: Answer = { success: true, data: { asks: true, displayName: 'My Luma', own: { original: '20261103-144000' } } };

// The calls are counted per test: each asserts exactly what it sent.
beforeEach(() => {
    mockRequest.mockClear();
    ITEMS = [SAVE, ...CATALOG];
});

describe('Restore, in the flyout of the datapack the demo uses', () => {
    it('reads "Restore My Luma" in place of Install', async () => {
        store(STARTED);
        await openFlyout();

        expect(
            await inFlyout().findByRole('button', { name: 'Restore My Luma' })
        ).toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    });

    // Decisions J8-1 (owner, 2026-11-12; step-04 S5): over the recorded datapack, another one's
    // button says it switches, and opens the window's switch ("Switch to <Name>?").
    it('another datapack reads "Switch to <Name>", and opens the switch', async () => {
        store(STARTED);
        await openFlyout(CATALOG[0].id.name);

        // The catalog's fixture names it by its id, "bodea".
        await press(await inFlyout().findByRole('button', { name: 'Switch to bodea' }));
        await settle();

        expect(inFlyout().queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: /^Restore/u })).not.toBeInTheDocument();
        expect(await screen.findByRole('heading', { name: /^Switch to bodea/u })).toBeInTheDocument();
    });

    it('CONTROL: another datapack keeps Install when the held one has no install record', async () => {
        store(STARTED, STARTED, null);
        await openFlyout(CATALOG[0].id.name);

        expect(await inFlyout().findByRole('button', { name: 'Install' })).toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: /^Switch to/u })).not.toBeInTheDocument();
    });


    it('CONTROL: keeps Install when Demo Builder did not install it, so there is nothing to take out', async () => {
        store(STARTED, STARTED, null);
        await openFlyout();

        expect(await inFlyout().findByRole('button', { name: 'Install' })).toBeInTheDocument();
    });

    it('asks "Restore My Luma?", and Restore sends it confirmed to its point and opens the run', async () => {
        store(QUESTION, STARTED);
        await openFlyout();

        await press(await inFlyout().findByRole('button', { name: 'Restore My Luma' }));
        await settle();

        expect(await screen.findByRole('heading', { name: 'Restore My Luma?' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Restore' }));
        await settle();

        expect(restoreSends()).toEqual([
            { datapackName: 'my-luma' },
            { datapackName: 'my-luma', confirm: true, to: 'original' },
        ]);
        expect(await screen.findByRole('button', { name: 'Run in Background' })).toBeInTheDocument();
    });

    // J9-1: a newer save waits, so the main button is Update, and it opens Update's check.
    it('a newer version waiting: reads "Install Newer Version", and opens its check', async () => {
        ITEMS = [SAVE, NEWER_SAVE, ...CATALOG];
        store({ success: true, data: { upToDate: true, displayName: 'My Luma' } });
        await openFlyout();

        await press(await inFlyout().findByRole('button', { name: 'Install Newer Version' }));
        await settle();

        expect(inFlyout().queryByRole('button', { name: /^Restore/u })).not.toBeInTheDocument();
        expect(mockRequest.mock.calls.filter(([type]) => type === 'update-datapack').map(([, sent]) => sent)).toEqual([{ datapackName: 'my-luma', records: true }]);
        expect(await screen.findByRole('heading', { name: 'My Luma Is Up to Date' })).toBeInTheDocument();
    });
});
