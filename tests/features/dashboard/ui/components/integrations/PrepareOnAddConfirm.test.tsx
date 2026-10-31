/**
 * The confirm in front of adding the ERP integration (owner, 2026-10-22), shown in the Add
 * Integration flow's own window since 2026-10-31:
 * the add prepares the store, so before it runs the SC sees what that will change, read from
 * the store as the dialog opens, and which steps change something every website on the
 * Commerce shares. Its one accent button sends the add WITH confirm and opens its progress.
 * The real Modal over the shared Spectrum mock; only the webview client is mocked.
 */

import { mockPostMessage, mockRequest } from '../../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { DialogContainer, Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import {
    PREPARE_ON_ADD_COPY,
    prepareOnAddConfirmation,
    usePrepareOnAdd,
    type PrepareOnAddControls,
} from '@/features/dashboard/ui/components/integrations/PrepareOnAddConfirm';
import type { PreparationStepReport } from '@/types/storePreparation';

const PAYLOAD = { id: 'erp-integration', name: 'Justrite ERP', apis: [] };
const TARGET = { id: 'erp-integration', name: 'ERP Integration', payload: PAYLOAD };
const STEPS: PreparationStepReport[] = [
    { id: 'price-scope', label: 'Price scope', title: 'Set the catalog price scope to Website', state: 'applicable', changes: ['catalog/price/scope at the default scope: 0 → 1'], rejected: [] },
    { id: 'warehouse', label: 'Warehouse', title: 't', state: 'done', changes: [], rejected: [] },
    { id: 'associate', label: 'Associate the app', title: 't', state: 'manual', changes: [], rejected: [] },
];

let controls: PrepareOnAddControls;
/**
 * The confirm as the Add Integration flow shows it: in that flow's own dialog container, in place
 * of the flow (owner, 2026-10-31, the multi-dialog audit), not a second dialog.
 */
function Harness({ started }: { started: jest.Mock }): React.ReactElement {
    controls = usePrepareOnAdd(started);
    return <DialogContainer onDismiss={controls.dialog.onClose}>{prepareOnAddConfirmation(controls.dialog) ?? null}</DialogContainer>;
}

function renderDialog(): jest.Mock {
    const started = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <Harness started={started} />
        </Provider>,
    );
    return started;
}

beforeEach(() => {
    mockRequest.mockReset();
    mockPostMessage.mockReset();
    mockRequest.mockResolvedValue({
        success: true,
        data: { confirmed: false, preparation: { steps: STEPS, everyWebsite: ['Price scope'] } },
    });
});

describe('the confirm in front of adding the ERP integration', () => {
    it('reads what the add will change in the store, without confirm, and lists every step', async () => {
        renderDialog();
        await act(async () => controls.confirmAdd(TARGET));

        expect(mockRequest).toHaveBeenCalledWith('addAppBuilderComponent', PAYLOAD);
        // A step to apply says what it does in words, not the setting path its fix writes.
        expect(await screen.findByText('Set the catalog price scope to Website')).toBeInTheDocument();
        expect(screen.getByTestId('prepare-on-add-steps').querySelectorAll('li[data-state]')).toHaveLength(3);
        expect(screen.getByTestId('prepare-on-add-every-website')).toHaveTextContent(
            PREPARE_ON_ADD_COPY.everyWebsite(['Price scope']),
        );
    });

    it('adds WITH confirm and opens its progress, carrying the confirm so Retry re-sends it', async () => {
        const started = renderDialog();
        await act(async () => controls.confirmAdd(TARGET));
        await screen.findByTestId('prepare-on-add-steps');

        fireEvent.click(screen.getByRole('button', { name: PREPARE_ON_ADD_COPY.action }));

        const confirmed = { ...PAYLOAD, confirm: true };
        expect(mockPostMessage).toHaveBeenCalledWith('addAppBuilderComponent', { ...confirmed, progress: 'modal' });
        expect(started).toHaveBeenCalledWith('erp-integration', 'ERP Integration', confirmed);
    });

    it('says when the store could not be read now, and still lets the SC add', async () => {
        mockRequest.mockResolvedValue({
            success: true,
            data: { confirmed: false, preparation: { unread: 'Adobe sign-in required to read the store.' } },
        });
        const started = renderDialog();
        await act(async () => controls.confirmAdd(TARGET));

        expect(await screen.findByTestId('prepare-store-notice')).toHaveTextContent('Adobe sign-in required to read the store.');
        fireEvent.click(screen.getByRole('button', { name: PREPARE_ON_ADD_COPY.action }));
        expect(started).toHaveBeenCalled();
    });

    it('shows a refusal from the add itself (already added) and offers no add', async () => {
        mockRequest.mockResolvedValue({ success: false, error: '"ERP Integration" is already added to this project.' });
        renderDialog();
        await act(async () => controls.confirmAdd(TARGET));

        expect(await screen.findByTestId('prepare-store-notice')).toHaveTextContent('is already added to this project.');
        expect(screen.getByRole('button', { name: PREPARE_ON_ADD_COPY.action })).toHaveAttribute('aria-disabled', 'true');
    });
});
