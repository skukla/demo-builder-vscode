/**
 * The pack flyout's Rename (datapack-engine step 07): the SC's own library pack is renamed in
 * place with the house `InlineRenameField`, the same affordance the integration flyout uses.
 * Nothing else offers it: a Data Installer pack, or a library pack someone else owns.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DatapackPanelTitle } from '@/features/data-installer/ui/components/DatapackPanelTitle';
import type { DatapackDetail } from '@/features/data-installer/types';

const MINE: DatapackDetail = {
    id: { name: 'acme-1a2b3c', version: '20261029-183005' },
    displayName: 'Acme Demo',
    shared: false,
    dataTypes: ['products'],
    art: {},
    store: 'library',
    mine: true,
};

function renderPanel(detail: DatapackDetail, onRename?: jest.Mock) {
    return render(<DatapackPanelTitle title={detail.displayName} detail={detail} {...(onRename ? { onRename } : {})} />);
}

it("renames the SC's own library pack in place, handing the pack and the new name over", async () => {
    const onRename = jest.fn().mockResolvedValue(null);
    renderPanel(MINE, onRename);

    fireEvent.click(screen.getByRole('button', { name: 'Rename Acme Demo' }));
    const input = screen.getByRole('textbox', { name: 'New datapack name' });
    fireEvent.change(input, { target: { value: 'Acme Q4' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith(MINE.id, 'Acme Q4'));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
});

it('offers no Rename on a pack that is not the SC own, or not in the library', () => {
    const onRename = jest.fn();
    const { unmount } = renderPanel({ ...MINE, mine: false }, onRename);
    expect(screen.queryByRole('button', { name: 'Rename Acme Demo' })).not.toBeInTheDocument();
    unmount();

    renderPanel({ ...MINE, store: 'installer', mine: undefined }, onRename);
    expect(screen.queryByRole('button', { name: 'Rename Acme Demo' })).not.toBeInTheDocument();
    expect(screen.getByText('Acme Demo')).toBeInTheDocument();
});
