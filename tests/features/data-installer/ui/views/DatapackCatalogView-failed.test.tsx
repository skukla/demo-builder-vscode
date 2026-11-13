/**
 * DatapackCatalogView — a failed install of the demo's datapack (step-04 S8; decisions J6-1 to J6-3,
 * the prototype's J6). The card shows the error dot and "Install failed", with no check and no
 * accent border; the flyout shows the same label under its title with the reason under it, and Retry,
 * which starts the install and opens the run; once retries have not helped, Fix with AI. When a
 * Retry works, the project's record clears (S7) and the screen reads it again as the window closes.
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
import type { DatapackInstallFailed, ProjectDatapack } from '@/types/datapack';

const MY_LUMA = makeSummary('my-luma', '20261112-120000', { displayName: 'My Luma', store: 'library', mine: true });
const ITEMS: DatapackSummary[] = [MY_LUMA, ...CATALOG];
const HELD: ProjectDatapack = { name: 'my-luma', version: MY_LUMA.id.version, store: 'library' };
const REASON = "Commerce didn't answer in time";
const AT = '2026-11-12T12:00:00.000Z';

/** The retry's job, as the status read reports it while it runs. */
const RUNNING: ImportJobRecord = {
    activationId: 'act-retry',
    datapackName: 'my-luma',
    version: MY_LUMA.id.version,
    commerceInstance: 'inst',
    dataTypes: ['products'],
    startedAt: AT,
    outcome: 'watching',
    perType: {},
};

/** The project and the store; `failure.current` is what the project read reports, read each time. */
function store(failure: { current: DatapackInstallFailed | undefined }): void {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'find-datapacks') return Promise.resolve({ success: true, data: { items: ITEMS, count: ITEMS.length, total: ITEMS.length } });
        if (type === 'get-datapack-import-target') {
            const installFailed = failure.current;
            return Promise.resolve({ success: true, data: { instance: 'inst', projectName: 'acme', datapack: HELD, ...(installFailed ? { installFailed } : {}) } });
        }
        if (type === 'get-datapack-detail') return Promise.resolve({ success: true, data: { detail: MY_LUMA, inventory: INVENTORY_COMPLETE } });
        if (type === 'start-datapack-import') return Promise.resolve({ success: true, data: { activationId: 'act-retry' } });
        if (type === 'get-datapack-import-status') {
            const started = mockRequest.mock.calls.some(([sent]) => sent === 'start-datapack-import');
            return Promise.resolve({ success: true, data: started ? RUNNING : null });
        }
        return Promise.resolve({ success: true, data: null });
    });
}

const card = (name: string) =>
    screen.getAllByTestId('datapack-card').find((each) => each.getAttribute('data-datapack') === name) as HTMLElement;
const inFlyout = () => within(screen.getByRole('dialog', { name: / details$/ }));

async function openScreen(): Promise<void> {
    render(<DatapackCatalogView />);
    await settle();
    await screen.findAllByTestId('datapack-card');
}

async function openFlyout(): Promise<void> {
    await openScreen();
    await press(card('my-luma'));
    await settle();
}

describe('the card of a failed install', () => {
    it('shows the error dot and "Install failed", with no check and no accent border', async () => {
        store({ current: { reason: REASON, retries: 0 } });
        await openScreen();

        const failed = card('my-luma');
        expect(within(failed).getByText('Install failed')).toHaveClass('integration-card-status--error');
        expect(within(failed).queryByTestId('datapack-card-project-check')).not.toBeInTheDocument();
        expect(failed).not.toHaveClass('is-selected');
    });

    it('CONTROL: the held card wears the check and the border when nothing failed', async () => {
        store({ current: undefined });
        await openScreen();

        expect(within(card('my-luma')).getByTestId('datapack-card-project-check')).toBeInTheDocument();
        expect(within(card('my-luma')).queryByText('Install failed')).not.toBeInTheDocument();
        expect(card('my-luma')).toHaveClass('is-selected');
    });
});

describe('the flyout of a failed install', () => {
    it('shows the label and the reason under the title, and Retry as its main button', async () => {
        store({ current: { reason: REASON, retries: 0 } });
        await openFlyout();

        expect(inFlyout().getByText('Install failed')).toBeInTheDocument();
        expect(inFlyout().getByText(REASON)).toBeInTheDocument();
        expect(await inFlyout().findByRole('button', { name: 'Retry' })).toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    });

    it('Retry starts the install to the project’s instance and opens the run, watching the job', async () => {
        store({ current: { reason: REASON, retries: 0 } });
        await openFlyout();

        await press(await inFlyout().findByRole('button', { name: 'Retry' }));
        await settle();

        const sent = mockRequest.mock.calls.find(([type]) => type === 'start-datapack-import');
        expect(sent?.[1]).toEqual({
            datapackName: 'my-luma',
            version: MY_LUMA.id.version,
            source: 'library',
            commerceInstance: 'inst',
            dataTypes: ['products'],
        });
        expect(await screen.findByRole('button', { name: 'Run in Background' })).toBeInTheDocument();
    });

    it('reads the project again as the run closes: a Retry that worked returns the card to installed', async () => {
        const failure: { current: DatapackInstallFailed | undefined } = { current: { reason: REASON, retries: 0 } };
        store(failure);
        await openFlyout();
        await press(await inFlyout().findByRole('button', { name: 'Retry' }));
        await settle();

        failure.current = undefined;
        await press(await screen.findByRole('button', { name: 'Run in Background' }));
        await settle();

        expect(within(card('my-luma')).queryByText('Install failed')).not.toBeInTheDocument();
        expect(within(card('my-luma')).getByTestId('datapack-card-project-check')).toBeInTheDocument();
    });

    it('offers Fix with AI in Retry’s place once two retries have not helped', async () => {
        store({ current: { reason: REASON, retries: 2 } });
        await openFlyout();

        await press(await inFlyout().findByRole('button', { name: 'Fix with AI' }));

        expect(inFlyout().queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        expect(mockRequest.mock.calls.find(([type]) => type === 'fix-datapack-import-with-ai')?.[1]).toEqual({ from: 'install-failed' });
    });
});
