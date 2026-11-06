/**
 * customerImport — customers made through Commerce's Import API (`customer_composite`), since this store
 * refuses every `POST customers` (2026-11-06). The address columns are the ones a live import took: a
 * customer with group 40 and its San Diego address, read back with both.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { customerImportRows, makeCustomersByImport } from '@/features/data-installer/services/demoBuilderEngine/customerImport';
import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

/** The store's answer to an email search before any import: no one, as Commerce answers it. */
const NOBODY = { [page('customers/search', filterBy('email', 'vip@thelumastory.com'))]: { items: [], total_count: 0 } };

const ADDRESS = { firstname: 'Sharon', lastname: 'Reynolds', street: ['4346 Parkway Street', 'Suite 2'], city: 'San Diego', region: { region_code: 'CA', region: 'California' }, country_id: 'US', postcode: '92103', telephone: '(555) 229-3326', default_billing: true, default_shipping: true };

async function store(answer: () => unknown = () => ({ id: 85, website_id: 6 })) {
    const ctx = await fakeContext(NOBODY, (call) => (call.path === 'customers' ? answer() : {}));
    ctx.session.websiteId = 6;
    ctx.session.websiteCode = 'justrite_test_website';
    ctx.session.storeCode = 'justrite_test_store_us';
    return ctx;
}

describe('customerImportRows', () => {
    it('puts the first address on the customer row and each further one on its own, by email and website', async () => {
        const ctx = await store();
        const second = { ...ADDRESS, street: ['1 Other Road'], default_billing: false, default_shipping: false };

        const { rows } = customerImportRows({ email: 'vip@thelumastory.com', firstname: 'Sharon', lastname: 'Reynolds', group_id: 40, addresses: [ADDRESS, second] }, ctx);

        expect(rows[0]).toEqual({
            email: 'vip@thelumastory.com',
            _website: 'justrite_test_website',
            _store: 'justrite_test_store_us',
            firstname: 'Sharon',
            lastname: 'Reynolds',
            group_id: '40',
            _address_firstname: 'Sharon',
            _address_lastname: 'Reynolds',
            _address_street: '4346 Parkway Street\nSuite 2',
            _address_city: 'San Diego',
            _address_region: 'California',
            _address_country_id: 'US',
            _address_postcode: '92103',
            _address_telephone: '(555) 229-3326',
            _address_default_billing_: '1',
            _address_default_shipping_: '1',
        });
        expect(rows[1]).toMatchObject({ email: 'vip@thelumastory.com', _website: 'justrite_test_website', _address_street: '1 Other Road' });
        expect(rows[1]).not.toHaveProperty('firstname');
    });
});

describe('makeCustomersByImport', () => {
    it('records each customer the import made, with the id the store gave it', async () => {
        const ctx = await store();

        const ids = await makeCustomersByImport(ctx, [customerImportRows({ email: 'VIP@thelumastory.com', firstname: 'Sharon', lastname: 'Reynolds' }, ctx)]);

        expect([...ids]).toEqual([['vip@thelumastory.com', 85]]);
        expect(ctx.recorder.created).toEqual([{ kind: 'customers', id: '85', key: 'vip@thelumastory.com' }]);
        expect(ctx.recorder.pending).toStrictEqual([]);
    });

    it("skips a customer Commerce refuses, in Commerce's words, and leaves nothing pending", async () => {
        const ctx = await store(() => {
            throw new CommerceReadError('Commerce answered 400 for customers: {"message":"Please enter a valid email."}', 400);
        });

        const ids = await makeCustomersByImport(ctx, [customerImportRows({ email: 'vip@thelumastory.com', firstname: 'Sharon', lastname: 'Reynolds' }, ctx)]);

        expect(ids.size).toBe(0);
        expect(ctx.session.skipped).toEqual([{ kind: 'customers', key: 'vip@thelumastory.com', reason: 'Please enter a valid email.' }]);
        expect(ctx.recorder.pending).toStrictEqual([]);
    });
});
