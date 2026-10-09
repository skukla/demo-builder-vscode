/**
 * AddErpDialog — "Which products belong to this ERP?" inside Add another ERP (AB-64), and the
 * "After adding" preview of what every ERP will own (AB-75).
 *
 * The real Modal over the shared Spectrum mock; only the webview client is mocked. The
 * store's answer is typed to the handler's result (`ErpOwnershipOptionsResult`), so a fixture
 * that drifts from what the extension sends fails to compile. Asserted: the two options and
 * their counts, the default rule, the preview and how it follows the name and the rule, the
 * loading and failed states, and what Add hands back. Strings come from the components' copy
 * objects, so a wording change moves one place.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose: jest.mock hoists within its own module only.
import { ADD_ERP_COPY, AddErpDialog } from '@/features/dashboard/ui/components/AddErpDialog';
import { PICKER_COPY } from '@/features/dashboard/ui/components/ErpOwnershipPicker';
import type { ErpOwnershipOptions, ErpOwnershipOptionsResult } from '@/types/erpOwnership';

const TARGET = { id: 'erp-integration', name: 'Acme ERP Integration' };

/** Three websites; the first ERP still owns everything; one product tagged for the ERP about to be named. */
const STORE: ErpOwnershipOptions = {
    websites: [
        { code: 'base', name: 'Main Website' },
        { code: 'justrite', name: 'Justrite' },
        { code: 'evo', name: 'Evo' },
    ],
    products: [
        { sku: 'A', websiteCodes: ['base'], attributes: {} },
        { sku: 'B', websiteCodes: ['justrite'], attributes: { erp_owner: 'brand-b' } },
        { sku: 'C', websiteCodes: ['justrite', 'evo'], attributes: {} },
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
const attributeRadio = () => radio(new RegExp(`^${PICKER_COPY.attributeLabel}`));
const websitesRadio = () => radio(new RegExp(`^${PICKER_COPY.websitesLabel}`));
const addButton = () => screen.getByRole('button', { name: /^add$/i });
/** The core Modal's action buttons are focusable divs, so disabled reads off aria-disabled. */
const addDisabled = () => addButton().getAttribute('aria-disabled') === 'true';
const preview = () => screen.getByTestId('add-erp-preview');
function typeName(name: string): void {
    fireEvent.change(screen.getByLabelText(ADD_ERP_COPY.nameLabel), { target: { value: name } });
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('AddErpDialog — the question and its default', () => {
    it('asks the store once, and offers the two options, each with what it means and what it gives', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('Brand B ERP');

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('getErpOwnershipOptions', { id: 'erp-integration' });
        expect(screen.getByText(ADD_ERP_COPY.intro(TARGET.name))).toBeInTheDocument();
        expect(screen.getByText(PICKER_COPY.attributeHelp('erp_owner=brand-b'))).toBeInTheDocument();
        expect(screen.getByText(PICKER_COPY.websitesHelp)).toBeInTheDocument();
        // The default is the attribute (owner, 2026-10-09). The websites option ticks nothing yet.
        expect(attributeRadio()).toBeChecked();
        expect(screen.getByText(PICKER_COPY.owns(1))).toBeInTheDocument();
        expect(screen.getByText(PICKER_COPY.owns(0))).toBeInTheDocument();
    });

    it('the default is the attribute; Add hands back the name and the rule, nothing about the existing ERP', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        const { onAdd } = await open();
        typeName('Brand B ERP');
        fireEvent.click(addButton());
        expect(onAdd).toHaveBeenCalledWith('Brand B ERP', { mode: 'attribute', attribute: 'erp_owner=brand-b' });
    });
});

describe('AddErpDialog — After adding', () => {
    it('shows what every ERP will own, the catch-all included, with a few SKUs each', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('Brand B ERP');

        const shown = within(preview());
        expect(screen.getByText(ADD_ERP_COPY.afterAdding)).toBeInTheDocument();
        expect(shown.getByText('Acme ERP: 2 products.')).toBeInTheDocument();
        expect(shown.getByText('Every product no other ERP claims.')).toBeInTheDocument();
        expect(shown.getByText('For example: A, C.')).toBeInTheDocument();
        expect(shown.getByText('Brand B ERP: 1 product.')).toBeInTheDocument();
        expect(shown.getByText('For example: B.')).toBeInTheDocument();
        expect(shown.queryByText(/^Nobody/)).toBeNull();
    });

    it('follows the name: the attribute and the counts move with it, and an ERP owning nothing is told what next', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('Evo ERP');

        const shown = within(preview());
        expect(shown.getByText('Acme ERP: 3 products.')).toBeInTheDocument();
        expect(shown.getByText('Evo ERP: 0 products.')).toBeInTheDocument();
        expect(shown.getByText('Evo ERP will own no products yet. After adding, use Assign products on its card.')).toBeInTheDocument();
    });

    it('follows the rule: a website rule narrows the catch-all and says so', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        const { onAdd } = await open();
        typeName('Brand B ERP');

        fireEvent.click(websitesRadio());
        expect(addDisabled()).toBe(true);
        fireEvent.click(screen.getByRole('checkbox', { name: /^Justrite/ }));

        const shown = within(preview());
        // C is sold on justrite AND evo, so the narrowed catch-all and the new ERP both claim it.
        expect(shown.getByText('Acme ERP: 2 products.')).toBeInTheDocument();
        expect(shown.getByText('Products sold on base, evo. Its rule changes to this when the ERP is added.')).toBeInTheDocument();
        expect(shown.getByText('Brand B ERP: 2 products.')).toBeInTheDocument();
        expect(shown.getByText('Claimed by two ERPs: 1 product.')).toBeInTheDocument();
        fireEvent.click(addButton());
        expect(onAdd).toHaveBeenCalledWith('Brand B ERP', { mode: 'websites', websites: ['justrite'] });
    });

    it('says what nobody owns and what two ERPs both claim', async () => {
        mockRequest.mockResolvedValue(
            answers({ ...STORE, erps: [{ erp: 'acme', name: 'Acme ERP', owns: { mode: 'attribute', attribute: 'erp_owner=brand-b' } }] }),
        );
        await open();
        typeName('Brand B ERP');

        const shown = within(preview());
        expect(shown.getByText('Nobody: 2 products.')).toBeInTheDocument();
        expect(shown.getByText('Claimed by two ERPs: 1 product.')).toBeInTheDocument();
        expect(shown.getByText('Orders for them are refused until one rule changes.')).toBeInTheDocument();
    });
});

