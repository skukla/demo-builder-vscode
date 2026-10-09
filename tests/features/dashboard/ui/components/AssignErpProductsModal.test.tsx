/**
 * AssignErpProductsModal — "Assign products" on an ERP's card (AB-74).
 *
 * The real Modal over the shared Spectrum mock; only the webview client is mocked. The store's
 * answer is typed to the handler's result (`ErpAssignOptionsResult`), so a fixture that drifts
 * from what the extension sends fails to compile. Asserted: the read it asks for, the preview
 * as the SC picks, the attribute-set notice and its fix, a refusal, and what Assign hands back.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import {
    ASSIGN_COPY,
    AssignErpProductsModal,
    previewLines,
} from '@/features/dashboard/ui/components/AssignErpProductsModal';
import type { ErpAssignOptions, ErpAssignOptionsResult, ErpAssignPreview } from '@/types/erpAssign';

const TARGET = { id: 'erp-integration', erp: 'demo-erp-2', name: 'Accuform ERP' };

/** Three products: one Justrite's by the catch-all, one tagged for Justrite, one already Accuform's. */
const STORE: ErpAssignOptions = {
    erp: { id: 'demo-erp-2', name: 'Accuform ERP', listId: 'accuform' },
    ownerValue: 'accuform',
    categories: [{ value: '7', label: 'Signs', count: 3 }],
    brands: [{ value: 'Accuform', label: 'Accuform', count: 3 }],
    setsWithoutOwner: [],
    products: [
        { sku: 'ACC-1', attributeSetId: 4, categoryIds: ['7'], brand: 'Accuform', owner: '' },
        { sku: 'ACC-2', attributeSetId: 4, categoryIds: ['7'], brand: 'Accuform', owner: 'justrite' },
        { sku: 'ACC-3', attributeSetId: 4, categoryIds: ['7'], brand: 'Accuform', owner: 'accuform' },
    ],
    owners: { 'ACC-1': ['justrite'], 'ACC-2': ['justrite'], 'ACC-3': ['accuform'] },
    names: { justrite: 'Justrite ERP', accuform: 'Accuform ERP' },
};

function answers(data: ErpAssignOptions): ErpAssignOptionsResult {
    return { success: true, data };
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function open() {
    const onAssign = jest.fn();
    const onAddSets = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <AssignErpProductsModal target={TARGET} onClose={jest.fn()} onAssign={onAssign} onAddSets={onAddSets} />
        </Provider>,
    );
    await flush();
    return { onAssign, onAddSets };
}

function pickByPrefix(prefix: string): void {
    fireEvent.click(screen.getByRole('radio', { name: ASSIGN_COPY.byPrefix }));
    fireEvent.change(screen.getByLabelText(ASSIGN_COPY.prefixField), { target: { value: prefix } });
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('AssignErpProductsModal', () => {
    it("reads the ERP's options once and previews as the SC picks", async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('getErpAssignOptions', { id: 'erp-integration', erp: 'demo-erp-2' });
        expect(screen.getByText(ASSIGN_COPY.intro('accuform'))).toBeInTheDocument();

        pickByPrefix('acc-');

        expect(screen.getByText('3 products match.')).toBeInTheDocument();
        expect(screen.getByText('2 will be tagged erp_owner=accuform. For example: ACC-1, ACC-2.')).toBeInTheDocument();
        expect(screen.getByText('2 of them move from Justrite ERP.')).toBeInTheDocument();
        expect(screen.getByText('1 already belong to Accuform ERP.')).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('hands the selection back on Assign, with the count in the button', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        const { onAssign } = await open();
        pickByPrefix('ACC-');
        fireEvent.click(screen.getByRole('button', { name: 'Assign 2 products' }));
        expect(onAssign).toHaveBeenCalledWith(TARGET, { by: 'skuPrefix', prefix: 'ACC-' });
    });

    it('names the attribute sets without erp_owner and offers the fix', async () => {
        mockRequest.mockResolvedValue(answers({ ...STORE, setsWithoutOwner: [{ id: 9, name: 'Gear', products: 4 }] }));
        const { onAddSets } = await open();
        expect(screen.getByText(ASSIGN_COPY.setsBody('Gear (4 products)'))).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: ASSIGN_COPY.setsAction }));
        expect(onAddSets).toHaveBeenCalledWith('erp-integration');
    });

    it("says why nothing can be assigned to an ERP whose rule is not erp_owner, and offers no picker", async () => {
        const refusal = 'Justrite ERP owns every product no other ERP claims, not the products tagged with erp_owner.';
        mockRequest.mockResolvedValue(answers({ ...STORE, ownerValue: undefined, refusal }));
        await open();
        expect(screen.getByText(refusal)).toBeInTheDocument();
        expect(screen.queryByRole('radio', { name: ASSIGN_COPY.byPrefix })).toBeNull();
    });

    it("says the read's words when Commerce could not be read", async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required to assign products.' });
        await open();
        expect(screen.getByText('Adobe sign-in required to assign products.')).toBeInTheDocument();
    });
});

describe('previewLines', () => {
    const PREVIEW: ErpAssignPreview = {
        erp: STORE.erp,
        matched: 5,
        toWrite: 2,
        examples: ['A', 'B'],
        alreadyTagged: 0,
        movedFrom: [],
        outsideSets: { count: 2, sets: [{ id: 9, name: 'Gear', products: 2 }] },
        unknownSkus: ['NOPE'],
    };

    it('says what cannot be written and which pasted SKUs Commerce lacks', () => {
        expect(previewLines(PREVIEW, 'accuform')).toEqual([
            '5 products match.',
            '2 will be tagged erp_owner=accuform. For example: A, B.',
            '2 cannot be tagged until erp_owner is in their attribute set.',
            'Commerce has no product for NOPE.',
        ]);
    });
});
