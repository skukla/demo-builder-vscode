/**
 * The `customer_groups` and `customers` kinds (datapack-engine step 08): make what the store lacks,
 * leave what it has, record what was made by the pack's name for it, and take back exactly that.
 *
 * Pack rows are Bodea `main`'s, contact details replaced (`commerceB2bFixtures.ts`). The store's
 * copies are the bodies captured live (`CUSTOMER_44`, `GROUP_19`); the searches are not captured
 * and are built here in the shape of those bodies.
 */

import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import {
    CUSTOMER_GROUP_KIND,
    CUSTOMER_KIND,
    customerPackForm,
    groupPackForm,
    installCustomerGroups,
    installCustomers,
    parseCustomerGroupRows,
    parseCustomerRows,
    removeCustomer,
    removeCustomerGroup,
    updateCustomer,
    updateCustomerGroup,
} from '@/features/data-installer/services/demoBuilderEngine/customerKinds';
import { ownedKey } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { BODEA_CUSTOMER_ROWS, BODEA_GROUP_ROWS, CUSTOMER_44, GROUP_19, TEST_PASSWORD } from '../../../../helpers/commerceB2bFixtures';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const groupSearch = (code: string) => page('customerGroups/search', filterBy('customer_group_code', code));
const customerSearch = (email: string) => page('customers/search', filterBy('email', email));
/** The product lookups' own group search (no condition type), which customers' `group_id` goes through. */
const lookupGroup = (code: string) =>
    page(
        'customerGroups/search',
        `&searchCriteria[filterGroups][0][filters][0][field]=customer_group_code&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(code)}`,
    );

