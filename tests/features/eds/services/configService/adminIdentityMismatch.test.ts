/**
 * Whether a site's admin role most likely went to a different identity than the
 * one Demo Builder signs in to Adobe with.
 *
 * AEM Code Sync gives the admin role to the primary email of the GitHub account
 * that installed it (Adobe's setup page said "We are using the primary email
 * address set in the GitHub account"; research 2026-09-15). Demo Builder calls
 * the Configuration Service as the SC's Adobe identity. When the two differ, the
 * site refuses its own owner, and nothing in the old messages said why
 * (reported 2026-09-15: kmanns, a personal GitHub email).
 */

import {
    describeAdminIdentityMismatch,
    findAdminIdentityMismatch,
} from '@/features/eds/services/configService/adminIdentityMismatch';

const PERSONAL = { email: 'khalil@example.com', primary: true, verified: true };
const WORK = { email: 'sc@adobe.example', primary: false, verified: true };

describe('findAdminIdentityMismatch', () => {
    it('names both emails when the GitHub primary email is not the Adobe identity', () => {
        expect(findAdminIdentityMismatch('sc@adobe.example', [PERSONAL, WORK])).toEqual({
            githubPrimaryEmail: 'khalil@example.com',
            adobeEmail: 'sc@adobe.example',
        });
    });

    it('answers nothing when the primary email IS the Adobe identity, whatever its case', () => {
        expect(findAdminIdentityMismatch('SC@Adobe.Example', [{ ...WORK, primary: true }])).toBeUndefined();
    });

    it('answers nothing when either side is unknown: no Adobe email, no emails, no primary', () => {
        expect(findAdminIdentityMismatch(null, [PERSONAL])).toBeUndefined();
        expect(findAdminIdentityMismatch('sc@adobe.example', [])).toBeUndefined();
        expect(findAdminIdentityMismatch('sc@adobe.example', [{ ...PERSONAL, primary: false }])).toBeUndefined();
    });
});

describe('describeAdminIdentityMismatch', () => {
    it('says what happened and what to do, naming both addresses and the site', () => {
        const sentence = describeAdminIdentityMismatch(
            { githubPrimaryEmail: 'khalil@example.com', adobeEmail: 'sc@adobe.example' },
            'kmanns/wire',
        );
        expect(sentence).toBe(
            'AEM Code Sync gives the admin role to the primary email of the GitHub account that ' +
                'installed it. Your GitHub primary email is khalil@example.com, but Demo Builder ' +
                'signs in to Adobe as sc@adobe.example, so kmanns/wire refuses it. Sign in to AEM as ' +
                'khalil@example.com and add sc@adobe.example as an admin in AEM\'s User Admin tool, ' +
                'or ask Adobe to add it.',
        );
    });
});
