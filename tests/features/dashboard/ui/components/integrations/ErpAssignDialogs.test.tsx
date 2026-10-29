/**
 * ErpAssignDialogs — the Integrations screen's "Assign products" dialogs (AB-74). Asserted on
 * what each confirmed action STARTS through the screen's operations (message, payload, titles),
 * and that the add's offer opens the modal for the ERP it names. The real Modal over the shared
 * Spectrum mock; only the webview client is mocked.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import {
    ERP_ASSIGN_DIALOG_COPY,
    ErpAssignDialogs,
    useErpAssignDialogs,
    type ErpAssignControls,
} from '@/features/dashboard/ui/components/integrations/ErpAssignDialogs';
import type { ComponentOperationControls } from '@/features/dashboard/ui/hooks/useComponentOperation';

const TARGET = { id: 'erp-integration', erp: 'demo-erp-2', name: 'Accuform ERP' };

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

let controls: ErpAssignControls;
function Harness({ ops }: { ops: ComponentOperationControls }): React.ReactElement {
    controls = useErpAssignDialogs(ops);
    return <ErpAssignDialogs {...controls.dialogs} />;
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

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: false, error: 'not read in this suite' });
});

describe('ErpAssignDialogs', () => {
    it('confirms the undo, then starts it for the ERP with confirm', () => {
        const ops = renderDialogs();
        act(() => controls.confirmUndoAssignment(TARGET));
        expect(screen.getByText(ERP_ASSIGN_DIALOG_COPY.undoBody('Accuform ERP'))).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: ERP_ASSIGN_DIALOG_COPY.undoAction }));
        expect(ops.start).toHaveBeenCalledWith({
            id: 'erp-integration',
            name: 'Accuform ERP',
            message: 'undoErpAssignment',
            payload: { erp: 'demo-erp-2', confirm: true },
            title: "Undoing Accuform ERP's last assignment",
            failureTitle: "Couldn't undo Accuform ERP's last assignment",
            successTitle: "Accuform ERP's last assignment undone",
        });
    });

    it("confirms the attribute-set fix and its undo, each through its own message", () => {
        const ops = renderDialogs();
        act(() => controls.changeSets('erp-integration', 'add'));
        fireEvent.click(screen.getByRole('button', { name: ERP_ASSIGN_DIALOG_COPY.addSetsAction }));
        act(() => controls.changeSets('erp-integration', 'remove'));
        fireEvent.click(screen.getByRole('button', { name: ERP_ASSIGN_DIALOG_COPY.removeSetsAction }));
        const messages = (ops.start as jest.Mock).mock.calls.map(([op]) => [op.id, op.message, op.payload]);
        expect(messages).toEqual([
            ['erp-integration', 'addErpOwnerToAttributeSets', { confirm: true }],
            ['erp-integration', 'removeErpOwnerFromAttributeSets', { confirm: true }],
        ]);
    });

    it("turns the add's offer into a button that opens the modal for the ERP it names", async () => {
        renderDialogs();
        const step = controls.offerStep({
            action: 'assign-erp-products',
            id: 'erp-integration',
            erp: 'demo-erp-2',
            name: 'Accuform ERP',
            message: 'Next: Accuform ERP owns no products yet. Assign products to it.',
        });
        expect(step).toMatchObject({ action: ERP_ASSIGN_DIALOG_COPY.offerAction, message: 'Next: Accuform ERP owns no products yet. Assign products to it.' });
        await act(async () => step?.onPress());
        expect(mockRequest).toHaveBeenCalledWith('getErpAssignOptions', { id: 'erp-integration', erp: 'demo-erp-2' });
    });
});
