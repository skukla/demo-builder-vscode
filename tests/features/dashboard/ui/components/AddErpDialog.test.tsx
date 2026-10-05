/**
 * AddErpDialog — "Which products belong to this ERP?" inside Add another ERP (AB-64).
 *
 * The real Modal over the shared Spectrum mock; only the webview client is mocked. The
 * store's answer is typed to the handler's result (`ErpOwnershipOptionsResult`), so a fixture
 * that drifts from what the extension sends fails to compile. Asserted: the three options and
 * their counts, the default rule, the existing ERP's line, and what Add hands back.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import { AddErpDialog, TWO_ERPS_NOTE } from '@/features/dashboard/ui/components/AddErpDialog';
import { SPLIT_HINT } from '@/features/dashboard/ui/components/ErpOwnershipPicker';
import type { ErpOwnershipOptions, ErpOwnershipOptionsResult } from '@/types/erpOwnership';

const TARGET = { id: 'erp-integration', name: 'Acme ERP Integration' };

/** Three websites; the first ERP still owns everything; one product tagged for the ERP about to be named. */
const STORE: ErpOwnershipOptions = {
    websites: [
        { code: 'base', name: 'Main Website' },
        { code: 'justrite', name: 'Justrite' },
        { code: 'evo', name: 'Evo' },
    ],
    sources: [
        { code: 'east', name: 'East DC' },
        { code: 'west', name: 'West DC' },
    ],
    products: [
        { sku: 'A', websiteCodes: ['base'], sourceCodes: ['east'], attributes: {} },
        { sku: 'B', websiteCodes: ['justrite'], sourceCodes: ['east', 'west'], attributes: { erp_owner: 'brand-b' } },
        { sku: 'C', websiteCodes: ['justrite', 'evo'], sourceCodes: [], attributes: {} },
    ],
    erps: [{ erp: 'acme', name: 'Acme ERP', owns: { mode: 'all' } }],
    takenListIds: ['acme'],
};

function answers(data: ErpOwnershipOptions): ErpOwnershipOptionsResult {
    return { success: true, data };
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function open() {
    const onAdd = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <AddErpDialog target={TARGET} takenNames={['Acme ERP']} onAdd={onAdd} onClose={jest.fn()} />
        </Provider>,
    );
    await flush();
    return { onAdd };
}

const radio = (name: RegExp) => screen.getByRole('radio', { name });
const addButton = () => screen.getByRole('button', { name: /^add$/i });
/** The core Modal's action buttons are focusable divs, so disabled reads off aria-disabled. */
const addDisabled = () => addButton().getAttribute('aria-disabled') === 'true';
function typeName(name: string): void {
    fireEvent.change(screen.getByLabelText('ERP name'), { target: { value: name } });
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('AddErpDialog — the question and its default', () => {
    it('asks the store once, shows the hint and the three options with what each would give', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('Brand B ERP');

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('getErpOwnershipOptions', { id: 'erp-integration' });
        expect(screen.getByText(SPLIT_HINT)).toBeInTheDocument();
        // The default: three websites, none owned yet → the first, ticked, and its count.
        expect(radio(/^sold on these websites — 1 product$/i)).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /^Main Website \(base\) — 1 product$/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /^Justrite \(justrite\) — 2 products$/ })).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: /^Evo \(evo\) — 1 product$/ })).not.toBeChecked();
        // The attribute is the typed name's list id, and its count is read off the products.
        expect(radio(/^carrying this attribute: erp_owner=brand-b — 1 product$/i)).not.toBeChecked();
        expect(radio(/^stocked in these inventory sources — 0 products$/i)).not.toBeChecked();
    });

    it("shows the existing ERP's rule beside the new one, and the rule it is given: the websites left over", async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();

        expect(screen.getByText(TWO_ERPS_NOTE)).toBeInTheDocument();
        expect(
            screen.getByText(
                'Acme ERP: products sold on justrite, evo (now every product; its products change at its next Reset ERPs or Load demo data)',
            ),
        ).toBeInTheDocument();
    });

    it('with one website the default is the attribute, and the existing ERP is given its own', async () => {
        mockRequest.mockResolvedValue(answers({ ...STORE, websites: [STORE.websites[0]] }));
        const { onAdd } = await open();
        typeName('Brand B ERP');

        expect(radio(/^carrying this attribute: erp_owner=brand-b/i)).toBeChecked();
        expect(screen.getByText(/^Acme ERP: products whose erp_owner is acme \(now every product/)).toBeInTheDocument();
        fireEvent.click(addButton());

        expect(onAdd).toHaveBeenCalledWith(
            'Brand B ERP',
            { mode: 'attribute', attribute: 'erp_owner=brand-b' },
            [{ erp: 'acme', owns: { mode: 'attribute', attribute: 'erp_owner=acme' } }],
        );
    });

    it('an existing ERP with a rule of its own is shown as it is, and the default skips its websites', async () => {
        mockRequest.mockResolvedValue(
            answers({ ...STORE, erps: [{ erp: 'acme', name: 'Acme ERP', owns: { mode: 'websites', websites: ['base'] } }] }),
        );
        const { onAdd } = await open();
        typeName('Brand B ERP');

        expect(screen.getByRole('checkbox', { name: /^Justrite/ })).toBeChecked();
        expect(screen.getByText('Acme ERP: products sold on base')).toBeInTheDocument();
        fireEvent.click(addButton());

        expect(onAdd).toHaveBeenCalledWith('Brand B ERP', { mode: 'websites', websites: ['justrite'] }, []);
    });
});

