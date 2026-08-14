/**
 * Where the pack lands — the website/store target section of the import modal.
 *
 * Targeting is the INTENDED path, not a refinement: the service author confirmed
 * (2026-08-14) that the website is created in Commerce Admin first and then named
 * on the import, and that everything landing on `base` is what skipping the
 * targeting does. So these tests pin three things:
 *
 * - a chosen pair reaches the request,
 * - choosing nothing sends nothing (the service's own default, not an empty string),
 * - the user is told the website has to exist ALREADY, because the failure mode is
 *   "the website I want isn't in this list" and an empty dropdown explains nothing.
 *
 * A third spec file rather than a fourth section: the two existing modal suites are
 * near the 500-line limit.
 */

import { screen, waitFor, fireEvent } from '@testing-library/react';
import { mockRequest, renderModal, resetModalMocks } from './ImportDatapackModal.testUtils';

/** The shape `list-datapack-import-scopes` returns. */
const SCOPES = {
    websites: [
        { code: 'base', name: 'Main Website', storeViews: [{ code: 'default', name: 'Default View' }] },
        { code: 'bodea', name: 'Bodea', storeViews: [{ code: 'bodea_view', name: 'Bodea View' }] },
    ],
};

/** Answer every request type the modal fires on open, scopes included. */
function withScopes(scopes: unknown = SCOPES) {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'list-datapack-import-scopes') return { success: true, data: scopes };
        if (type === 'get-datapack-import-target') {
            return { success: true, data: { instance: 'inst-1', projectName: 'demo' } };
        }
        return { success: true, data: null };
    });
}

/**
 * The hidden select the Spectrum Picker mock exposes, found by its LABEL element.
 *
 * Scoped to `spectrum-picker-label` rather than any matching text: the store-view
 * picker's placeholder is "Choose a store view", so a bare text query for
 * /store view/ matches the label and the placeholder both.
 */
function pickerFor(label: RegExp): HTMLSelectElement {
    const labels = screen.getAllByTestId('spectrum-picker-label');
    const match = labels.find((node) => label.test(node.textContent ?? ''));
    const wrapper = match?.closest('[data-testid="spectrum-picker-wrapper"]');
    return wrapper?.querySelector('[data-testid="spectrum-picker-select"]') as HTMLSelectElement;
}

describe('import targeting', () => {
    beforeEach(() => {
        resetModalMocks();
        withScopes();
    });

    it('offers the discovered websites', async () => {
        renderModal();

        await waitFor(() => expect(pickerFor(/target website/i)).toBeDefined());
        expect(pickerFor(/target website/i)).toHaveTextContent('Bodea');
    });

    it('sends the chosen pair with the import', async () => {
        renderModal();
        await waitFor(() => expect(pickerFor(/target website/i)).toBeDefined());

        fireEvent.change(pickerFor(/target website/i), { target: { value: 'bodea' } });
        await waitFor(() => expect(pickerFor(/store view/i)).toBeDefined());
        fireEvent.change(pickerFor(/store view/i), { target: { value: 'bodea_view' } });

        // canStart also needs a data type; without one the button is disabled.
        fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));
        fireEvent.click(screen.getByRole('button', { name: /start import/i }));

        await waitFor(() => {
            const call = mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-import');
            expect(call?.[1]).toMatchObject({ websiteCode: 'bodea', storeCode: 'bodea_view' });
        });
    });

    /**
     * Omitted, not empty. The service defaults to `base` when the pair is absent,
     * and treats `""` as a value to validate.
     */
    it('sends no target when the user picks nothing', async () => {
        renderModal();
        await waitFor(() => expect(pickerFor(/target website/i)).toBeDefined());

        fireEvent.click(screen.getByRole('checkbox', { name: 'categories' }));
        fireEvent.click(screen.getByRole('button', { name: /start import/i }));

        await waitFor(() => {
            const call = mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-import');
            expect(call?.[1]).not.toHaveProperty('websiteCode');
            expect(call?.[1]).not.toHaveProperty('storeCode');
        });
    });

    /** Choosing a website narrows the store views to that website's own. */
    it('offers only the chosen website’s store views', async () => {
        renderModal();
        await waitFor(() => expect(pickerFor(/target website/i)).toBeDefined());

        fireEvent.change(pickerFor(/target website/i), { target: { value: 'bodea' } });

        await waitFor(() => expect(pickerFor(/store view/i)).toBeDefined());
        const options = Array.from(pickerFor(/store view/i).options).map((o) => o.value);
        expect(options).toContain('bodea_view');
        expect(options).not.toContain('default');
    });

    /**
     * The precondition, stated. `websites` is not an importable type, so a website
     * the user wants but has not created cannot appear — and a short dropdown with
     * no explanation reads as a bug rather than a missing step.
     */
    it('says the website must already exist in Commerce', async () => {
        renderModal();

        await waitFor(() => expect(pickerFor(/target website/i)).toBeDefined());
        expect(screen.getByText(/create it in commerce/i)).toBeInTheDocument();
    });

    /** Discovery is optional: its failure must not block an untargeted import. */
    it('still allows an import when no scopes could be discovered', async () => {
        mockRequest.mockImplementation(async (type: string) =>
            type === 'list-datapack-import-scopes'
                ? { success: false, error: 'Connection timed out.' }
                : { success: true, data: null },
        );
        renderModal();

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /start import/i })).toBeInTheDocument(),
        );
        expect(screen.queryByText(/target website/i)).not.toBeInTheDocument();
    });
});

/**
 * The cross-type dependency that cost a live run on 2026-08-14.
 *
 * Bodea's tier prices name the "Platinum Buyer" customer group; the service
 * resolves that name to an id at import time, and with no `customer_groups`
 * imported the lookup fails and takes the WHOLE `products` type with it — 56
 * products, zero landed. `validate` cannot see it: it checks request shape, not
 * referential integrity.
 *
 * A warning rather than a block: packs whose products carry no tier prices are
 * perfectly importable on their own, and this modal cannot know which is which.
 */
describe('the products/customer_groups dependency', () => {
    beforeEach(() => {
        resetModalMocks();
        withScopes();
    });

    it('warns when products is selected without customer_groups', async () => {
        renderModal({ availableTypes: ['categories', 'customer_groups', 'products'] });

        fireEvent.click(screen.getByRole('checkbox', { name: 'products' }));

        await waitFor(() =>
            // 'tier prices' — NOT /customer_groups/, which is also a checkbox
            // label in the type grid and made this test pass with no warning.
            expect(screen.getByText(/tier prices/i)).toBeInTheDocument(),
        );
        // Still startable — it is a warning, not a gate.
        expect(screen.getByRole('button', { name: /start import/i })).not.toBeDisabled();
    });

    it('drops the warning once customer_groups is selected too', async () => {
        renderModal({ availableTypes: ['categories', 'customer_groups', 'products'] });

        fireEvent.click(screen.getByRole('checkbox', { name: 'products' }));
        await waitFor(() => expect(screen.getByText(/tier prices/i)).toBeInTheDocument());

        fireEvent.click(screen.getByRole('checkbox', { name: 'customer_groups' }));

        await waitFor(() =>
            expect(screen.queryByText(/tier prices/i)).not.toBeInTheDocument(),
        );
    });

    it('says nothing when the pack has no customer_groups to offer', async () => {
        renderModal({ availableTypes: ['categories', 'products'] });

        fireEvent.click(screen.getByRole('checkbox', { name: 'products' }));

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /start import/i })).toBeInTheDocument(),
        );
        expect(screen.queryByText(/tier prices/i)).not.toBeInTheDocument();
    });
});
