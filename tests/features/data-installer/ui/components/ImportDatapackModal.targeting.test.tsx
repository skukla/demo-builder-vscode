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
 * Discovery that never settles, so the loading state can be asserted.
 *
 * Every other request still answers — a modal that cannot resolve its target
 * renders a different view, and the loading state would never be reached.
 */
function stallScopes() {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'list-datapack-import-scopes') {
            return new Promise(() => {}); // never settles
        }
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
/** Wait until discovery has settled: the picker exists AND is enabled. */
async function awaitScopes(): Promise<void> {
    await waitFor(() => expect(pickerFor(/target website/i)).not.toBeDisabled());
}

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

        await awaitScopes();
        expect(pickerFor(/target website/i)).toHaveTextContent('Bodea');
    });

    it('sends the chosen pair with the import', async () => {
        renderModal();
        await awaitScopes();

        fireEvent.change(pickerFor(/target website/i), { target: { value: 'bodea' } });
        await waitFor(() => expect(pickerFor(/store view/i)).not.toBeDisabled());
        fireEvent.change(pickerFor(/store view/i), { target: { value: 'bodea_view' } });

        // canStart also needs a data type; without one the button is disabled.
        fireEvent.click(screen.getByRole('checkbox', { name: 'Categories' }));
        fireEvent.click(screen.getByRole('button', { name: /start import/i }));

        await waitFor(() => {
            const call = mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-import');
            expect(call?.[1]).toMatchObject({ websiteCode: 'bodea', storeCode: 'bodea_view' });
        });
    });

    /**
     * SUPERSEDED 2026-08-15. This asserted that picking nothing sent no target,
     * because the service defaults to `base`/`default` on absence. The scopes
     * are now really selected when discovery lands, so the pair always ships —
     * equivalent, since the codes come from the instance's own structure, and
     * honest, since the dialog shows what it sends.
     *
     * The client still omits both keys when no target is set; that contract is
     * pinned in the write client's own suite, which is where it matters.
     */
    it('ships the pair rather than relying on the service default', async () => {
        renderModal();
        await awaitScopes();

        fireEvent.click(screen.getByRole('checkbox', { name: 'Categories' }));
        fireEvent.click(screen.getByRole('button', { name: /start import/i }));

        await waitFor(() => {
            const call = mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-import');
            expect(call?.[1]).toHaveProperty('websiteCode');
            expect(call?.[1]).toHaveProperty('storeCode');
        });
    });

    /** Choosing a website narrows the store views to that website's own. */
    it('offers only the chosen website’s store views', async () => {
        renderModal();
        await awaitScopes();

        fireEvent.change(pickerFor(/target website/i), { target: { value: 'bodea' } });

        await waitFor(() => expect(pickerFor(/store view/i)).not.toBeDisabled());
        const options = Array.from(pickerFor(/store view/i).options).map((o) => o.value);
        expect(options).toContain('bodea_view');
        expect(options).not.toContain('default');
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
        // The pickers hold space WHILE loading, so wait for the failure to settle.
        await waitFor(() =>
            expect(screen.queryByTestId('spectrum-picker-label')).not.toBeInTheDocument(),
        );
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

        fireEvent.click(screen.getByRole('checkbox', { name: 'Products' }));

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

        fireEvent.click(screen.getByRole('checkbox', { name: 'Products' }));
        await waitFor(() => expect(screen.getByText(/tier prices/i)).toBeInTheDocument());

        fireEvent.click(screen.getByRole('checkbox', { name: 'Customer groups' }));

        await waitFor(() =>
            expect(screen.queryByText(/tier prices/i)).not.toBeInTheDocument(),
        );
    });

    it('says nothing when the pack has no customer_groups to offer', async () => {
        renderModal({ availableTypes: ['categories', 'products'] });

        fireEvent.click(screen.getByRole('checkbox', { name: 'Products' }));

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /start import/i })).toBeInTheDocument(),
        );
        expect(screen.queryByText(/tier prices/i)).not.toBeInTheDocument();
    });
});

