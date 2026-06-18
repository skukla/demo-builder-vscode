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

    it('declares the code-loaded /customer/sidebar-fragment orphan (ADR-008)', () => {
        // Loaded by commerce-account-sidebar.js via loadFragment(); nothing in
        // content links to it, so discovery can't reach it — it must be declared.
        expect(RUNTIME_SURFACES.fragments).toContain('/customer/sidebar-fragment');
    });

    it('declares the B2B placeholder sheets derived from boilerplate code (ADR-008)', () => {
        expect(RUNTIME_SURFACES.placeholderSheets).toEqual(
            expect.arrayContaining([
                'placeholders/company', 'placeholders/purchase-order',
                'placeholders/quote-management', 'placeholders/requisition-list',
            ]),
        );
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

    it('does NOT statically list discovery-owned fragments (e.g. /customer/nav)', () => {
        // /customer/nav is EMBEDDED by the account page, so reference-following
        // discovery reaches it — listing it here would be a flaky belt-and-suspenders.
        // Contrast /customer/sidebar-fragment, which is loaded by block JS (nothing
        // links to it) and therefore MUST be declared. The distinction is
        // "is it reachable by crawling?", not "is it under /customer/".
        expect(RUNTIME_SURFACES.fragments).not.toContain('/customer/nav');
        // /customer/orders et al. are likewise discovery-reachable (linked from the
        // nav), so they stay out too.
        expect(RUNTIME_SURFACES.fragments).not.toContain('/customer/orders');
    });

    it('has no empty surface categories (a wiped list would silently drop content)', () => {
        expect(RUNTIME_SURFACES.spreadsheets.length).toBeGreaterThan(0);
        expect(RUNTIME_SURFACES.fragments.length).toBeGreaterThan(0);
        expect(RUNTIME_SURFACES.authPages.length).toBeGreaterThan(0);
        expect(RUNTIME_SURFACES.placeholderSheets.length).toBeGreaterThan(0);
    });
});
