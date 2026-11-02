/**
 * The catalog and settings layers (datapack-engine step 09): a pack named as a layer is not a card
 * of its own while its pack is listed, and keeps one when hiding it would strand it.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { settle } from '../../../../helpers/reactSettle';
import { libraryRow } from '../../../../helpers/settingsLayerFixtures';
import { DatapackCatalogView, mockRequest } from './DatapackCatalogView.testUtils';
import '@testing-library/jest-dom';

const BODEA = { ...libraryRow('bodea', 'main', { displayName: 'Bodea', dataTypes: ['products'], shared: true }), store: undefined };

function catalogOf(items: unknown[], datapack?: { name: string; version: string }) {
    mockRequest.mockReset();
    mockRequest.mockImplementation((type: string) => {
        if (type === 'find-datapacks') return Promise.resolve({ success: true, data: { items, count: items.length } });
        if (type === 'get-datapack-import-target') return Promise.resolve({ success: true, data: { projectName: 'demo-1', ...(datapack ? { datapack } : {}) } });
        return Promise.resolve({ success: true, data: null });
    });
}

async function shown() {
    render(<DatapackCatalogView />);
    await settle();
    return screen.getAllByTestId('datapack-card').map((card) => card.textContent ?? '');
}

const showing = (cards: string[], name: string) => cards.some((text) => text.includes(name));

it('offers no card for a layer while its pack is listed', async () => {
    catalogOf([BODEA, libraryRow('bodea-settings', 'v1', { displayName: 'Bodea settings' })]);

    const cards = await shown();

    expect(cards).toHaveLength(1);
    expect(showing(cards, 'Bodea settings')).toBe(false);
});

it('keeps the card of a layer whose pack is not listed: nothing else reaches it', async () => {
    catalogOf([BODEA, libraryRow('gone-settings', 'v1', { displayName: 'Gone settings' })]);

    expect(showing(await shown(), 'Gone settings')).toBe(true);
});

it('keeps the card of a layer the project has installed on its own: that is where it is removed', async () => {
    catalogOf([BODEA, libraryRow('bodea-settings', 'v1', { displayName: 'Bodea settings' })], { name: 'bodea-settings', version: 'v1' });

    expect(showing(await shown(), 'Bodea settings')).toBe(true);
});
