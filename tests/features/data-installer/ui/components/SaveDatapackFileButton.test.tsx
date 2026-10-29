/**
 * "Save as file": one request naming the pack and its store, then where it went —
 * or why not, or nothing at all for a dismissed dialog.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock import on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { SaveDatapackFileButton } from '@/features/data-installer/ui/components/SaveDatapackFileButton';

const mockRequest = webviewClient.request as jest.Mock;
const ID = { name: 'justrite', version: 'v1' };

function answer(response: unknown): void {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue(response);
}

async function saveFrom(source?: 'installer' | 'library'): Promise<void> {
    render(<SaveDatapackFileButton id={ID} {...(source ? { source } : {})} />);
    await press(screen.getByRole('button', { name: 'Save as file' }));
    await settle();
}

it('asks the host to save the named pack from the Data Installer by default, then says where it went', async () => {
    answer({ success: true, data: { path: '/Users/sc/justrite-v1.datapack.zip' } });

    await saveFrom();

    expect(mockRequest.mock.calls[0].slice(0, 2)).toEqual([
        'save-datapack-zip',
        { source: 'installer', datapackName: 'justrite', version: 'v1' },
    ]);
    expect(screen.getByText('Saved to /Users/sc/justrite-v1.datapack.zip')).toBeInTheDocument();
});

it('names the library when the pack lives there', async () => {
    answer({ success: true, data: { path: '/p/x.zip' } });

    await saveFrom('library');

    expect(mockRequest.mock.calls[0][1]).toMatchObject({ source: 'library' });
});

it('says nothing when the save dialog was dismissed', async () => {
    answer({ success: true, data: { cancelled: true } });

    await saveFrom();

    expect(screen.queryByText(/Saved to|could not be saved/)).not.toBeInTheDocument();
});

it('shows the handler refusal in its own words', async () => {
    answer({
        success: false,
        error: 'justrite@v1 holds no data yet, so there is nothing to save.',
    });

    await saveFrom();

    expect(
        screen.getByText(
            'The file could not be saved: justrite@v1 holds no data yet, so there is nothing to save.'
        )
    ).toBeInTheDocument();
});