describe('AddErpDialog — choosing', () => {
    it('hands Add the websites ticked, and the existing ERP the rest', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        const { onAdd } = await open();
        typeName('Brand B ERP');

        fireEvent.click(screen.getByRole('checkbox', { name: /^Justrite/ }));
        fireEvent.click(screen.getByRole('checkbox', { name: /^Main Website/ }));
        expect(radio(/^sold on these websites — 2 products$/i)).toBeChecked();
        fireEvent.click(addButton());

        expect(onAdd).toHaveBeenCalledWith(
            'Brand B ERP',
            { mode: 'websites', websites: ['justrite'] },
            [{ erp: 'acme', owns: { mode: 'websites', websites: ['base', 'evo'] } }],
        );
    });

    it('sources: Add waits for a tick, then hands the sources ticked', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        const { onAdd } = await open();
        typeName('Brand B ERP');

        fireEvent.click(radio(/^stocked in these inventory sources/i));
        expect(addDisabled()).toBe(true);
        const west = screen.getByRole('checkbox', { name: /^West DC \(west\) — 1 product$/ });
        fireEvent.click(west);
        expect(addDisabled()).toBe(false);
        fireEvent.click(addButton());

        expect(onAdd).toHaveBeenCalledWith(
            'Brand B ERP',
            { mode: 'sources', sources: ['west'] },
            [{ erp: 'acme', owns: { mode: 'attribute', attribute: 'erp_owner=acme' } }],
        );
    });

    it('a name the project already has is refused, and Add stays off', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('acme erp');

        expect(screen.getByText('An ERP named "acme ERP" is already in this project. Pick another name.')).toBeInTheDocument();
        expect(addDisabled()).toBe(true);
    });
});

describe('AddErpDialog — the name ends in ERP', () => {
    it('a name without "ERP" is added with it, and the dialog says so', async () => {
        mockRequest.mockResolvedValue(answers({ ...STORE, websites: [STORE.websites[0]] }));
        const { onAdd } = await open();
        typeName('Brand B');

        expect(screen.getByText('Added as “Brand B ERP”.')).toBeInTheDocument();
        fireEvent.click(addButton());

        expect(onAdd).toHaveBeenCalledWith('Brand B ERP', { mode: 'attribute', attribute: 'erp_owner=brand-b' }, expect.any(Array));
    });

    it('checks the name it will be added as for duplicates', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('acme');

        expect(screen.getByText('An ERP named "acme ERP" is already in this project. Pick another name.')).toBeInTheDocument();
        expect(addDisabled()).toBe(true);
    });

    it('checks the length of the name it will be added as', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('x'.repeat(38));

        expect(screen.getByText('An ERP name is at most 40 characters.')).toBeInTheDocument();
        expect(addDisabled()).toBe(true);
    });
});

describe('AddErpDialog — before and without the store', () => {
    it('counts read "…" while the store is being read', async () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));
        await open();

        expect(radio(/^carrying this attribute: erp_owner=erp — … products$/i)).toBeChecked();
        expect(radio(/^sold on these websites — … products$/i)).toBeInTheDocument();
    });

    it('a store that could not be read says why; the attribute is the default and Add still works', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        const { onAdd } = await open();
        typeName('Brand B ERP');

        expect(screen.getByText('Adobe sign-in required.')).toBeInTheDocument();
        expect(screen.queryByText(TWO_ERPS_NOTE)).toBeNull();
        expect(radio(/^carrying this attribute: erp_owner=brand-b — 0 products$/i)).toBeChecked();
        fireEvent.click(addButton());

        expect(onAdd).toHaveBeenCalledWith('Brand B ERP', { mode: 'attribute', attribute: 'erp_owner=brand-b' }, []);
    });

    it('renders nothing while closed, and asks the store nothing', async () => {
        render(
            <Provider theme={defaultTheme}>
                <AddErpDialog takenNames={[]} onAdd={jest.fn()} onClose={jest.fn()} />
            </Provider>,
        );
        await flush();

        expect(within(screen.getByTestId('spectrum-dialog-container')).queryByRole('dialog')).toBeNull();
        expect(mockRequest).not.toHaveBeenCalled();
    });
});
