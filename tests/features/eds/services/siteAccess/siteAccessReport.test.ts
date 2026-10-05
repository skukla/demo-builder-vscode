/**
 * siteAccessReport — what the Site access screen says, from what the two
 * headless managers answer. Pure, so every sentence is tested without a webview.
 */

import {
    ACCESS_CONFIRMED,
    adminChangeNotice,
    adminListOf,
    readerChangeNotice,
    readerListOf,
    stillRefused,
} from '@/features/eds/services/siteAccess/siteAccessReport';
import type {
    SiteAccessListing,
    SiteAccessMutation,
} from '@/features/eds/services/configService/siteAccessManagerHeadless';
import type {
    ContentAccessListing,
    ContentAccessMutation,
} from '@/features/eds/services/daLive/contentAccessManagerHeadless';

const SITE = 'acme/storefront';

function listing(overrides: Partial<SiteAccessListing> = {}): SiteAccessListing {
    return { status: 'ok', site: SITE, canManage: true, siteAdmins: [], orgAdmins: [], ...overrides };
}

const MISMATCH = {
    explanation: 'Your GitHub primary email is not your Adobe email.',
    adobeEmail: 'me@adobe.example',
    githubPrimaryEmail: 'me@personal.example',
};

describe('adminListOf', () => {
    it('lists site admins as removable and org admins as not', () => {
        const list = adminListOf(
            listing({ siteAdmins: ['a@x.example'], orgAdmins: ['b@x.example'] }),
            'acme',
        );

        expect(list).toEqual({
            site: SITE,
            canManage: true,
            people: [
                { email: 'a@x.example', role: 'Site admin', removable: true },
                { email: 'b@x.example', role: 'Org admin — every site', removable: false },
            ],
            notice: undefined,
        });
    });

    it('shows someone who is both once, as the site admin they can be removed as', () => {
        const list = adminListOf(
            listing({ siteAdmins: ['A@x.example'], orgAdmins: ['a@x.example'] }),
            'acme',
        );

        expect(list.people).toEqual([{ email: 'A@x.example', role: 'Site admin', removable: true }]);
    });

    it('says a project with no storefront has nothing to manage', () => {
        const list = adminListOf(listing({ status: 'no_site', site: undefined, canManage: false }), '');

        expect(list.canManage).toBe(false);
        expect(list.notice?.message).toMatch(/no Edge Delivery storefront/);
    });

    it('sends a missing credential to sign-in, not to a permissions remedy', () => {
        const list = adminListOf(listing({ status: 'no_credential', canManage: false }), 'acme');

        expect(list.notice?.message).toMatch(/Sign in to DA.live/);
        expect(list.notice?.links).toBeUndefined();
    });

    it('names the org admins when someone visible can grant the role', () => {
        const list = adminListOf(
            listing({ status: 'not_authorized', canManage: false, orgAdmins: ['boss@x.example'] }),
            'acme',
        );

        expect(list.notice?.message).toContain('Ask one of these org admins to add you: boss@x.example.');
        expect(list.notice?.offerWait).toBeUndefined();
    });

    it('offers the GitHub fix and the wait when nobody visible can grant it', () => {
        const list = adminListOf(listing({ status: 'not_authorized', canManage: false }), 'acme');

        expect(list.notice?.message).toMatch(/Nobody who can grant it is visible/);
        expect(list.notice?.links?.map((link) => link.id)).toEqual(['github-app-settings', 'code-sync-app']);
        expect(list.notice?.offerWait).toBe(true);
    });

    it('leads with the email settings when the identity is the problem', () => {
        const list = adminListOf(
            listing({ status: 'not_authorized', canManage: false, identityMismatch: MISMATCH }),
            'acme',
        );

        expect(list.notice?.message).toContain(MISMATCH.explanation);
        expect(list.notice?.links?.[0].id).toBe('github-email-settings');
    });

    it('a read failure says so rather than claiming a permissions problem', () => {
        const list = adminListOf(listing({ status: 'failed', canManage: false }), 'acme');

        expect(list.notice?.message).toMatch(/Could not read the site configuration/);
    });
});

describe('stillRefused', () => {
    it('names both emails in the order that works when the identity is the problem', () => {
        const notice = stillRefused(listing({ identityMismatch: MISMATCH }), 'acme');

        expect(notice.message).toContain(`Make ${MISMATCH.adobeEmail} your primary email`);
        expect(notice.message).toContain(MISMATCH.githubPrimaryEmail);
        expect(notice.offerWait).toBe(true);
    });

    it('otherwise names the reinstall that is the usual miss', () => {
        const notice = stillRefused(listing(), 'acme');

        expect(notice.message).toMatch(/UNINSTALLED and installed again/);
        expect(notice.message).toContain('acme');
    });
});

it('a confirmed grant offers the repair of the refused write', () => {
    expect(ACCESS_CONFIRMED).toMatchObject({ tone: 'success', offerRepair: true });
});

describe('readerListOf', () => {
    function readers(overrides: Partial<ContentAccessListing> = {}): ContentAccessListing {
        return { status: 'ok', org: 'acme', site: 'storefront', readers: [], ...overrides };
    }

    it('lists readers as removable and writers as not', () => {
        const list = readerListOf(
            readers({
                readers: [
                    { email: 'r@x.example', actions: 'read' },
                    { email: 'w@x.example', actions: 'write' },
                ],
            }),
        );

        expect(list).toEqual({
            site: 'acme/storefront',
            canManage: true,
            people: [
                { email: 'r@x.example', role: 'Reads', removable: true },
                { email: 'w@x.example', role: 'Writes', removable: false },
            ],
            notice: undefined,
        });
    });

    it('a refusal names who CAN change it', () => {
        const list = readerListOf(readers({ status: 'not_authorized' }));

        expect(list.canManage).toBe(false);
        expect(list.notice?.message).toMatch(/only the owner of the acme organization/);
    });
});

describe('change notices keep "accepted" and "landed" apart', () => {
    const adminResult = (overrides: Partial<SiteAccessMutation>): SiteAccessMutation => ({
        status: 'ok',
        canManage: true,
        verified: true,
        ...overrides,
    });
    const readerResult = (overrides: Partial<ContentAccessMutation>): ContentAccessMutation => ({
        status: 'ok',
        org: 'acme',
        site: 'storefront',
        verified: true,
        ...overrides,
    });

    it('a verified change is a success in the words given', () => {
        expect(adminChangeNotice(adminResult({}), 'Added.')).toEqual({ tone: 'success', message: 'Added.' });
        expect(readerChangeNotice(readerResult({}), 'Added.')).toEqual({ tone: 'success', message: 'Added.' });
    });

    it('an unverified change is a warning, never a success', () => {
        expect(adminChangeNotice(adminResult({ verified: false }), 'Added.').tone).toBe('warning');
        expect(readerChangeNotice(readerResult({ verified: false }), 'Added.').tone).toBe('warning');
    });

    it('a refused admin change says why', () => {
        const notice = adminChangeNotice(adminResult({ status: 'not_authorized', verified: false }), 'Added.');

        expect(notice.message).toMatch(/you hold no admin role/);
    });

    it('a failed change carries the error', () => {
        const notice = adminChangeNotice(adminResult({ status: 'failed', error: 'boom', verified: false }), 'x');

        expect(notice).toEqual({ tone: 'error', message: 'The change did not go through: boom' });
    });
});
