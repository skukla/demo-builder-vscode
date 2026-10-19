/**
 * AssignErpProductsModal — "Assign products" on an ERP's card (AB-74), as a table of the
 * project's store's products the SC searches, filters, sorts and selects (owner, 2026-10-18
 * and 2026-10-19).
 *
 * The real Modal and list over the shared Spectrum mock; only the webview client is mocked. The
 * store's answer is typed to the handler's result (`ErpAssignOptionsResult`), so a fixture that
 * drifts from what the extension sends fails to compile. Asserted: the read it asks for, the
 * columns and what each row shows, how the table narrows and sorts, the ticks and what Assign hands back, the locked rows, the
 * attribute-set notice and its fix, a refusal, and a read that failed.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import {
    ASSIGN_COPY,
    AssignErpProductsModal,
    selectionLines,
} from '@/features/dashboard/ui/components/AssignErpProductsModal';
import { LIST_COPY } from '@/features/dashboard/ui/components/AssignProductList';
import type { ErpAssignOptions, ErpAssignOptionsResult, ErpAssignPreview } from '@/types/erpAssign';

const TARGET = { id: 'erp-integration', erp: 'demo-erp-2', name: 'Accuform ERP' };

/**
 * Four products: two Justrite's by the catch-all (one a sign, one a cabinet), one already
 * Accuform's, and one in an attribute set without erp_owner.
 */
