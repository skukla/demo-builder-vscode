/**
 * What a catalog menu run did, in plain words — the one sentence block storefront setup,
 * reset and republish report in their progress, logs and results (and on
 * `reset_project` / `republish` as `categoryPages`).
 */

import { describeBuild, describeRemoval } from '@/features/eds/services/catalogMenu/catalogMenuSummary';

const NOTHING_PRUNED = {
    status: 'nothing' as const,
    found: 0,
    liveRemoved: 0,
    previewRemoved: 0,
    summary: 'Helix lists no category pages published on me/shop.',
};

const BUILD = {
    sheet: 'published' as const,
    authored: [] as string[],
    published: ['/safety-signs', '/safety-signs/exit-signs'],
    failed: [],
    deferred: false,
    legacyRemoved: [],
    legacyFailed: [],
    skipped: [],
    unsafe: [],
    template: { status: 'kept' as const, hash: 'h' },
    nav: 'added' as const,
};

const REMOVAL = {
    removed: ['/safety-signs'],
    alreadyGone: [],
    skipped: [],
    failed: [],
    template: 'not-recorded' as const,
    sheet: 'removed' as const,
    nav: 'removed' as const,
};

describe('describeBuild', () => {
    it('says how many pages went live and that the menu is in the nav', () => {
        expect(describeBuild(BUILD)).toBe('Published 2 category pages. Added the catalog menu to your nav.');
    });

    it('says the template was written, and what it is for', () => {
        expect(describeBuild({ ...BUILD, template: { status: 'written', hash: 'h' } })).toContain(
            'Wrote the category page template at /categories/default; edit it to change every category page, ' +
                'then republish.',
        );
    });

    it('says that pages come on first visit on a backend setup does not publish for', () => {
        expect(describeBuild({ ...BUILD, published: [], deferred: true })).toBe(
            'Category pages are published the first time someone opens one. Added the catalog menu to your nav.',
        );
    });

    it('names what failed, what was cleaned up and what could not have a page', () => {
        const text = describeBuild({
            ...BUILD,
            published: ['/a'],
            failed: [{ path: '/d', error: 'HTTP 500' }],
            unsafe: [{ name: 'Sale', urlPath: '%%' }],
            pruned: { ...NOTHING_PRUNED, status: 'removed', found: 2, liveRemoved: 2, previewRemoved: 2 },
            template: { status: 'failed', error: 'DA.live 401' },
            nav: 'already-present',
        });
        expect(text).toBe(
            'Published 1 category page. ' +
                "1 category page couldn't be published; republish the storefront to try again " +
                '(/d: HTTP 500). ' +
                'Took down 2 category pages for categories the store no longer has. ' +
                "Couldn't write the category page template (DA.live 401); category pages use a plain " +
                'layout until it exists. ' +
                "Skipped 1 category whose web address the storefront can't serve (Sale). " +
                'The catalog menu was already in your nav.',
        );
    });

    it('says which pages an author wrote at category addresses are kept in front of the overlay', () => {
        expect(describeBuild({ ...BUILD, authored: ['/apparel'] })).toContain(
            "Kept 1 page you wrote at a category's address (/apparel): the product page overlay leaves it alone.",
        );
    });

    it('says no category page was published when the list of authored pages could not be', () => {
        const text = describeBuild({ ...BUILD, published: [], sheet: { error: 'HTTP 401' } });
        expect(text).toBe(
            "Couldn't publish the list of pages you wrote at category addresses (HTTP 401), so no category " +
                'page was published; republish the storefront to try again. Added the catalog menu to your nav.',
        );
    });

    it('passes a removal that did not finish through in its own words', () => {
        const refused = { ...NOTHING_PRUNED, status: 'refused' as const, summary: 'Category pages were left published.' };
        expect(describeBuild({ ...BUILD, pruned: refused })).toContain('Category pages were left published.');
    });

    it('says what happened to the pages the old model wrote', () => {
        const text = describeBuild({
            ...BUILD,
            legacyRemoved: ['/signs', '/apparel'],
            legacyFailed: [{ path: '/tools', error: 'unpublish refused' }],
            skipped: [{ path: '/gloves', reason: 'edited' }],
        });
        expect(text).toContain(
            'Removed 2 category pages Demo Builder wrote in DA.live; ' +
                'the product page overlay serves those addresses now.',
        );
        expect(text).toContain("1 page couldn't be removed; republish the storefront to try again (/tools: unpublish refused).");
        expect(text).toContain('Left 1 page alone because you edited it (/gloves).');
    });

    it('says plainly when the nav could not take the menu', () => {
        expect(describeBuild({ ...BUILD, nav: 'missing' })).toContain(
            'Your storefront has no nav page, so the menu was not added.',
        );
        expect(describeBuild({ ...BUILD, nav: 'failed', navError: 'HTTP 401' })).toContain(
            "Couldn't update your nav (HTTP 401); republish the storefront to try again.",
        );
    });
});

