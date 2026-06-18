/**
 * Runtime-surface inventory — coverage test.
 *
 * Guards the single source of truth for storefront surfaces the CDN index omits
 * (config sheets, header/footer fragments, auth-page entry points, reset
 * placeholder overrides) so create + reset can't drift apart again, and so the
 * set is reviewed deliberately when it changes.
 */

import { RUNTIME_SURFACES } from '@/features/eds/services/runtimeSurfaceInventory';

describe('RUNTIME_SURFACES', () => {
    it('declares the config spreadsheets the content-copy backfill needs', () => {
        expect(RUNTIME_SURFACES.spreadsheets).toEqual(
            expect.arrayContaining(['/placeholders', '/redirects', '/metadata', '/sitemap']),
        );
    });

    it('declares the non-indexed runtime fragments', () => {
        expect(RUNTIME_SURFACES.fragments).toEqual(expect.arrayContaining(['/nav', '/footer']));
    });

    it('declares the customer auth pages with their destination block classes', () => {
        expect(RUNTIME_SURFACES.authPages).toEqual([
            { path: '/customer/login', blockClass: 'commerce-login' },
            { path: '/customer/account', blockClass: 'commerce-account' },
            { path: '/customer/create-account', blockClass: 'commerce-create-account' },
        ]);
    });

    it('declares the reset placeholder override sheets', () => {
        expect(RUNTIME_SURFACES.placeholderSheets).toEqual(
            expect.arrayContaining(['placeholders/global', 'placeholders/cart', 'placeholders/account']),
        );
    });

    it('does NOT statically list referenced fragments (e.g. /customer/nav) — discovery owns those', () => {
        // /customer/nav is reached by reference-following from the account page, not
        // by a static probe (the static fragment probe is a bare-URL HEAD, which is
        // unreliable for dropin-adjacent fragments). Keeping it out avoids a flaky
        // probe and a false belt-and-suspenders. If this changes, change deliberately.
        expect(RUNTIME_SURFACES.fragments).not.toContain('/customer/nav');
    });

    it('has no empty surface categories (a wiped list would silently drop content)', () => {
        expect(RUNTIME_SURFACES.spreadsheets.length).toBeGreaterThan(0);
        expect(RUNTIME_SURFACES.fragments.length).toBeGreaterThan(0);
        expect(RUNTIME_SURFACES.authPages.length).toBeGreaterThan(0);
        expect(RUNTIME_SURFACES.placeholderSheets.length).toBeGreaterThan(0);
    });
});
