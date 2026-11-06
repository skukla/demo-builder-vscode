/**
 * "Copy to the Data Installer": one request carrying the pack name back as the
 * confirmation, then that the whole pack landed, or which types did not. Import sits
 * beside it in the flyout (`PackActions`): Demo Builder installs a library pack where it is.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock import on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { CopyToInstallerButton } from '@/features/data-installer/ui/components/CopyToInstallerButton';

const mockRequest = webviewClient.request as jest.Mock;
const ID = { name: 'justrite', version: 'v1' };

function answer(response: unknown): void {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue(response);
}

async function copyIt() {
    render(<CopyToInstallerButton id={ID} />);
    await press(screen.getByRole('button', { name: 'Copy to the Data Installer' }));
    await settle();
}

it('says the copy is shared and permanent before anything is sent', () => {
    answer({ success: true, data: { stored: [], failed: [] } });
    render(<CopyToInstallerButton id={ID} />);

    expect(screen.getByText(/Other teams will see justrite/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be removed from here/)).toBeInTheDocument();
    expect(mockRequest).not.toHaveBeenCalled();
});

it('sends the pack with its name back, then says it landed', async () => {
    answer({ success: true, data: { stored: ['categories', 'customer_groups'], failed: [] } });

    await copyIt();

    expect(mockRequest.mock.calls[0].slice(0, 2)).toEqual([
        'copy-library-datapack-to-installer',
        { datapackName: 'justrite', version: 'v1', confirmName: 'justrite' },
    ]);
    expect(screen.getByText('Copied into the Data Installer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
});

it('names what did not land, and why, when part of the pack did not', async () => {
    answer({
        success: true,
        data: {
            stored: ['categories'],
            failed: [
                { dataType: 'products', reason: 'products: too large to send in one request' },
            ],
        },
    });

    await copyIt();

    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(screen.getByText(/Copied 1 of 2 data types/)).toBeInTheDocument();
    expect(screen.getByText(/too large to send in one request/)).toBeInTheDocument();
});

it('shows a refusal in the handler words and keeps the button', async () => {
    answer({ success: false, error: 'justrite@v1 already exists in that store.' });

    await copyIt();

    expect(
        screen.getByText('It was not copied: justrite@v1 already exists in that store.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy to the Data Installer' })).toBeInTheDocument();
});
