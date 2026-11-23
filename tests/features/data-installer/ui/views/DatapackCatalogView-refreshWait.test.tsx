/**
 * A pressed Refresh waits where the answer lands (owner, 2026-11-17, walk F214): the grid gives way
 * to the first load's spinner and words, the search row stays, and the refresh button stops taking
 * presses without a spinner of its own (one spinner per wait). A list re-read nobody pressed (a pack
 * installed or renamed elsewhere) keeps the cards where they are.
 */

import { act, render, screen, within } from '@testing-library/react';

import { mockPostMessage, webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

import {
    DatapackCatalogView,
    mockRequest,
    resolveWith,
    CATALOG,
} from './DatapackCatalogView.testUtils';
import { DATAPACK_LIST_CHANGED_MESSAGE } from '@/features/data-installer/types';

const ANSWER = {
    success: true,
    data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length },
};

/** The next catalog request waits until the returned function answers it. */
function holdNextCatalog(): () => Promise<void> {
    let answer: (value: unknown) => void = () => undefined;
    mockRequest.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    return async () => {
        await act(async () => answer(ANSWER));
        await settle();
    };
}

async function opened(): Promise<void> {
    resolveWith(CATALOG);
    render(<DatapackCatalogView />);
    await settle();
    await screen.findAllByTestId('datapack-card');
}

const refreshButton = () => screen.getByRole('button', { name: /refresh datapacks/i });

beforeEach(() => {
    mockRequest.mockReset();
    mockPostMessage.mockReset();
});

describe('a pressed Refresh', () => {
    it('swaps the grid for the first load spinner, keeping the search row', async () => {
        await opened();
        const answer = holdNextCatalog();

        await press(refreshButton());

        expect(screen.queryAllByTestId('datapack-card')).toHaveLength(0);
        expect(screen.getByText('Loading datapacks')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Filter datapacks')).toBeInTheDocument();
        await answer();
        expect(await screen.findAllByTestId('datapack-card')).not.toHaveLength(0);
        expect(screen.queryByText('Loading datapacks')).toBeNull();
    });

    it('stops the button taking presses, with no spinner of its own', async () => {
        await opened();
        const answer = holdNextCatalog();

        await press(refreshButton());

        expect(refreshButton()).toBeDisabled();
        expect(within(refreshButton()).queryByRole('progressbar')).toBeNull();
        expect(screen.getAllByRole('progressbar')).toHaveLength(1);
        await answer();
        expect(refreshButton()).toBeEnabled();
    });
});

describe('a re-read nobody pressed', () => {
    it('keeps the cards in place while it is out', async () => {
        await opened();
        const answer = holdNextCatalog();

        await act(async () => webviewClientHandlers.get(DATAPACK_LIST_CHANGED_MESSAGE)?.({}));

        expect(screen.queryAllByTestId('datapack-card')).not.toHaveLength(0);
        expect(screen.queryByText('Loading datapacks')).toBeNull();
        await answer();
    });
});
