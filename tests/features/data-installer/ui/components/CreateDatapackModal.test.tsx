/**
 * "Create datapack" (owner, 2026-10-30), as ONE dialog (owner, 2026-10-31, the multi-dialog
 * audit): the pack type as two plain options at the top and the chosen option's form right under
 * it, as the Share dialog does:
 *
 * - Commerce, with Demo Builder's engine: the pick list, whose Save starts the catalog's save
 *   (`onSaveFromStore`) into this demo's own library pack.
 * - Commerce, with the service's engine: the service's export, into the shared catalog.
 * - ACO, with either engine: the ACO export, into the SC's library.
 *
 * - ACO made from a website (PL-60 slice A): a URL under the choices, and Continue opens the
 *   project's AI on it (`scrape-website-to-aco-pack`); the dialog closes once the AI is open.
 *
 * No second dialog: switching a choice swaps the form in the same window. Only the website form
 * has a Continue, because it hands over to the AI rather than making the pack itself.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { change, press, settle } from '../../../../helpers/reactSettle';

// Below the mocks on purpose: they hoist above these imports.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { StoreItemPage } from '@/features/data-installer/pickableKinds';
import { CreateDatapackModal } from '@/features/data-installer/ui/components/CreateDatapackModal';

const mockRequest = webviewClient.request as jest.Mock;

const PRODUCTS: StoreItemPage = {
    items: [{ id: 'VR-Rack', displayName: 'VR Rack', detail: 'VR-Rack', key: 'VR-Rack' }],
    totalCount: 1,
    excludedCount: 0,
    inPackCount: 0,
};

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string, payload?: Record<string, unknown>) => {
        if (type === 'get-datapack-import-target') return { success: true, data: { instance: 'inst-1', projectName: 'demo-1' } };
        if (type === 'list-datapack-data-types' && payload?.operationMode === 'export') {
            return { success: true, data: { mode: 'export', dataTypes: ['attribute_sets', 'categories'] } };
        }
        if (type === 'list-datapack-import-scopes') {
            return { success: true, data: { websites: [{ code: 'base', name: 'Main Website', storeViews: [{ code: 'default', name: 'Default Store View' }] }] } };
        }
        if (type === 'list-datapack-export-items') return { success: true, data: PRODUCTS };
        return { success: true, data: null };
    });
});

async function renderCreate(engine: 'service' | 'demo-builder' | undefined) {
    const props = { onClose: jest.fn(), onSaveFromStore: jest.fn() };
    render(<CreateDatapackModal engine={engine} {...props} />);
    await settle();
    return props;
}

it('shows the pack type on top, Commerce chosen, with its form under it in the same window', async () => {
    await renderCreate('demo-builder');

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('Create a datapack')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Commerce datapack' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'ACO datapack' })).not.toBeChecked();
    // The pick list's own opening sentence says where the pack goes; nothing repeats it.
    expect(screen.getAllByText(/this demo's own pack/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
});

it("with Demo Builder's engine, Commerce's Save starts the save with the picks, then closes", async () => {
    const props = await renderCreate('demo-builder');

    await press(await screen.findByRole('checkbox', { name: /VR Rack/ }));
    await press(screen.getByRole('button', { name: /^Save/ }));

    expect(props.onSaveFromStore).toHaveBeenCalledWith({ products: ['VR-Rack'] });
    expect(props.onClose).toHaveBeenCalledTimes(1);
});

it.each([['service'], [undefined]] as const)(
    "with the %s engine, Commerce shows the service's export under the choice",
    async (engine) => {
        const props = await renderCreate(engine);

        expect(screen.getAllByText(/shared catalog/)).toHaveLength(1);
        expect(await screen.findByRole('checkbox', { name: 'Attribute sets' })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Commerce datapack' })).toBeChecked();
        expect(props.onSaveFromStore).not.toHaveBeenCalled();
    },
);

it.each([['service'], ['demo-builder']] as const)('with the %s engine, choosing ACO swaps in the ACO export, in the same window', async (engine) => {
    const props = await renderCreate(engine);

    await press(screen.getByRole('radio', { name: 'ACO datapack' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(await screen.findByRole('checkbox', { name: 'Default Store View (Main Website)' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Attribute sets' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ACO datapack' })).toBeChecked();
    expect(props.onSaveFromStore).not.toHaveBeenCalled();
});

it('closes without making anything', async () => {
    const props = await renderCreate('demo-builder');

    await press(screen.getByRole('button', { name: 'Close' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSaveFromStore).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalledWith('start-datapack-export', expect.anything(), undefined);
});

describe('an ACO pack made from a website', () => {
    async function chooseWebsite() {
        const props = await renderCreate('demo-builder');
        await press(screen.getByRole('radio', { name: /^ACO datapack/ }));
        await press(screen.getByRole('radio', { name: 'From a website' }));
        return props;
    }

    it('offers the two sources once ACO is chosen, this Commerce instance first', async () => {
        await renderCreate('demo-builder');
        expect(screen.queryByRole('radio', { name: 'From a website' })).not.toBeInTheDocument();

        await press(screen.getByRole('radio', { name: /^ACO datapack/ }));

        expect(screen.getByRole('radio', { name: 'From this Commerce instance' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'From a website' })).not.toBeChecked();
        expect(screen.queryByRole('textbox', { name: /Product listing page/ })).not.toBeInTheDocument();
    });

    it('asks for the page and keeps Continue off until there is one', async () => {
        await chooseWebsite();

        expect(screen.getByRole('textbox', { name: /Product listing page/ })).toBeInTheDocument();
        // The house Modal's buttons are div role=button: disabled is aria-disabled.
        expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('aria-disabled', 'true');
        await press(screen.getByRole('button', { name: 'Continue' }));
        expect(mockRequest).not.toHaveBeenCalledWith('scrape-website-to-aco-pack', expect.anything(), undefined);
    });

    it("sends the URL to open the project's AI, then closes without opening an export screen", async () => {
        const props = await chooseWebsite();

        await change(screen.getByRole('textbox', { name: /Product listing page/ }), 'https://shop.example.com/boots');
        await press(screen.getByRole('button', { name: 'Continue' }));

        expect(mockRequest).toHaveBeenCalledWith('scrape-website-to-aco-pack', { url: 'https://shop.example.com/boots' }, undefined);
        expect(mockRequest).not.toHaveBeenCalledWith('start-datapack-export', expect.anything(), undefined);
        expect(props.onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it("shows the handler's refusal on the field and stays open", async () => {
        const refusal = 'Enter the address of a page that lists products, starting with https:// or http://.';
        // Every other request answers as the suite's default does: the pick list renders first.
        const answerDefault = mockRequest.getMockImplementation();
        mockRequest.mockImplementation(async (type: string, payload?: Record<string, unknown>) => {
            if (type === 'scrape-website-to-aco-pack') return { success: false, error: refusal };
            return answerDefault?.(type, payload);
        });
        const props = await chooseWebsite();

        await change(screen.getByRole('textbox', { name: /Product listing page/ }), 'shop');
        await press(screen.getByRole('button', { name: 'Continue' }));

        expect(screen.getByText(refusal)).toBeInTheDocument();
        expect(props.onClose).not.toHaveBeenCalled();
    });
});