const STORE: ErpAssignOptions = {
    erp: { id: 'demo-erp-2', name: 'Accuform ERP', listId: 'accuform' },
    ownerValue: 'accuform',
    categories: [
        // Labelled by path below the store's root, as listCategoryLabels gives them.
        { value: '7', label: 'Signs › Exit Signs' },
        { value: '8', label: 'Cabinets › Flammables' },
    ],
    website: 'Justrite Website',
    setsWithoutOwner: [{ id: 9, name: 'Gear', products: 1 }],
    products: [
        { sku: 'ACC-1', name: 'Exit sign', attributeSetId: 4, categoryIds: ['7'], brand: 'Accuform', owner: '' },
        { sku: 'CAB-30', name: 'Safety cabinet', attributeSetId: 4, categoryIds: ['8'], brand: 'Justrite', owner: '' },
        { sku: 'ACC-3', name: 'Floor sign', attributeSetId: 4, categoryIds: ['7'], brand: 'Accuform', owner: 'accuform' },
        { sku: 'ACC-9', name: 'Gear tag', attributeSetId: 9, categoryIds: ['7'], brand: 'Accuform', owner: '' },
    ],
    owners: { 'ACC-1': ['justrite'], 'CAB-30': ['justrite'], 'ACC-3': ['accuform'], 'ACC-9': ['justrite'] },
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

async function open(store: ErpAssignOptions = STORE) {
    mockRequest.mockResolvedValue(answers(store));
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

/** The table's row for a SKU. */
function row(sku: string): HTMLElement {
    const found = screen.getByRole('grid', { name: 'Products' }).querySelector(`[data-key="${sku}"]`);
    if (!found) throw new Error(`no row ${sku}`);
    return found as HTMLElement;
}

/** The SKUs the table shows, in order. */
function shownSkus(): string[] {
    const table = screen.queryByRole('grid', { name: 'Products' });
    return table ? Array.from(table.querySelectorAll('tbody tr[data-key]')).map((item) => item.getAttribute('data-key') ?? '') : [];
}

/** A row's cells' text, column by column. */
function cells(sku: string): string[] {
    return within(row(sku)).getAllByRole('gridcell').map((cell) => cell.textContent ?? '');
}

function pick(sku: string): void {
    fireEvent.click(row(sku));
}

/** Choose a filter's value through the Picker mock's hidden select. */
function filterBy(label: string, value: string): void {
    const picker = screen.getAllByTestId('spectrum-picker-wrapper').find((wrapper) => within(wrapper).queryByRole('button', { name: label }));
    if (!picker) throw new Error(`no ${label} filter`);
    fireEvent.change(within(picker).getByTestId('spectrum-picker-select'), { target: { value } });
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('AssignErpProductsModal', () => {
    it("reads the ERP's options once and shows every product, by SKU, with its name, category and owner", async () => {
        await open();
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('getErpAssignOptions', { id: 'erp-integration', erp: 'demo-erp-2' });
        // No intro and no attribute code: the title says what it does, the count where from.
        expect(screen.queryByText(/erp_owner=/)).toBeNull();
        expect(screen.getAllByRole('columnheader').map((heading) => heading.textContent).filter(Boolean)).toStrictEqual(['SKU', 'Name', 'Category', 'Owner']);
        expect(shownSkus()).toEqual(['ACC-1', 'ACC-3', 'ACC-9', 'CAB-30']);
        expect(cells('CAB-30')).toStrictEqual(['CAB-30', 'Safety cabinet', 'Flammables', 'Justrite ERP']);
        expect(screen.getByText('4 products on Justrite Website')).toBeInTheDocument();
        // Nothing selected: nothing to show or clear yet.
        expect(screen.queryByRole('button', { name: LIST_COPY.selectedOnly })).toBeNull();
        expect(screen.queryByRole('button', { name: LIST_COPY.clear })).toBeNull();
        // Nothing ticked: nothing to assign.
        expect(screen.getByRole('button', { name: ASSIGN_COPY.actionIdle })).toHaveAttribute('aria-disabled', 'true');
    });

    it('finds a product by SKU or by name', async () => {
        await open();
        fireEvent.change(screen.getByTestId('spectrum-searchfield'), { target: { value: 'cab-' } });
        expect(shownSkus()).toEqual(['CAB-30']);
        fireEvent.change(screen.getByTestId('spectrum-searchfield'), { target: { value: 'floor' } });
        expect(shownSkus()).toEqual(['ACC-3']);
    });

    it('narrows by a top-level category, then by one of its subcategories', async () => {
        await open();
        const offered = (label: string) => {
            const picker = screen.getAllByTestId('spectrum-picker-wrapper').find((wrapper) => within(wrapper).queryByRole('button', { name: label }));
            return Array.from(picker?.querySelectorAll('option') ?? []).map((option) => option.textContent);
        };
        expect(offered(LIST_COPY.category)).toStrictEqual([LIST_COPY.anyCategory, 'Cabinets', 'Signs']);
        // No subcategory filter until a category with some is chosen.
        expect(screen.queryByRole('button', { name: LIST_COPY.subcategory })).toBeNull();

        filterBy(LIST_COPY.category, 'Signs');
        expect(shownSkus()).toEqual(['ACC-1', 'ACC-3', 'ACC-9']);
        expect(offered(LIST_COPY.subcategory)).toStrictEqual([LIST_COPY.anySubcategory, 'Exit Signs']);
        filterBy(LIST_COPY.subcategory, '7');
        expect(shownSkus()).toEqual(['ACC-1', 'ACC-3', 'ACC-9']);

        // A new category starts its subcategory over.
        filterBy(LIST_COPY.category, 'Cabinets');
        expect(shownSkus()).toEqual(['CAB-30']);
    });

    it('narrows by category and owner, together', async () => {
        await open();
        filterBy(LIST_COPY.category, 'Signs');
        expect(shownSkus()).toEqual(['ACC-1', 'ACC-3', 'ACC-9']);
        filterBy(LIST_COPY.owner, 'justrite');
        expect(shownSkus()).toEqual(['ACC-1', 'ACC-9']);
        expect(screen.getByText('2 of 4 products on Justrite Website')).toBeInTheDocument();
        filterBy(LIST_COPY.owner, 'none');
        expect(screen.getByText(LIST_COPY.nothing)).toBeInTheDocument();
    });

    it('hands back the ticked SKUs on Assign, says where they move from, and counts them in the button', async () => {
        const { onAssign } = await open();
        pick('ACC-1');
        pick('CAB-30');
        expect(screen.getByTestId('assign-preview')).toHaveTextContent("2 selected. They move to Accuform ERP. 2 of them are Justrite ERP's now.");
        fireEvent.click(screen.getByRole('button', { name: 'Assign 2 products' }));
        expect(onAssign).toHaveBeenCalledWith(TARGET, { by: 'skus', skus: ['ACC-1', 'CAB-30'] });
    });

    it('keeps a selection while the filters change, shows only what is selected, and clears it', async () => {
        await open();
        filterBy(LIST_COPY.category, 'Cabinets');
        pick('CAB-30');
        filterBy(LIST_COPY.category, 'Signs');
        pick('ACC-1');
        filterBy(LIST_COPY.category, 'any');
        fireEvent.click(screen.getByRole('button', { name: LIST_COPY.selectedOnly }));
        expect(shownSkus()).toEqual(['ACC-1', 'CAB-30']);
        expect(screen.getByRole('button', { name: 'Assign 2 products' })).not.toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(screen.getByRole('button', { name: LIST_COPY.clear }));
        expect(screen.getByRole('button', { name: ASSIGN_COPY.actionIdle })).toHaveAttribute('aria-disabled', 'true');
    });

    it('selects every product shown that can be tagged, and a click on a row takes it out again', async () => {
        await open();
        filterBy(LIST_COPY.category, 'Signs');
        // ACC-3 is already Accuform's and ACC-9 cannot be tagged: one of three is open.
        fireEvent.click(screen.getByRole('checkbox', { name: 'Select All' }));
        expect(screen.getByRole('button', { name: 'Assign 1 product' })).toBeInTheDocument();
        pick('ACC-1');
        expect(screen.getByRole('button', { name: ASSIGN_COPY.actionIdle })).toHaveAttribute('aria-disabled', 'true');
    });

    it('sorts by the column heading clicked, and again the other way', async () => {
        await open();
        fireEvent.click(screen.getByRole('columnheader', { name: LIST_COPY.columns.owner }));
        expect(shownSkus()).toEqual(['ACC-3', 'ACC-9', 'ACC-1', 'CAB-30']);
        fireEvent.click(screen.getByRole('columnheader', { name: LIST_COPY.columns.sku }));
        expect(shownSkus()).toEqual(['ACC-1', 'ACC-3', 'ACC-9', 'CAB-30']);
        fireEvent.click(screen.getByRole('columnheader', { name: LIST_COPY.columns.sku }));
        expect(shownSkus()).toEqual(['CAB-30', 'ACC-9', 'ACC-3', 'ACC-1']);
    });

    it("locks a product already this ERP's, and one whose attribute set has no erp_owner, saying why", async () => {
        await open();
        expect(row('ACC-3')).toHaveAttribute('aria-selected', 'true');
        expect(row('ACC-3')).toHaveAttribute('aria-disabled', 'true');
        expect(row('ACC-3')).toHaveTextContent(LIST_COPY.already('Accuform ERP'));
        expect(row('ACC-9')).toHaveAttribute('aria-disabled', 'true');
        expect(row('ACC-9')).toHaveTextContent(LIST_COPY.blocked);
        // A click on a locked row changes nothing.
        pick('ACC-9');
        expect(screen.getByRole('button', { name: ASSIGN_COPY.actionIdle })).toHaveAttribute('aria-disabled', 'true');
    });

    it('names the attribute sets without erp_owner and offers the fix', async () => {
        const { onAddSets } = await open();
        expect(screen.getByText(ASSIGN_COPY.setsBody('Gear (1 product)'))).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: ASSIGN_COPY.setsAction }));
        expect(onAddSets).toHaveBeenCalledWith('erp-integration');
    });

    it("says why nothing can be assigned to an ERP whose rule is not erp_owner, and shows no list", async () => {
        const refusal = 'Justrite ERP owns every product no other ERP claims, not the products tagged with erp_owner.';
        await open({ ...STORE, ownerValue: undefined, refusal });
        expect(screen.getByText(ASSIGN_COPY.nothingToAssign('Accuform ERP'))).toBeInTheDocument();
        expect(screen.getByText(refusal)).toBeInTheDocument();
        expect(screen.queryByRole('grid', { name: 'Products' })).toBeNull();
        // Nothing to do here but close.
        expect(screen.queryByRole('button', { name: ASSIGN_COPY.actionIdle })).toBeNull();
    });

    it("says the read's words when Commerce could not be read", async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required to assign products.' });
        render(
            <Provider theme={defaultTheme}>
                <AssignErpProductsModal target={TARGET} onClose={jest.fn()} onAssign={jest.fn()} onAddSets={jest.fn()} />
            </Provider>,
        );
        await flush();
        expect(screen.getByText('Adobe sign-in required to assign products.')).toBeInTheDocument();
        expect(screen.getByText(ASSIGN_COPY.readFailed)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: ASSIGN_COPY.actionIdle })).toBeNull();
    });

    // The frame is there from the first moment, so nothing moves as the read lands (owner,
    // 2026-10-19): the controls off, the reading where the rows will be.
    it('opens on the whole frame while reading, the controls off and the reading under the headings', async () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));
        render(
            <Provider theme={defaultTheme}>
                <AssignErpProductsModal target={TARGET} onClose={jest.fn()} onAssign={jest.fn()} onAddSets={jest.fn()} />
            </Provider>,
        );
        await flush();
        const table = screen.getByRole('grid', { name: 'Products' });
        expect(within(table).getByText(LIST_COPY.reading)).toBeInTheDocument();
        expect(within(table).getAllByRole('columnheader').map((heading) => heading.textContent).filter(Boolean)).toStrictEqual(['SKU', 'Name', 'Category', 'Owner']);
        expect(screen.getByTestId('spectrum-searchfield')).toBeDisabled();
        expect(screen.getByRole('button', { name: LIST_COPY.category })).toBeDisabled();
        expect(screen.getByRole('button', { name: LIST_COPY.owner })).toBeDisabled();
        expect(screen.queryByText(/products on/)).toBeNull();
        expect(screen.getByRole('button', { name: ASSIGN_COPY.actionIdle })).toHaveAttribute('aria-disabled', 'true');
    });
});

describe('selectionLines', () => {
    const PREVIEW: ErpAssignPreview = {
        erp: STORE.erp,
        matched: 3,
        toWrite: 3,
        examples: ['A', 'B', 'C'],
        alreadyTagged: 0,
        movedFrom: [{ name: 'Justrite ERP', count: 1 }],
        outsideSets: { count: 0, sets: [] },
        unknownSkus: [],
    };

    it('says how many and where each comes from, in the right number', () => {
        expect(selectionLines(PREVIEW)).toEqual(['3 selected. They move to Accuform ERP.', "1 of them is Justrite ERP's now."]);
    });

    it('says nothing when nothing would be written', () => {
        expect(selectionLines({ ...PREVIEW, toWrite: 0 })).toStrictEqual([]);
    });
});
