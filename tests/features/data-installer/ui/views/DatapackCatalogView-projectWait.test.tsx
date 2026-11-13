/**
 * DatapackCatalogView: what waits for the project's first answer. The flyout (owner, 2026-11-09,
 * walk F92): its buttons hang on what the project holds, and one appeared a moment after the
 * others. The header's save button (step-04 S1): its words never change on screen, so it waits with
 * none. The Datapack Library reads no project, so nothing there waits for one.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { press, settle } from '../../../../helpers/reactSettle';
import {
    CATALOG,
    DatapackCatalogView,
    INVENTORY_COMPLETE,
    mockRequest,
} from './DatapackCatalogView.testUtils';

/** The catalog and the detail answer; the project read never does. */
function projectNeverAnswers(): void {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'find-datapacks') {
            return Promise.resolve({
                success: true,
                data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length },
            });
        }
        if (type === 'get-datapack-detail') {
            return Promise.resolve({
                success: true,
                data: {
                    detail: { ...CATALOG[0], description: 'B2B office supplies' },
                    inventory: INVENTORY_COMPLETE,
                },
            });
        }
        if (type === 'get-datapack-import-target') return new Promise(() => undefined);
        return Promise.resolve({ success: true, data: null });
    });
}

async function renderView(library: boolean): Promise<void> {
    render(<DatapackCatalogView library={library} />);
    await settle();
}

async function openFirstCard(library: boolean): Promise<void> {
    await renderView(library);
    const cards = await screen.findAllByTestId('datapack-card');
    await press(cards[0]);
    await settle();
}

beforeEach(() => {
    mockRequest.mockReset();
    projectNeverAnswers();
});

it("waits in a project's Datapacks until the project has answered", async () => {
    await openFirstCard(false);

    expect(screen.queryByText('B2B office supplies')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^install$/i })).not.toBeInTheDocument();
});

it('never waits for a project in the Datapack Library', async () => {
    await openFirstCard(true);

    expect(await screen.findByText('B2B office supplies')).toBeInTheDocument();
});

const SAVE_WORDS = /^(Create|Save|Save As New)$/;

it("draws the header's save button waiting, with no words, until the project has answered", async () => {
    await renderView(false);
    await screen.findAllByTestId('datapack-card');

    expect(screen.getByRole('button', { name: 'Loading' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: SAVE_WORDS })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install from File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear Demo Data' })).toBeInTheDocument();
});

it('offers Add from File alone in the Datapack Library', async () => {
    await renderView(true);
    await screen.findAllByTestId('datapack-card');

    expect(screen.getByRole('button', { name: 'Add from File' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SAVE_WORDS })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Loading' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install from File' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear Demo Data' })).not.toBeInTheDocument();
});
