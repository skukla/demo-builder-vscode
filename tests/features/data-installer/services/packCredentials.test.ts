/**
 * A pack is never saved with a password in it (datapack-engine step 08). Bodea's customer rows each
 * carry one, top level; a library save, a copy between stores and a zip all leave it out, as do
 * the store-side names Commerce could add. Every other field is kept as it is.
 */

import { withoutCredentials } from '@/features/data-installer/services/packCredentials';
import { BODEA_CUSTOMER_ROWS, TEST_PASSWORD } from '../../../helpers/commerceB2bFixtures';
import { passwordShape } from '../../../helpers/credentialShapes';

describe('withoutCredentials', () => {
    it("drops each customer row's password and keeps everything else", () => {
        const kept = withoutCredentials('customers', BODEA_CUSTOMER_ROWS) as Array<Record<string, unknown>>;

        expect(JSON.stringify(kept)).not.toContain(TEST_PASSWORD);
        expect(kept).toEqual(BODEA_CUSTOMER_ROWS.map(({ customer }) => ({ customer })));
    });

    it("drops Commerce's own credential fields inside a customer too", () => {
        const row = { customer: { email: 'a@example.com', ['password' + '_hash']: passwordShape(), ['rp' + '_token']: passwordShape(), rp_token_created_at: 'z', firstname: 'A' } };

        expect(withoutCredentials('customers', [row])).toEqual([{ customer: { email: 'a@example.com', firstname: 'A' } }]);
    });

    it('drops a password from bulk customer items', () => {
        const records = { source: { entity: 'customer_composite', items: [{ email: 'a@example.com', password: TEST_PASSWORD }] } };

        expect(withoutCredentials('customers_export', records)).toEqual({ source: { entity: 'customer_composite', items: [{ email: 'a@example.com' }] } });
    });

    it('leaves every other kind exactly as it was, the same object', () => {
        const products = [{ product: { sku: 'vrrack', ['pass' + 'word']: passwordShape() } }];

        expect(withoutCredentials('products', products)).toBe(products);
    });

    it('does not change what it was handed', () => {
        const rows = structuredClone(BODEA_CUSTOMER_ROWS);

        withoutCredentials('customers', rows);

        expect(rows).toEqual(BODEA_CUSTOMER_ROWS);
    });
});
