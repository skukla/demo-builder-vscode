/**
 * What a catalog menu run did, in plain words — the one sentence block storefront setup,
 * reset and republish report in their progress, logs and results.
 */

import { describeBuild, describeRemoval } from '@/features/eds/services/catalogMenu/catalogMenuSummary';

const BUILD = {
    written: ['/safety-signs', '/safety-signs/exit-signs'],
    skipped: [],
    replaced: [],
    failed: [],
    unsafe: [],
    nav: 'added' as const,
};

const REMOVAL = {
    removed: ['/safety-signs'],
    alreadyGone: [],
    skipped: [],
    failed: [],
    nav: 'removed' as const,
};

describe('describeBuild', () => {
    it('says how many pages went live and that the menu is in the nav', () => {
        expect(describeBuild(BUILD)).toBe(
            'Wrote and published 2 category pages. Added the catalog menu to your nav.',
        );
    });

    it('names what was left alone, what failed and what could not have a page', () => {
        const text = describeBuild({
            ...BUILD,
            written: ['/a'],
            skipped: [
                { path: '/b', reason: 'edited' },
                { path: '/c', reason: 'not-ours' },
            ],
            failed: [{ path: '/d', error: 'HTTP 500' }],
            unsafe: [{ name: 'Signs & Labels', urlPath: 'signs-&-labels' }],
            nav: 'already-present',
        });
        expect(text).toBe(
            'Wrote and published 1 category page. ' +
                'Left 1 page alone because you edited it (/b). ' +
                "Left 1 page alone because Demo Builder didn't write it (/c). " +
                "1 page couldn't be written; republish the storefront to try again (/d: HTTP 500). " +
                "Skipped 1 category whose web address the storefront can't serve (Signs & Labels). " +
                'The catalog menu was already in your nav.',
        );
    });

    it('names a clash by its category as well as its address', () => {
        const text = describeBuild({
            ...BUILD,
            skipped: [{ path: '/apparel', reason: 'not-ours', name: 'Apparel' }],
        });
        expect(text).toContain("Left 1 page alone because Demo Builder didn't write it (Apparel (/apparel)).");
    });

    it('says plainly when the nav could not take the menu', () => {
        expect(describeBuild({ ...BUILD, nav: 'missing' })).toContain(
            'Your storefront has no nav page, so the menu was not added.',
        );
        expect(describeBuild({ ...BUILD, nav: 'no-menu-list' })).toContain(
            'Your nav has no list for the menu line, so the menu was not added.',
        );
        expect(describeBuild({ ...BUILD, nav: 'failed', navError: 'HTTP 401' })).toContain(
            "Couldn't update your nav (HTTP 401); republish the storefront to try again.",
        );
    });
});

describe('describeRemoval', () => {
    it('says what came out', () => {
        expect(describeRemoval(REMOVAL)).toBe(
            'Removed 1 category page. Took the catalog menu out of your nav.',
        );
    });

    it('says when there was nothing to remove', () => {
        expect(
            describeRemoval({ ...REMOVAL, removed: [], nav: 'not-recorded' }),
        ).toBe('There is no catalog menu from Demo Builder on this storefront, so nothing was removed.');
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
});

describe('a category that already has its own page', () => {
    it('names the category and the page it uses, one sentence each', () => {
        const text = describeBuild({
            ...BUILD,
            written: ['/apparel'],
            skipped: [
                { path: '/signs', reason: 'has-own-page', name: 'Signs', ownPage: '/safety-signage' },
                { path: '/labels', reason: 'has-own-page', name: 'Labels', ownPage: '/our-labels' },
            ],
        });

        expect(text).toBe(
            'Wrote and published 1 category page. Signs uses your page at /safety-signage. ' +
                'Labels uses your page at /our-labels. Added the catalog menu to your nav.',
        );
    });

    it('says when a page Demo Builder wrote earlier was taken away in favour of the SC\'s own', () => {
        const text = describeBuild({
            ...BUILD,
            written: [],
            replaced: ['/signs'],
            skipped: [{ path: '/signs', reason: 'has-own-page', name: 'Signs', ownPage: '/safety-signage' }],
            nav: 'links-updated',
        });

        expect(text).toBe(
            'Signs uses your page at /safety-signage. ' +
                'Removed 1 category page Demo Builder wrote earlier, now that you have your own (/signs). ' +
                'Updated the catalog menu links in your nav.',
        );
    });

    it('counts the rest after the first five', () => {
        const skipped = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => ({
            path: `/${n}`,
            reason: 'has-own-page' as const,
            name: n.toUpperCase(),
            ownPage: `/own-${n}`,
        }));

        expect(describeBuild({ ...BUILD, written: [], skipped })).toContain(
            'E uses your page at /own-e. 2 more categories use your own pages.',
        );
    });

    it('says the typed links stayed when a removal keeps the table', () => {
        expect(describeRemoval({ ...REMOVAL, nav: 'removed-kept-links' })).toBe(
            'Removed 1 category page. Took the catalog menu out of your nav and kept the links you typed in its table.',
        );
    });
});
