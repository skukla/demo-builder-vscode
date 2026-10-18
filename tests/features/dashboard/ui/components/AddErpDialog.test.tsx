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
import { NAME_IS_FIXED } from '@/features/project-creation/ui/components/integration-flow/stages/CatalogStage';
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
/** Each preview row as "<name> <count> <meaning>", read off its three pieces of text. */
const rows = () =>
    screen.getAllByTestId('add-erp-preview-row').map((row) =>
        Array.from(row.querySelectorAll('[data-testid="spectrum-text"]')).map((text) => text.textContent).join(' | '),
    );
function typeName(name: string): void {
    // The box's line sits inside its label in the shared mock, so match the start.
    fireEvent.change(screen.getByLabelText(new RegExp(`^${ADD_ERP_COPY.nameLabel}`)), { target: { value: name } });
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('AddErpDialog — the question and its default', () => {
    it('asks the store once, and offers the two options, with one line for the selected one', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('Brand B ERP');

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('getErpOwnershipOptions', { id: 'erp-integration' });
        // One line under the choices, saying what the SELECTED one means (owner, 2026-10-18).
        expect(screen.getByText(PICKER_COPY.attributeHelp)).toBeInTheDocument();
        expect(screen.queryByText(PICKER_COPY.websitesHelp)).toBeNull();
        // The default is the attribute (owner, 2026-10-09). The websites option ticks nothing yet.
        expect(attributeRadio()).toBeChecked();
        fireEvent.click(websitesRadio());
        expect(screen.getByText(PICKER_COPY.websitesHelp)).toBeInTheDocument();
        expect(screen.queryByText(PICKER_COPY.attributeHelp)).toBeNull();
    });

    // Owner, 2026-10-18: simplify. The counts live in ONE place, "After adding"; the
    // options carry no count of their own and no attribute code (the SC tags products
    // with Assign products, never by typing erp_owner).
    it('shows no count and no attribute code on the options themselves', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('Brand B ERP');

        expect(screen.queryByText(/It would own/)).toBeNull();
        expect(screen.queryByText(/erp_owner/)).toBeNull();
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
    // One plain line per ERP, as Assign products shows its preview (the 2026-10-18 audit),
    // in the words of the button the SC presses, never the attribute code or SKUs.
    it('shows what every ERP will own, one line each, the catch-all included', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('Brand B ERP');

        expect(screen.getByText(ADD_ERP_COPY.afterAdding)).toBeInTheDocument();
        expect(rows()).toStrictEqual([
            'Acme ERP | 2 products | All products not assigned to another ERP',
            'Brand B ERP | 1 product | Products assigned to it',
        ]);
    });

    it('before a name is typed, shows the ERPs as they stand and no nameless new one', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();

        expect(rows()).toStrictEqual(['Acme ERP | 3 products | All products not assigned to another ERP']);
    });

    it('follows the name, and an ERP owning nothing is told what next', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        await open();
        typeName('Evo ERP');

        expect(rows()).toStrictEqual([
            'Acme ERP | 3 products | All products not assigned to another ERP',
            'Evo ERP | 0 products | None yet: assign products to it after adding',
        ]);
    });

    it('follows the rule: a website rule narrows the catch-all and says so', async () => {
        mockRequest.mockResolvedValue(answers(STORE));
        const { onAdd } = await open();
        typeName('Brand B ERP');

        fireEvent.click(websitesRadio());
        expect(addDisabled()).toBe(true);
        fireEvent.click(screen.getByRole('checkbox', { name: /^Justrite/ }));

        // C is sold on justrite AND evo, so the narrowed catch-all and the new ERP both claim it.
        expect(rows()).toStrictEqual([
            'Acme ERP | 2 products | Products sold on Main Website, Evo (changes when this ERP is added)',
            'Brand B ERP | 2 products | Products sold on Justrite',
            'Two ERPs | 1 product | Their orders are refused until a rule changes',
        ]);
        fireEvent.click(addButton());
        expect(onAdd).toHaveBeenCalledWith('Brand B ERP', { mode: 'websites', websites: ['justrite'] });
    });

    it('says what nobody owns and what two ERPs both claim', async () => {
        mockRequest.mockResolvedValue(
            answers({ ...STORE, erps: [{ erp: 'acme', name: 'Acme ERP', owns: { mode: 'attribute', attribute: 'erp_owner=brand-b' } }] }),
        );
        await open();
        typeName('Brand B ERP');

        expect(rows()).toEqual(
            expect.arrayContaining([
                'Nobody | 2 products | Products no ERP owns',
                'Two ERPs | 1 product | Their orders are refused until a rule changes',
            ]),
        );
    });
});

describe('AddErpDialog — the name', () => {
    // The full name shows in the list below, so the name box only says it can't be renamed.
    it('a name without "ERP" is added with it', async () => {
        mockRequest.mockResolvedValue(answers({ ...STORE, websites: [STORE.websites[0]] }));
        const { onAdd } = await open();
        typeName('Brand B');

        expect(screen.getByText(NAME_IS_FIXED)).toBeInTheDocument();
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
    it('while the store is read, ONE loading view says so, whichever choice is showing, and Add works', async () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));
        const { onAdd } = await open();
        typeName('Brand B ERP');

        // One wait, shown once (the 2026-10-18 audit: two spinners showed at once).
        expect(screen.getAllByText(/Reading/)).toHaveLength(1);
        expect(screen.getByText(ADD_ERP_COPY.readingStore)).toBeInTheDocument();
        fireEvent.click(websitesRadio());
        expect(screen.getAllByText(/Reading/)).toHaveLength(1);
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

    // A notice box, as Assign products shows a failed read, with the reason inside, ONCE
    // (the 2026-10-18 audit: a plain sentence, and the reason twice with websites chosen).
    it("a store that could not be read says why, once, in a notice; Add still works", async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        const { onAdd } = await open();
        typeName('Brand B ERP');

        const notice = within(screen.getByTestId('add-erp-read-failed'));
        expect(notice.getByText(ADD_ERP_COPY.readFailed)).toBeInTheDocument();
        expect(notice.getByText('Adobe sign-in required.')).toBeInTheDocument();
        expect(notice.getByText(ADD_ERP_COPY.stillAdd)).toBeInTheDocument();
        fireEvent.click(websitesRadio());
        expect(screen.getAllByText('Adobe sign-in required.')).toHaveLength(1);
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
        // Not even an empty container: it would hold the screen's one dialog slot.
        expect(screen.queryByTestId('spectrum-dialog-container')).toBeNull();
        expect(mockRequest).not.toHaveBeenCalled();
    });
});
