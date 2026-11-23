/**
 * The file load's one Delete (step-07 F2): removes exactly the ids it is given, one after another,
 * each without the library's same-version layer, on the one press. The flyout's "Remove from
 * library", which asks first for a pack shared in a project file (datapack-engine step 07), is a
 * menu row and is tested in PackActions.test.tsx.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { RemoveFromLibraryButton } from '@/features/data-installer/ui/components/RemoveFromLibraryButton';

const mockRequest = webviewClient.request as jest.Mock;
const PACK = { name: 'acme-1a2b3c', version: '20261029-183005' };
const LAYER = { name: 'acme-1a2b3c-settings', version: '3' };
const IDS = [PACK, LAYER];

const deletes = (): unknown[] => mockRequest.mock.calls.filter((c) => c[0] === 'delete-library-datapack').map((c) => c[1]);

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { deleted: true } });
});

it('removes each id on the one press, in order, keeping any layer it was not given', async () => {
    render(<RemoveFromLibraryButton ids={IDS} />);

    await press(screen.getByRole('button', { name: 'Delete' }));
    await settle();

    expect(deletes()).toEqual([
        { datapackName: PACK.name, version: PACK.version, keepSettingsLayer: true, confirm: true },
        { datapackName: LAYER.name, version: LAYER.version, keepSettingsLayer: true, confirm: true },
    ]);
    expect(screen.getByText('Deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
});

it('stops at the first the library refuses, and says why', async () => {
    mockRequest.mockResolvedValueOnce({ success: false, error: 'My Datapacks has no datapack named acme-1a2b3c@20261029-183005.' });
    render(<RemoveFromLibraryButton ids={IDS} />);

    await press(screen.getByRole('button', { name: 'Delete' }));
    await settle();

    expect(deletes()).toHaveLength(1);
    expect(screen.getByText(/It could not be deleted: My Datapacks has no datapack named/)).toBeInTheDocument();
    expect(screen.queryByText('Deleted.')).not.toBeInTheDocument();
});

// Review of F2: a retry after a partial failure picks up where it stopped. Starting again at the
// first id asked for one already gone, was refused, and never reached the rest.
it('sends only what is left when pressed again after a partial failure', async () => {
    mockRequest
        .mockResolvedValueOnce({ success: true, data: { deleted: true } })
        .mockResolvedValueOnce({ success: false, error: 'My Datapacks did not answer. Close and try again.' });
    render(<RemoveFromLibraryButton ids={IDS} />);

    await press(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    expect(deletes()).toHaveLength(2);
    await press(screen.getByRole('button', { name: 'Delete' }));
    await settle();

    expect(deletes().slice(2)).toEqual([{ datapackName: LAYER.name, version: LAYER.version, keepSettingsLayer: true, confirm: true }]);
    expect(screen.getByText('Deleted.')).toBeInTheDocument();
});
