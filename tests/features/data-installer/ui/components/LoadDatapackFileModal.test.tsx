/**
 * "Load from file": the host's picker opens first and says what is in the file;
 * only then does the SC choose a store and load. Each request is asserted by its
 * payload, because the handler decides on those fields.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock import on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { LoadDatapackFileModal } from '@/features/data-installer/ui/components/LoadDatapackFileModal';

const mockRequest = webviewClient.request as jest.Mock;

const OPENED = {
    path: '/Users/sc/justrite-v1.datapack.zip',
    datapackName: 'justrite',
    version: 'v1',
    displayName: 'Justrite B2B',
    dataTypes: ['categories', 'customer_groups'],
};

function withService(over: Record<string, unknown> = {}): void {
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string) => {
        if (type in over) return over[type];
        if (type === 'open-datapack-zip') return { success: true, data: OPENED };
        if (type === 'load-datapack-zip') {
            return {
                success: true,
                data: { target: 'library', pack: 'created', stored: OPENED.dataTypes, failed: [] },
            };
        }
        return { success: true, data: null };
    });
}

async function openModal(onClose = jest.fn()) {
    render(<LoadDatapackFileModal onClose={onClose} />);
    await settle();
    return onClose;
}

function loadCall(): Record<string, unknown> | undefined {
    return mockRequest.mock.calls.find((c) => c[0] === 'load-datapack-zip')?.[1];
}

beforeEach(() => withService());

it('opens the picker first, then shows what is in the file before anything is written', async () => {
    await openModal();

    expect(mockRequest.mock.calls[0][0]).toBe('open-datapack-zip');
    expect(screen.getByText(/Justrite B2B \(justrite, version v1\) holds:/)).toBeInTheDocument();
    expect(loadCall()).toBeUndefined();
});

it('closes without a dialog when the picker was dismissed', async () => {
    withService({ 'open-datapack-zip': { success: true, data: { cancelled: true } } });

    const onClose = await openModal();

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('loads into the library by default, private, without replacing anything', async () => {
    await openModal();

    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();

    expect(loadCall()).toEqual({ path: OPENED.path, target: 'library', update: false });
    expect(
        screen.getByText('Loaded 2 of 2 data types into the datapack library')
    ).toBeInTheDocument();
});

it('sends update only when the SC ticks replace, for the library', async () => {
    await openModal();

    await press(screen.getByRole('checkbox', { name: /replace its data/i }));
    await press(screen.getByRole('button', { name: 'Load' }));

    expect(loadCall()).toMatchObject({ target: 'library', update: true });
});

it('into the Data Installer: warns it is shared, and sends the pack name back as confirmation', async () => {
    withService({
        'load-datapack-zip': {
            success: true,
            data: { target: 'installer', pack: 'created', stored: ['categories'], failed: [] },
        },
    });
    await openModal();

    await press(screen.getByRole('radio', { name: /the Data Installer/i }));

    expect(
        screen.getByText(/Other teams will see justrite in the shared catalog/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /replace its data/i })).not.toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();
    expect(loadCall()).toEqual({
        path: OPENED.path,
        target: 'installer',
        update: false,
        confirmName: 'justrite',
    });
});

it('lists each refused type with its reason when only part of the file landed', async () => {
    withService({
        'load-datapack-zip': {
            success: true,
            data: {
                target: 'library',
                pack: 'created',
                stored: ['categories'],
                failed: [
                    {
                        dataType: 'customer_groups',
                        reason: 'customer_groups: too large to send in one request',
                    },
                ],
            },
        },
    });
    await openModal();

    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();

    expect(
        screen.getByText('Loaded 1 of 2 data types into the datapack library')
    ).toBeInTheDocument();
    expect(screen.getByText(/too large to send in one request/)).toBeInTheDocument();
});

it('explains a file that cannot be opened, in the handler words', async () => {
    withService({
        'open-datapack-zip': {
            success: false,
            error: 'This zip is not a Demo Builder datapack file.',
        },
    });

    await openModal();

    expect(screen.getByText('This zip is not a Demo Builder datapack file.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
});
