/**
 * PrepareStoreDialogs — the Integrations screen's "Prepare this store" dialogs (AB-77): the
 * preview modal reads the steps when it opens and its one accent Prepare starts the apply
 * with confirm; the undo confirm starts the undo; a step's Apply or Undo from the guide starts
 * the same messages for that step. Asserted on what each STARTS through the screen's
 * operations. The real Modal over the shared Spectrum mock; only the webview client is mocked.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import {
    PREPARE_STORE_COPY,
    PrepareStoreDialogs,
    STATE_WORDS,
    usePrepareStoreDialogs,
    type PrepareStoreControls,
} from '@/features/dashboard/ui/components/integrations/PrepareStoreDialogs';
import type { ComponentOperationControls } from '@/features/dashboard/ui/hooks/useComponentOperation';
import type { PreparationStepReport } from '@/types/storePreparation';

const TARGET = { id: 'erp-integration', name: 'ERP Integration' };
const STEPS: PreparationStepReport[] = [
    { id: 'confirmed-status', label: 'Confirmed status', title: 't', state: 'manual', changes: [], rejected: [] },
    { id: 'price-scope-website', label: 'Price scope', title: 't', state: 'applicable', changes: ['catalog/price/scope at the default scope: 0 → 1'], rejected: [] },
    { id: 'card-payments', label: 'Card payments', title: 't', state: 'applicable', changes: [], rejected: [], manual: 'Connect PayPal by hand.' },
    { id: 'partially-held-status', label: 'Partially Held status', title: 't', state: 'unknown', changes: [], rejected: [], note: 'Could not check: the read timed out.' },
];

function operations(): ComponentOperationControls {
    return {
        open: null,
        start: jest.fn(),
        startWhenItBegins: jest.fn(),
        show: jest.fn(),
        reopen: jest.fn(() => false),
        retry: jest.fn(),
        close: jest.fn(),
        run: jest.fn(() => true),
        started: jest.fn(),
        resetErp: jest.fn(),
        loadErpData: jest.fn(),
        addErp: jest.fn(),
    };
}

let controls: PrepareStoreControls;
function Harness({ ops }: { ops: ComponentOperationControls }): React.ReactElement {
    controls = usePrepareStoreDialogs(ops);
    return <PrepareStoreDialogs {...controls.dialogs} />;
}

function renderDialogs() {
    const ops = operations();
    render(
        <Provider theme={defaultTheme}>
            <Harness ops={ops} />
        </Provider>,
    );
    return ops;
}

const started = (ops: ComponentOperationControls) => (ops.start as jest.Mock).mock.calls.map(([op]) => [op.message, op.payload]);

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { steps: STEPS } });
});

describe('the preview modal', () => {
    it('reads the preview when it opens, lists every step with its state and changes, and Prepare starts the apply', async () => {
        const ops = renderDialogs();
        await act(async () => controls.openPrepare(TARGET));
        expect(mockRequest).toHaveBeenCalledWith('prepareCommerceStore', { id: 'erp-integration' });
        expect(await screen.findByText('catalog/price/scope at the default scope: 0 → 1')).toBeInTheDocument();
        expect(screen.getByText('Connect PayPal by hand.')).toBeInTheDocument();
        expect(screen.getByTestId('prepare-store-steps').querySelectorAll('li[data-state]')).toHaveLength(4);
        // A check that could not tell is said so, with the check's words, and never as done.
        const row = screen.getByTestId('prepare-store-steps').querySelector('li[data-state="unknown"]');
        expect(row).toHaveTextContent(`Partially Held status — ${STATE_WORDS.unknown}`);
        expect(row).toHaveTextContent('Could not check: the read timed out.');
        fireEvent.click(screen.getByRole('button', { name: PREPARE_STORE_COPY.prepare }));
        expect(ops.start).toHaveBeenCalledWith({
            id: 'erp-integration',
            name: 'ERP Integration',
            message: 'prepareCommerceStore',
            payload: { confirm: true },
            title: 'Preparing the store for ERP Integration',
            failureTitle: "Couldn't prepare the store for ERP Integration",
            successTitle: 'Store prepared for ERP Integration',
        });
    });

    it('disables Prepare and says so when no step is applicable', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { steps: [STEPS[0]] } });
        renderDialogs();
        await act(async () => controls.openPrepare(TARGET));
        expect(await screen.findByText(PREPARE_STORE_COPY.nothing)).toBeInTheDocument();
        // The house Modal's button is a div with aria-disabled, not a <button>.
        expect(screen.getByRole('button', { name: PREPARE_STORE_COPY.prepare })).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows a refusal in the notice', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required to prepare the store.' });
        renderDialogs();
        await act(async () => controls.openPrepare(TARGET));
        expect(await screen.findByTestId('prepare-store-notice')).toHaveTextContent('Adobe sign-in required to prepare the store.');
    });
});

describe('the confirms', () => {
    it('confirms the undo, then starts it with confirm', () => {
        const ops = renderDialogs();
        act(() => controls.confirmUndo(TARGET));
        expect(screen.getByText(PREPARE_STORE_COPY.undoBody('ERP Integration'))).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: PREPARE_STORE_COPY.undoAction }));
        expect(started(ops)).toEqual([['undoCommerceStorePreparation', { confirm: true }]]);
    });

    it("confirms a step's Apply and Undo from the guide, each for that step alone", () => {
        const ops = renderDialogs();
        act(() => controls.prepareStep({ ...TARGET, mode: 'apply', stepId: 'price-scope-website', label: 'Price scope' }));
        expect(screen.getByText(PREPARE_STORE_COPY.stepApplyTitle('Price scope'))).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: PREPARE_STORE_COPY.stepApplyAction }));
        act(() => controls.prepareStep({ ...TARGET, mode: 'undo', stepId: 'price-scope-website', label: 'Price scope' }));
        fireEvent.click(screen.getByRole('button', { name: PREPARE_STORE_COPY.stepUndoAction }));
        expect(started(ops)).toEqual([
            ['prepareCommerceStore', { confirm: true, stepIds: ['price-scope-website'] }],
            ['undoCommerceStorePreparation', { confirm: true, stepId: 'price-scope-website' }],
        ]);
    });
});