describe('describeRemoval', () => {
    it('says what came out', () => {
        expect(describeRemoval(REMOVAL)).toBe('Removed 1 category page. Took the catalog menu out of your nav.');
    });

    it('says when there was nothing to remove', () => {
        expect(describeRemoval({ ...REMOVAL, removed: [], nav: 'not-recorded' })).toBe(
            'There is no catalog menu from Demo Builder on this storefront, so nothing was removed.',
        );
    });

    it('names the template and the overlay pages', () => {
        const text = describeRemoval({
            ...REMOVAL,
            removed: [],
            template: 'removed',
            categoryPages: {
                ...NOTHING_PRUNED,
                status: 'removed',
                summary: 'Removed 3 category pages from me/shop, live and preview.',
            },
        });
        expect(text).toBe(
            'Removed the category page template. Removed 3 category pages from me/shop, live and preview. ' +
                'Took the catalog menu out of your nav.',
        );
        expect(describeRemoval({ ...REMOVAL, removed: [], template: 'edited' })).toContain(
            'Left the category page template alone because you edited it.',
        );
    });

    it('says when the list of authored pages could not be taken down', () => {
        expect(describeRemoval({ ...REMOVAL, removed: [], nav: 'not-recorded', sheet: { error: 'HTTP 403' } })).toBe(
            "Couldn't take down the list of pages you wrote at category addresses (HTTP 403); reset the storefront again to retry.",
        );
    });

    it('keeps edited pages and failures in view', () => {
        const text = describeRemoval({
            ...REMOVAL,
            alreadyGone: ['/x'],
            skipped: [{ path: '/b', reason: 'edited' }],
            failed: [{ path: '/c', error: 'unpublish failed' }],
            nav: 'not-present',
        });
        expect(text).toBe(
            'Removed 1 category page. 1 page was already gone. ' +
                'Left 1 page alone because you edited it (/b). ' +
                "1 page couldn't be removed; reset the storefront again to retry (/c: unpublish failed). " +
                'The catalog menu was no longer in your nav.',
        );
    });

    it('says the typed links stayed when a removal keeps the table', () => {
        expect(describeRemoval({ ...REMOVAL, nav: 'removed-kept-links' })).toBe(
            'Removed 1 category page. Took the catalog menu out of your nav and kept the links you typed in its table.',
        );
    });
});

describe('a category that already has its own page', () => {
    it('names the category and the page it uses, one sentence each', () => {
        const text = describeBuild({
            ...BUILD,
            published: ['/apparel'],
            skipped: [
                { path: '/signs', reason: 'has-own-page', name: 'Signs', ownPage: '/safety-signage' },
                { path: '/labels', reason: 'has-own-page', name: 'Labels', ownPage: '/our-labels' },
            ],
        });

        expect(text).toBe(
            'Published 1 category page. Signs uses your page at /safety-signage. ' +
                'Labels uses your page at /our-labels. Added the catalog menu to your nav.',
        );
    });

    it('counts the rest after the first five', () => {
        const skipped = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => ({
            path: `/${n}`,
            reason: 'has-own-page' as const,
            name: n.toUpperCase(),
            ownPage: `/own-${n}`,
        }));

        expect(describeBuild({ ...BUILD, published: [], skipped })).toContain(
            'E uses your page at /own-e. 2 more categories use your own pages.',
        );
    });
});
