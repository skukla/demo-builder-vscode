/**
 * Data type dependency selection in the import modal.
 *
 * Selecting part of a datapack has to produce a coherent set: `products` cannot
 * import without the types its substitutions look up — an attribute set NAME, a
 * category URL KEY, a customer group CODE. Getting that wrong fails the whole
 * products type, and until now the only guard was a hardcoded warning covering
 * one of the three.
 *
 * Edges come from `importDependencies`, NOT the export catalogue — see that
 * module for the bodea measurement that rules the export edges out.
 *
 * The default pack is `['categories', 'products']`, which exercises both halves
 * at once: `categories` is present and gets auto-ticked, while `attribute_sets`
 * and `customer_groups` are absent and can only be reported.
 *
 * Assertions about the missing-dependency notice match its own phrase rather
 * than a type name: in a pack that HOLDS `attribute_sets`, the name is also a
 * checkbox label, so a name-based query would match the wrong node.
 */

import { screen, within } from '@testing-library/react';
import { awaitForm, press, renderModal, resetModalMocks } from './ImportDatapackModal.testUtils';

const box = (name: string) => screen.getByRole('checkbox', { name });
const notice = () => screen.queryByText(/not in this datapack/i);

beforeEach(() => {
    resetModalMocks();
});

describe('selecting a type selects what it needs', () => {
    it('ticks categories when products is ticked', async () => {
        renderModal();
        await awaitForm();

        await press(box('Products'));

        expect(box('Products')).toBeChecked();
        expect(box('Categories')).toBeChecked();
    });

    it('does not drag products in when categories is ticked alone', async () => {
        renderModal();
        await awaitForm();

        await press(box('Categories'));

        expect(box('Categories')).toBeChecked();
        expect(box('Products')).not.toBeChecked();
    });
});

describe('a needed type cannot be unticked', () => {
    it('disables categories while products is selected', async () => {
        renderModal();
        await awaitForm();

        await press(box('Products'));

        expect(box('Categories')).toBeDisabled();
    });

    it('releases categories once products is unticked', async () => {
        renderModal();
        await awaitForm();

        await press(box('Products'));
        await press(box('Products'));

        expect(box('Products')).not.toBeChecked();
        expect(box('Categories')).not.toBeDisabled();
    });

    it('clears the dependencies it pulled in', async () => {
        renderModal();
        await awaitForm();

        await press(box('Products'));
        await press(box('Products'));

        // Otherwise one click leaves categories selected that nobody chose, and
        // the next Start imports it into a live instance.
        expect(box('Categories')).not.toBeChecked();
    });

    it('keeps a dependency the user had ticked FIRST', async () => {
        renderModal();
        await awaitForm();

        // Deliberate order: categories is the user's choice before products
        // ever borrows it, so unticking products must not throw it away.
        await press(box('Categories'));
        await press(box('Products'));
        await press(box('Products'));

        expect(box('Categories')).toBeChecked();
    });

    it('keeps a dependency another selected type still needs', async () => {
        renderModal({
            availableTypes: ['categories', 'products', 'customer_groups', 'customers'],
        });
        await awaitForm();

        // products and customers both need customer_groups. Dropping products
        // must not strip what customers still depends on.
        await press(box('Products'));
        await press(box('Customers'));
        await press(box('Products'));

        expect(box('Customer groups')).toBeChecked();
        expect(box('Customer groups')).toBeDisabled();
    });

    it('leaves products itself free — nothing in the pack needs it', async () => {
        renderModal();
        await awaitForm();

        await press(box('Products'));

        expect(box('Products')).not.toBeDisabled();
    });
});

describe('dependencies the pack does not contain', () => {
    it('names them once the dependent type is selected', async () => {
        renderModal();
        await awaitForm();

        await press(box('Products'));

        const warning = notice();
        expect(warning).toBeInTheDocument();
        // Both absent from ['categories', 'products'], so ticking cannot fix
        // either and the user needs to know before the import runs.
        expect(within(warning!).getByText(/attribute sets/i)).toBeInTheDocument();
        expect(within(warning!).getByText(/customer groups/i)).toBeInTheDocument();
    });

    it('warns without gating — the import stays startable', async () => {
        // Carried over from the products/customer_groups block this replaced.
        // A pack can be legitimately partial; the user decides.
        renderModal();
        await awaitForm();

        await press(box('Products'));

        expect(notice()).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /start import/i })).not.toBeDisabled();
    });

    it('says nothing while nothing is selected', async () => {
        renderModal();
        await awaitForm();

        expect(notice()).not.toBeInTheDocument();
    });

    it('says nothing when the selected type needs nothing', async () => {
        renderModal();
        await awaitForm();

        await press(box('Categories'));

        expect(notice()).not.toBeInTheDocument();
    });

    it('stays quiet when the pack holds every dependency', async () => {
        renderModal({
            availableTypes: ['categories', 'products', 'attribute_sets', 'customer_groups'],
        });
        await awaitForm();

        await press(box('Products'));

        expect(notice()).not.toBeInTheDocument();
    });
});
