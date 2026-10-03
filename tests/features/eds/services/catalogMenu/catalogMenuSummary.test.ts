/**
 * What a catalog menu run did, in plain words — the one sentence block both surfaces
 * show: the dashboard dialog renders it, and the agent's tools return it beside the
 * lists so the agent can say it back without composing its own.
 */

import { describeBuild, describeRemoval } from '@/features/eds/services/catalogMenu/catalogMenuSummary';

const BUILD = {
    written: ['/safety-signs', '/safety-signs/exit-signs'],
    skipped: [],
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
                "1 page couldn't be written; run this again to retry (/d: HTTP 500). " +
                "Skipped 1 category whose web address the storefront can't serve (Signs & Labels). " +
                'The catalog menu was already in your nav.',
        );
    });

    it('says plainly when the nav could not take the menu', () => {
        expect(describeBuild({ ...BUILD, nav: 'missing' })).toContain(
            'Your storefront has no nav page, so the menu was not added.',
        );
        expect(describeBuild({ ...BUILD, nav: 'no-menu-list' })).toContain(
            'Your nav has no list for the menu line, so the menu was not added.',
        );
        expect(describeBuild({ ...BUILD, nav: 'failed', navError: 'HTTP 401' })).toContain(
            "Couldn't update your nav (HTTP 401); run this again to retry.",
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
                "1 page couldn't be removed; run this again to retry (/c: unpublish failed). " +
                'The catalog menu was no longer in your nav.',
        );
    });
});