describe('AddErpDialog — the name', () => {
    it('a name without "ERP" is added with it, and the dialog says so', async () => {
        mockRequest.mockResolvedValue(answers({ ...STORE, websites: [STORE.websites[0]] }));
        const { onAdd } = await open();
        typeName('Brand B');

        expect(screen.getByText(ADD_ERP_COPY.addedAs('Brand B ERP'))).toBeInTheDocument();
        fireEvent.click(addButton());
        expect(onAdd).toHaveBeenCalledWith('Brand B ERP', { mode: 'attribute', attribute: 'erp_owner=brand-b' });
    });

    it('a name the project already has is refused, and Add stays off', async () => {
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
    it('while the store is read, the counts, the websites and the preview all say so, and Add works', async () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));
        const { onAdd } = await open();
        typeName('Brand B ERP');

        expect(screen.getAllByText(PICKER_COPY.counting)).toHaveLength(2);
        expect(screen.getByText(ADD_ERP_COPY.readingStore)).toBeInTheDocument();
        fireEvent.click(websitesRadio());
        expect(screen.getByText(PICKER_COPY.readingWebsites)).toBeInTheDocument();
        expect(screen.queryByText(PICKER_COPY.noWebsites)).toBeNull();

        fireEvent.click(attributeRadio());
        expect(addDisabled()).toBe(false);
        fireEvent.click(addButton());
        // Nothing about the add waits on the read (AB-72).
        expect(onAdd).toHaveBeenCalledWith('Brand B ERP', { mode: 'attribute', attribute: 'erp_owner=brand-b' });
    });

    it('says "no websites" only when the store answered with none', async () => {
        mockRequest.mockResolvedValue(answers({ ...STORE, websites: [] }));
        await open();
        fireEvent.click(websitesRadio());
        expect(screen.getByText(PICKER_COPY.noWebsites)).toBeInTheDocument();
    });

    it("a store that could not be read says why, in the read's words; Add still works", async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        const { onAdd } = await open();
        typeName('Brand B ERP');

        expect(screen.getByText(ADD_ERP_COPY.readFailed)).toBeInTheDocument();
        fireEvent.click(websitesRadio());
        expect(screen.getByText('Adobe sign-in required.')).toBeInTheDocument();
        fireEvent.click(attributeRadio());
        fireEvent.click(addButton());
        expect(onAdd).toHaveBeenCalledWith('Brand B ERP', { mode: 'attribute', attribute: 'erp_owner=brand-b' });
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