/**
 * The 2026-08-15 redesign, from a live pass over the modal.
 *
 * Six findings, each a decision rather than a defect:
 *
 * 1. The scope pickers appeared out of nowhere when discovery finished. They now
 *    hold their space, disabled, the way `StoreSelectionRow` does — the house
 *    convention for exactly this.
 * 2. No "Change" escape on the target. Changing where data lands means changing
 *    the project, and that belongs on the dashboard, not behind a link in an
 *    import dialog.
 * 3. No target block. The project name is already the panel's context and the
 *    22-character instance id is not something anyone can verify by eye.
 * 4. Placeholders name the DEFAULT WEBSITE, not "Default (base)" — which read as
 *    the default store view and confused the two scopes.
 * 5. No precondition hint. It explained a rule the picker already enforces.
 */
describe('the redesigned target section', () => {
    /** 1. Space is held while discovery runs, rather than appearing late. */
    it('shows the pickers disabled while scopes are still loading', async () => {
        mockRequest.mockImplementation(async (type: string) => {
            if (type === 'list-datapack-import-scopes') {
                return new Promise(() => {}); // never settles
            }
            if (type === 'get-datapack-import-target') {
                return { success: true, data: { instance: 'inst-1', projectName: 'demo-1' } };
            }
            return { success: true, data: null };
        });
        renderModal();

        // Two pickers render (website and store view); the first is the website.
        const pickers = await screen.findAllByTestId('spectrum-picker-select');
        expect(pickers[0]).toBeDisabled();
    });

    /**
     * A spinner, because static text cannot show that anything is still running.
     *
     * The placeholders read "Loading websites…" and "Loading…" — the same
     * sentence twice in adjacent fields, and identical whether the request was in
     * flight or wedged. Discovery waits on a credential fetch plus a Commerce
     * call, so this is seconds rather than a flash. Follows `VerifiedField`: keep
     * the control, disable it, put an indeterminate ProgressCircle beside it.
     */
    it('shows a spinner on each scope field while discovery runs', async () => {
        stallScopes();
        renderModal();

        await screen.findAllByTestId('spectrum-picker-select');

        expect(screen.getByLabelText('Loading websites')).toBeInTheDocument();
        expect(screen.getByLabelText('Loading store views')).toBeInTheDocument();
    });

    /** CONTROL — the spinners are a loading state, not permanent furniture. */
    it('CONTROL — removes both spinners once the scopes arrive', async () => {
        withScopes();
        renderModal();
        await awaitScopes();

        expect(screen.queryByLabelText('Loading websites')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Loading store views')).not.toBeInTheDocument();
    });

    /** The spinner carries "busy"; the placeholder no longer repeats it twice. */
    it('does not repeat the word Loading in the field placeholders', async () => {
        stallScopes();
        renderModal();

        await screen.findAllByTestId('spectrum-picker-select');

        expect(screen.queryByText(/loading websites/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument();
    });

    /**
     * Start must not fire into an unresolved target.
     *
     * `canStart` omitted `scope.loading`, so during the second or two the pickers
     * spin the user could tick types and press Start — and the import landed on
     * the service default (`base`/`default`) rather than the target about to
     * arrive, silently, because the request simply omits the pair.
     */
    it('disables Start import while the target is still resolving', async () => {
        stallScopes();
        renderModal({ availableTypes: ['categories'] });

        await screen.findAllByTestId('spectrum-picker-select');
        fireEvent.click(screen.getByRole('checkbox', { name: 'Categories' }));

        // The shared Modal renders actions as div[role="button"][aria-disabled],
        // not <button disabled>, so jest-dom's toBeDisabled() does not apply —
        // and worse, `.not.toBeDisabled()` passes vacuously on a div. Assert the
        // attribute, as the sibling suites do.
        expect(screen.getByRole('button', { name: /start import/i })).toHaveAttribute(
            'aria-disabled',
            'true',
        );
    });

    /**
     * CONTROL, and the reason gating is safe at all. Targeting is OPTIONAL — an
     * import with no target is legitimate — so a discovery that FAILS must
     * re-enable Start rather than stranding it. `useVSCodeRequest` clears
     * `loading` in its catch as well as on success; this pins that.
     */
    it('CONTROL — re-enables Start when discovery FAILS', async () => {
        mockRequest.mockImplementation(async (type: string) => {
            if (type === 'list-datapack-import-scopes') {
                return { success: false, error: 'discovery unavailable' };
            }
            if (type === 'get-datapack-import-target') {
                return { success: true, data: { instance: 'inst-1', projectName: 'demo' } };
            }
            return { success: true, data: null };
        });
        renderModal({ availableTypes: ['categories'] });

        fireEvent.click(await screen.findByRole('checkbox', { name: 'Categories' }));

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /start import/i })).toHaveAttribute(
                'aria-disabled',
                'false',
            ),
        );
    });

    /** 2 and 3. */
    it('shows no target block and no Change escape', async () => {
        withScopes();
        renderModal();
        await awaitScopes();

        expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/commerce instance/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/inst-1/)).not.toBeInTheDocument();
    });

    /** 4. The default is named, and named as a WEBSITE. */
    it('names the default website instead of saying "Default (base)"', async () => {
        withScopes();
        renderModal();
        await awaitScopes();

        expect(screen.queryByText(/default \(base\)/i)).not.toBeInTheDocument();
        // Appears in the picker button AND its option list; either proves the
        // default is named rather than labelled 'Default (base)'.
        expect(screen.getAllByText(/main website/i).length).toBeGreaterThan(0);
    });

    /** 5. */
    it('drops the precondition hint the picker already enforces', async () => {
        withScopes();
        renderModal();
        await awaitScopes();

        expect(screen.queryByText(/create it in commerce/i)).not.toBeInTheDocument();
    });

    /**
     * Removing the editable instance field must not create a dead end: a project
     * with no reachable instance previously let the user type one.
     */
    it('says so when the project names no instance, instead of a dead form', async () => {
        mockRequest.mockImplementation(async (type: string) =>
            type === 'get-datapack-import-target'
                ? { success: true, data: { projectName: 'demo-1' } }
                : { success: true, data: null },
        );
        renderModal();

        expect(await screen.findByText(/no commerce instance/i)).toBeInTheDocument();
    });
});

