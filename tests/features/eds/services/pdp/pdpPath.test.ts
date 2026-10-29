/**
 * The product-page path contract.
 *
 * Three parties must agree on it: the storefront's canonical `getProductLink`
 * (which builds links), Helix (which cleans every path it publishes), and the
 * extension (which pre-publishes and probes pages). All three use the same
 * `sanitizeName`; the fixtures below are that rule. ADR-024.
 */

import { pdpPathFor, sanitizeName } from '@/features/eds/services/pdp/pdpPath';

describe('sanitizeName', () => {
    it.each([
        ['DigiWristExplorer', 'digiwristexplorer'],
        ['24-MB01', '24-mb01'],
        ['RRE-805_White_on_CharcoalGray', 'rre-805-white-on-charcoalgray'],
        ['Yale UNOplus-Series A Rachet Lever Hoist', 'yale-unoplus-series-a-rachet-lever-hoist'],
        ['apple-iphone-se/iphone-se', 'apple-iphone-se-iphone-se'],
        ['A&B#1', 'a-b-1'],
        ['café', 'cafe'],
        ['--trim--', 'trim'],
        ['a..b', 'a-b'],
    ])('%p -> %p', (input, expected) => {
        expect(sanitizeName(input)).toBe(expected);
    });

    it('never leaves an underscore, which Helix would rewrite on publish', () => {
        expect(sanitizeName('a_b c_d')).not.toContain('_');
    });

    it('is idempotent, so a published path survives Helix cleaning it again', () => {
        const once = sanitizeName('RRE-805_White on/Charcoal');
        expect(sanitizeName(once)).toBe(once);
    });
});

describe('pdpPathFor', () => {
    it('cleans both segments', () => {
        expect(pdpPathFor('Charcoal_Sign', 'RRE-805_White')).toBe('/products/charcoal-sign/rre-805-white');
    });
});
