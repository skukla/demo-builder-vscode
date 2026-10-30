/**
 * What a consent dialog shows of a call's arguments: the authored keys, in order, as a person
 * reads them. A list target (`clear_demo_data`'s stores) is shown, not left as a blank line.
 */

import { renderTargetForConsent } from '@/features/ai/server/consentText';

describe('renderTargetForConsent', () => {
    it('shows a list of flat objects as their values, joined', () => {
        const args = { stores: [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }, { websiteCode: 'bodea' }], token: 'abc' };

        expect(renderTargetForConsent(args, ['stores'])).toBe('Stores: justrite_test_website/justrite_test_store, bodea');
    });

    it('shows scalars as before, masks secret-shaped keys and skips what it cannot show', () => {
        const args = { path: '/products/x', publish: true, token: 'abc', nested: { a: 1 } };

        expect(renderTargetForConsent(args, ['path', 'publish', 'token', 'nested'])).toBe('Path: /products/x\nPublish: true\nToken: ***');
    });
});
