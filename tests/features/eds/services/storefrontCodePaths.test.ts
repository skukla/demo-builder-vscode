/**
 * deriveStorefrontCodePaths — the site paths a storefront's own JavaScript loads.
 *
 * A copy of a colleague's demo arrived without /cart, /checkout, /search and
 * fifteen more documents its source serves (EDS-40, 2026-10-12). None was in a
 * content index or a backfill list, and every one is written in the storefront's
 * code. This reads them out of the code, for whatever storefront it is handed, so
 * no list of page names has to be kept anywhere.
 *
 * Over-reading is cheap by design: every path this returns is asked for on the
 * source before anything is copied, and a string that is not a document answers 404.
 * So these tests pin what MUST be found, and the few things that must not be,
 * because copying them would do harm.
 */

import {
    deriveStorefrontCodePaths,
    isStorefrontCodeFile,
} from '@/features/eds/services/storefrontCodePaths';
import { STOREFRONT_CODE } from './storefrontCodeFixture';

describe('deriveStorefrontCodePaths, on a real storefront’s lines', () => {
    const derived = deriveStorefrontCodePaths(STOREFRONT_CODE);

    it('finds a page written as a quoted path', () => {
        // rootLink('/cart'), ['/checkout'], rootLink('/search'), a default of '/wishlist'.
        expect(derived).toEqual(expect.arrayContaining(['/cart', '/checkout', '/search', '/wishlist']));
    });

    it('finds a fragment loaded from a default or from a local constant', () => {
        expect(derived).toEqual(
            expect.arrayContaining(['/nav', '/footer', '/mini-cart', '/store-switcher', '/customer/sidebar-fragment']),
        );
    });

    it('finds a route constant written as a plain string', () => {
        expect(derived).toEqual(
            expect.arrayContaining(['/order-details', '/return-details', '/create-return', '/customer']),
        );
    });

    it('resolves a path built from one constant and a literal', () => {
        expect(derived).toEqual(
            expect.arrayContaining([
                '/customer/forgotpassword',
                '/customer/orders',
                '/customer/requisition-list-view',
                '/customer/approval-rule',
                '/customer/approval-rule-details',
                '/customer/purchase-order-details',
            ]),
        );
    });

    it('resolves a path built from two constants', () => {
        expect(derived).toEqual(
            expect.arrayContaining([
                '/customer/order-details',
                '/customer/return-details',
                '/customer/create-return',
            ]),
        );
    });

    it('finds a label sheet from the call that fetches it, as the sheet’s own path', () => {
        expect(derived).toEqual(
            expect.arrayContaining(['/placeholders/checkout.json', '/placeholders/auth.json']),
        );
    });

    it('drops a trailing slash', () => {
        expect(derived).toContain('/sales/guest/view');
        expect(derived).not.toContain('/sales/guest/view/');
    });

    it('returns each path once, sorted', () => {
        expect(derived).toEqual([...new Set(derived)].sort());
    });

    it('leaves out a file served from the repository, whatever its extension', () => {
        // A data file a block reads is code, not content: asked for as a sheet it
        // answers JSON, and copying it as one would write it into DA.live.
        expect(derived.filter((path) => path.includes('/data/'))).toStrictEqual([]);
        expect(derived.filter((path) => path.endsWith('.js'))).toStrictEqual([]);
    });

    it('leaves out an index a block reads, which the storefront builds for itself', () => {
        // fetch(`/${indexFile}.json?limit=…`): a query index is served in a sheet's
        // shape, and a copy of the source's would sit where this site's own belongs.
        expect(derived.filter((path) => path.endsWith('.json') && !path.startsWith('/placeholders/'))).toStrictEqual([]);
    });

    it('leaves out a URL on another host', () => {
        expect(derived).not.toContain('/track');
        expect(derived.filter((path) => path.includes('ups'))).toStrictEqual([]);
    });

    it('leaves out a path that is not site-absolute', () => {
        expect(derived).not.toContain('/products/default');
        expect(derived.filter((path) => path.includes('scripts'))).toStrictEqual([]);
    });
});

describe('deriveStorefrontCodePaths, the edges', () => {
    const derive = (content: string): string[] =>
        deriveStorefrontCodePaths([{ path: 'blocks/x/x.js', content }]);

    it('reads all three kinds of quote', () => {
        expect(derive("a('/one'); b(\"/two\"); c(`/three`);")).toEqual(['/one', '/three', '/two']);
    });

    it('leaves a template alone when part of it is not a known constant', () => {
        expect(derive("const A = '/a';\nconst x = `${A}/${id}`; const y = `${UNKNOWN}/b`;")).toEqual(['/a']);
    });

    it('resolves a constant defined in another file of the set', () => {
        const derived = deriveStorefrontCodePaths([
            { path: 'scripts/routes.js', content: "export const ACCOUNT = '/account';" },
            { path: 'blocks/x/x.js', content: 'go(`${ACCOUNT}/settings`);' },
        ]);
        expect(derived).toEqual(['/account', '/account/settings']);
    });

    it('resolves every value a constant name has across files', () => {
        const derived = deriveStorefrontCodePaths([
            { path: 'blocks/a/a.js', content: "const BASE = '/a';" },
            { path: 'blocks/b/b.js', content: "const BASE = '/b';\ngo(`${BASE}/x`);" },
        ]);
        expect(derived).toEqual(['/a', '/a/x', '/b', '/b/x']);
    });

    it('does not follow a constant that is itself built from constants', () => {
        // One level only: plain string constants. Anything harder is not attempted.
        const code = "const A = '/a';\nconst B = `${A}/b`;\ngo(`${B}/c`);";
        expect(derive(code)).toEqual(['/a', '/a/b']);
    });

    it('reads nothing from a call that fetches no named sheet', () => {
        expect(derive('const labels = await fetchPlaceholders();')).toStrictEqual([]);
    });

    it('never returns the site root or a path with characters a published page cannot have', () => {
        expect(derive("a('/'); b('/Has-Capitals'); c('/with space'); d('/under_score');")).toStrictEqual([]);
    });
});

describe('isStorefrontCodeFile: which files of a repository are read', () => {
    it.each(['blocks/header/header.js', 'scripts/commerce.js', 'scripts/initializers/auth.js'])(
        'reads %s',
        (path) => expect(isStorefrontCodeFile(path)).toBe(true),
    );

    it.each([
        'scripts/__dropins__/storefront-cart/api.js',
        'blocks/header/header.css',
        'tools/sidekick/plugin.js',
        'head.html',
        'cypress/src/tests/cart.spec.js',
        'node_modules/x/blocks/y.js',
    ])('does not read %s', (path) => expect(isStorefrontCodeFile(path)).toBe(false));
});
