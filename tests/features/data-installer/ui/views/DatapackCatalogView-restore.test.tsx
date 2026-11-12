/**
 * DatapackCatalogView — Restore (Phase 3/5, owner 2026-11-12, J4-2 to J4-4). On the datapack the demo
 * uses, the flyout's main button reads "Restore My Luma" in place of Install. Pressing it sends the
 * check (`restore-datapack` without confirm) and the flyout waits. Then:
 * - up to date: the small result "My Luma Is Up to Date", nothing started;
 * - unsaved edits: "Restore My Luma?" (Cancel / Restore, blue), and Restore sends it confirmed;
 * - started (a newer save, or after the confirm): the import window opens on the version restored,
 *   watching the running job.
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
import { ErrorCode } from '@/types/errorCodes';

const SAVE = makeSummary('my-luma', '20261112-120000', {
    displayName: 'My Luma',
    store: 'library',
    mine: true,
});
const ITEMS: DatapackSummary[] = [SAVE, ...CATALOG];
const HELD: ProjectDatapack = { name: 'my-luma', version: SAVE.id.version, store: 'library' };
const AT = '2026-11-12T12:00:00.000Z';
const ASKS =
    'Commerce goes back to My Luma as you last saved it. Anything you changed since is lost.';

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
            if (type === 'get-datapack-import-status') {
                const started = mockRequest.mock.calls.some(
                    ([sent]) => sent === 'restore-datapack'
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
const EDITS: Answer = {
    success: false,
    code: ErrorCode.CHANGES_NEED_ANSWER,
    error: `${ASKS} Send confirm:true to proceed.`,
    data: { asks: true, displayName: 'My Luma' },
};

// The calls are counted per test: each asserts exactly what it sent.
beforeEach(() => mockRequest.mockClear());

describe('Restore, in the flyout of the datapack the demo uses', () => {
    it('reads "Restore My Luma" in place of Install', async () => {
        store(STARTED);
        await openFlyout();

        expect(
            await inFlyout().findByRole('button', { name: 'Restore My Luma' })
        ).toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    });

    it('CONTROL: another datapack keeps Install', async () => {
        store(STARTED);
        await openFlyout(CATALOG[0].id.name);

        expect(await inFlyout().findByRole('button', { name: 'Install' })).toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: /^Restore/u })).not.toBeInTheDocument();
    });

    it('CONTROL: keeps Install when Demo Builder did not install it, so there is nothing to take out', async () => {
        store(STARTED, STARTED, null);
        await openFlyout();

        expect(await inFlyout().findByRole('button', { name: 'Install' })).toBeInTheDocument();
    });

    it('up to date: says so in a small result and starts nothing', async () => {
        store({ success: true, data: { upToDate: true, displayName: 'My Luma' } });
        await openFlyout();

        await press(await inFlyout().findByRole('button', { name: 'Restore My Luma' }));
        await settle();

        expect(restoreSends()).toEqual([{ datapackName: 'my-luma' }]);
        expect(
            await screen.findByRole('heading', { name: 'My Luma Is Up to Date' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Run in Background' })).not.toBeInTheDocument();
    });

    it('unsaved edits: asks "Restore My Luma?", and Restore sends it confirmed and opens the run', async () => {
        store(EDITS, STARTED);
        await openFlyout();

        await press(await inFlyout().findByRole('button', { name: 'Restore My Luma' }));
        await settle();

        expect(
            await screen.findByRole('heading', { name: 'Restore My Luma?' })
        ).toBeInTheDocument();
        expect(screen.getByText(ASKS)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Restore' }));
        await settle();

        expect(restoreSends()).toEqual([
            { datapackName: 'my-luma' },
            { datapackName: 'my-luma', confirm: true },
        ]);
        expect(
            await screen.findByRole('button', { name: 'Run in Background' })
        ).toBeInTheDocument();
    });

    it('CONTROL: Cancel sends nothing more and opens no run', async () => {
        store(EDITS, STARTED);
        await openFlyout();

        await press(await inFlyout().findByRole('button', { name: 'Restore My Luma' }));
        await settle();
        await press(await screen.findByRole('button', { name: 'Cancel' }));
        await settle();

        expect(restoreSends()).toEqual([{ datapackName: 'my-luma' }]);
        expect(screen.queryByRole('button', { name: 'Run in Background' })).not.toBeInTheDocument();
    });

    it('only a newer save: the check starts it, and the run opens with no question', async () => {
        store(STARTED);
        await openFlyout();

        await press(await inFlyout().findByRole('button', { name: 'Restore My Luma' }));
        await settle();

        expect(screen.queryByRole('heading', { name: 'Restore My Luma?' })).not.toBeInTheDocument();
        expect(
            await screen.findByRole('button', { name: 'Run in Background' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'Products' })).not.toBeInTheDocument();
    });

    it('a refusal shows under the actions, and no run opens', async () => {
        store({
            success: false,
            error: 'Demo Builder has no record of installing this datapack.',
            code: ErrorCode.INVALID_OPERATION,
        });
        await openFlyout();

        await press(await inFlyout().findByRole('button', { name: 'Restore My Luma' }));
        await settle();

        expect(inFlyout().getByText(/no record of installing this datapack/u)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Run in Background' })).not.toBeInTheDocument();
    });
});
