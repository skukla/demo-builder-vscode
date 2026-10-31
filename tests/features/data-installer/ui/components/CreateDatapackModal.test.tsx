/**
 * "Create datapack" (owner, 2026-10-30): one action in place of "Export from this instance" and
 * "Save from this store", whose dialog first asks the pack type and names the project it reads
 * from, then routes to the screen that already makes that pack:
 *
 * - Commerce, with Demo Builder's engine: the pick screen (`onSaveFromStore`), into this demo's
 *   own library pack.
 * - Commerce, with the service's engine: the service's export (`ServiceExportModal`), into the
 *   shared catalog.
 * - ACO, with either engine, made from this Commerce instance: the ACO export
 *   (`ServiceExportModal`), into the SC's library.
 * - ACO made from a website (PL-60 slice A): a URL, and Continue opens the project's AI on it
 *   (`scrape-website-to-aco-pack`); the dialog closes once the AI is open.
 *
 * The type is asked once: the screen it routes to does not ask again.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { change, press, settle } from '../../../../helpers/reactSettle';

// Below the mocks on purpose: they hoist above these imports.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { CreateDatapackModal } from '@/features/data-installer/ui/components/CreateDatapackModal';

const mockRequest = webviewClient.request as jest.Mock;

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
        return { success: true, data: null };
    });
});

async function renderCreate(engine: 'service' | 'demo-builder' | undefined) {
    const props = { onClose: jest.fn(), onSaveFromStore: jest.fn() };
    render(<CreateDatapackModal engine={engine} {...props} />);
    await settle();
    return props;
}

it('asks the pack type first, Commerce chosen, and names the project it reads from', async () => {
    await renderCreate('demo-builder');

    expect(screen.getByText('Create a datapack')).toBeInTheDocument();
    expect(screen.getByText(/demo-1/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Commerce datapack/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^ACO datapack/ })).not.toBeChecked();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it("with Demo Builder's engine, Commerce opens the pick screen into this demo's own pack", async () => {
    const props = await renderCreate('demo-builder');
    expect(screen.getByRole('radio', { name: /this demo's own pack/ })).toBeInTheDocument();

    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSaveFromStore).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
});

it.each([['service'], [undefined]] as const)(
    "with the %s engine, Commerce opens the service's export into the shared catalog, asking the type no more",
    async (engine) => {
        const props = await renderCreate(engine);
        expect(screen.getByRole('radio', { name: /shared catalog/ })).toBeInTheDocument();

        await press(screen.getByRole('button', { name: 'Continue' }));

        expect(props.onSaveFromStore).not.toHaveBeenCalled();
        expect(await screen.findByRole('checkbox', { name: 'Attribute sets' })).toBeInTheDocument();
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    },
);

it.each([['service'], ['demo-builder']] as const)('with the %s engine, ACO opens the ACO export, asking the type no more', async (engine) => {
    const props = await renderCreate(engine);

    await press(screen.getByRole('radio', { name: /^ACO datapack/ }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSaveFromStore).not.toHaveBeenCalled();
    expect(await screen.findByRole('checkbox', { name: 'Default Store View (Main Website)' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Attribute sets' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
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
        mockRequest.mockImplementation(async (type: string) => {
            if (type === 'scrape-website-to-aco-pack') return { success: false, error: refusal };
            return { success: true, data: { projectName: 'demo-1' } };
        });
        const props = await chooseWebsite();

        await change(screen.getByRole('textbox', { name: /Product listing page/ }), 'shop');
        await press(screen.getByRole('button', { name: 'Continue' }));

        expect(screen.getByText(refusal)).toBeInTheDocument();
        expect(props.onClose).not.toHaveBeenCalled();
    });
});