describe('customer_groups', () => {
    it('makes a group the store lacks, with its tax class, and records it by its code', async () => {
        const ctx = await fakeContext({ [groupSearch('Platinum Buyer')]: { items: [] } }, () => ({ id: 31, code: 'Platinum Buyer', tax_class_id: 3 }));

        await installCustomerGroups(ctx, parseCustomerGroupRows([BODEA_GROUP_ROWS[1]]));

        expect(ctx.sent).toEqual([{ method: 'POST', path: 'customerGroups', body: { group: { code: 'Platinum Buyer', tax_class_id: 3 } } }]);
        expect(ctx.recorder.created).toEqual([{ kind: CUSTOMER_GROUP_KIND, id: '31', key: 'Platinum Buyer' }]);
    });

    it('leaves a group the store already has, and does not record it', async () => {
        const ctx = await fakeContext({ [groupSearch('Platinum Buyer')]: { items: [{ id: 7, code: 'Platinum Buyer' }] } });

        await installCustomerGroups(ctx, parseCustomerGroupRows([BODEA_GROUP_ROWS[1]]));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    it('does not match a group whose code only resembles the one asked', async () => {
        const ctx = await fakeContext({ [groupSearch('Platinum Buyer')]: { items: [{ id: 7, code: 'Platinum Buyers' }] } }, () => ({ id: 31 }));

        await installCustomerGroups(ctx, parseCustomerGroupRows([BODEA_GROUP_ROWS[1]]));

        expect(ctx.sent).toHaveLength(1);
    });

    it('leaves deleted a group this engine made and the SC deleted since', async () => {
        const ctx = await fakeContext({});
        ctx.session.owned = new Map([[ownedKey(CUSTOMER_GROUP_KIND, 'Platinum Buyer'), null]]);

        await installCustomerGroups(ctx, parseCustomerGroupRows([BODEA_GROUP_ROWS[1]]));

        expect(ctx.sent).toStrictEqual([]);
    });

    it('refuses a row with no code before anything is sent', () => {
        expect(() => parseCustomerGroupRows([{ customer_group: { tax_class_id: 3 } }])).toThrow(/customer groups/);
    });

    it('is taken back by its id, and brought up to the pack by a PUT of the whole group', async () => {
        const ctx = await fakeContext({});

        await removeCustomerGroup(ctx.send, '31');
        await updateCustomerGroup(ctx, '31', BODEA_GROUP_ROWS[1]);

        expect(ctx.sent).toEqual([
            { method: 'DELETE', path: 'customerGroups/31', body: undefined },
            { method: 'PUT', path: 'customerGroups/31', body: { group: { id: 31, code: 'Platinum Buyer', tax_class_id: 3 } } },
        ]);
    });

    it("reads the captured group back in the pack's form: its code and tax class, no ids", () => {
        expect(groupPackForm(GROUP_19)).toEqual({ customer_group: { code: 'Example Studios', tax_class_id: 3 } });
    });
});

describe('customers', () => {
    const SAVVY = 'Admin.Savvy@Example.com';

    async function storeFor(found: unknown[] = []) {
        const ctx = await fakeContext(
            { [customerSearch(SAVVY)]: { items: found }, [lookupGroup('ServerSavvy Solutions')]: { items: [{ id: 31, code: 'ServerSavvy Solutions' }] } },
            () => ({ ...CUSTOMER_44, id: 52 }),
        );
        ctx.session.websiteId = 3;
        ctx.session.storeId = 4;
        return ctx;
    }

    it("makes a customer on the install target's website, its group by code, with the pack's password", async () => {
        const ctx = await storeFor();

        await installCustomers(ctx, parseCustomerRows([BODEA_CUSTOMER_ROWS[0]]));

        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'customers',
                body: {
                    customer: { group_id: 31, email: SAVVY, firstname: 'Sam', lastname: 'Savvy', gender: 2, addresses: [], disable_auto_group_change: 0, website_id: 3, store_id: 4 },
                    password: TEST_PASSWORD,
                },
            },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: CUSTOMER_KIND, id: '52', key: 'admin.savvy@example.com' }]);
    });

    it('never writes the password into the record or the log', async () => {
        const ctx = await storeFor();

        await installCustomers(ctx, parseCustomerRows([BODEA_CUSTOMER_ROWS[0]]));

        expect(JSON.stringify(ctx.recorder.created)).not.toContain(TEST_PASSWORD);
        expect(ctx.logged.join('\n')).not.toContain(TEST_PASSWORD);
    });

    it('leaves a customer the website already has, whatever the case of the email', async () => {
        const ctx = await storeFor([{ ...CUSTOMER_44, email: 'admin.savvy@example.com', website_id: 3 }]);

        await installCustomers(ctx, parseCustomerRows([BODEA_CUSTOMER_ROWS[0]]));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    it('makes one when only another website has an account with that email', async () => {
        const ctx = await storeFor([{ ...CUSTOMER_44, email: SAVVY, website_id: 1 }]);

        await installCustomers(ctx, parseCustomerRows([BODEA_CUSTOMER_ROWS[0]]));

        expect(ctx.sent).toHaveLength(1);
    });

    it("drops the source store's ids and Commerce's own credential fields from what it sends", async () => {
        const ctx = await storeFor();
        const row = { customer: { ...BODEA_CUSTOMER_ROWS[0].customer, id: 9, website_id: 1, store_id: 1, created_at: 'x', default_billing: '12', password_hash: 'h', rp_token: 't' } };

        await installCustomers(ctx, parseCustomerRows([row]));

        const sent = (ctx.sent[0].body as { customer: Record<string, unknown> }).customer;
        expect(Object.keys(sent).sort()).toEqual(['addresses', 'disable_auto_group_change', 'email', 'firstname', 'gender', 'group_id', 'lastname', 'store_id', 'website_id']);
        expect(sent).toMatchObject({ website_id: 3, store_id: 4 });
    });

    it('refuses when the install target names no website, before anything is sent', async () => {
        const ctx = await storeFor();
        ctx.session.websiteId = undefined;

        await expect(installCustomers(ctx, parseCustomerRows([BODEA_CUSTOMER_ROWS[0]]))).rejects.toThrow(/website/);
        expect(ctx.sent).toStrictEqual([]);
    });

    it('refuses a row with no email', () => {
        expect(() => parseCustomerRows([{ customer: { firstname: 'A', lastname: 'B' } }])).toThrow(/customers/);
    });

    it("reads the captured customer back in the pack's form: its group by code, no store ids, no password", async () => {
        const ctx = await fakeContext({ 'customerGroups/19': GROUP_19 });

        const row = await customerPackForm(productLookups(ctx), CUSTOMER_44);

        expect(row).toEqual({
            customer: {
                group_id: 'Example Studios',
                email: 'buyer@example.com',
                firstname: 'Test',
                lastname: 'Buyer',
                addresses: [],
                disable_auto_group_change: 0,
                custom_attributes: CUSTOMER_44.custom_attributes,
            },
        });
    });

    it('is taken back by its id', async () => {
        const ctx = await fakeContext({});

        await removeCustomer(ctx.send, '52');

        expect(ctx.sent).toEqual([{ method: 'DELETE', path: 'customers/52', body: undefined }]);
    });

    it("is brought up to the pack over the store's own copy, keeping its website, and never with a password", async () => {
        const ctx = await fakeContext({ 'customers/44': CUSTOMER_44, [lookupGroup('ServerSavvy Solutions')]: { items: [{ id: 31, code: 'ServerSavvy Solutions' }] } });
        const changed = { customer: { ...BODEA_CUSTOMER_ROWS[0].customer, firstname: 'Samantha' }, password: TEST_PASSWORD };

        await updateCustomer(ctx, '44', changed);

        expect(ctx.sent).toHaveLength(1);
        const [{ method, path, body }] = ctx.sent;
        expect([method, path]).toEqual(['PUT', 'customers/44']);
        expect(JSON.stringify(body)).not.toContain(TEST_PASSWORD);
        expect((body as { customer: Record<string, unknown> }).customer).toMatchObject({ id: 44, firstname: 'Samantha', group_id: 31, website_id: 3, store_id: 3, extension_attributes: CUSTOMER_44.extension_attributes });
    });
});