/**
 * Defaults are SELECTED, not merely described.
 *
 * The website picker read "Main Website (default)" while the store view still
 * said "Choose a website first" — the modal presented one scope as defaulted and
 * the other as unanswered, which are the same decision. Both are now really
 * selected, so what the dialog shows is what the request carries.
 */
describe('default scope selection', () => {
    beforeEach(() => {
        resetModalMocks();
        withScopes();
    });

    it('selects the default website AND its store view', async () => {
        renderModal();
        await awaitScopes();

        expect(pickerFor(/target website/i)).toHaveValue('base');
        expect(pickerFor(/store view/i)).toHaveValue('default');
    });

    /** Consequence: the pair now ships explicitly rather than being omitted. */
    it('sends the defaulted pair with the import', async () => {
        renderModal();
        await awaitScopes();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Categories' }));
        fireEvent.click(screen.getByRole('button', { name: /start import/i }));

        await waitFor(() => {
            const call = mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-import');
            expect(call?.[1]).toMatchObject({ websiteCode: 'base', storeCode: 'default' });
        });
    });

    /** Choosing another website re-defaults its own store view, not the old one. */
    it('re-defaults the store view when the website changes', async () => {
        renderModal();
        await awaitScopes();

        fireEvent.change(pickerFor(/target website/i), { target: { value: 'bodea' } });

        await waitFor(() => expect(pickerFor(/store view/i)).toHaveValue('bodea_view'));
    });
});
