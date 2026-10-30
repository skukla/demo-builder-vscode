/**
 * "Create datapack" (owner, 2026-10-30): one action in place of "Export from this instance" and
 * "Save from this store", whose dialog first asks the pack type and names the project it reads
 * from, then routes to the screen that already makes that pack:
 *
 * - Commerce, with Demo Builder's engine: the pick screen (`onSaveFromStore`), into this demo's
 *   own library pack.
 * - Commerce, with the service's engine: the service's export (`ServiceExportModal`), into the
 *   shared catalog.
 * - ACO, with either engine: the ACO export (`ServiceExportModal`), into the SC's library.
 *
 * The type is asked once: the screen it routes to does not ask again.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../helpers/reactSettle';

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
