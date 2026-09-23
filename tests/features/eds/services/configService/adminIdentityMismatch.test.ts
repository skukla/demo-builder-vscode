/**
 * Whether a site's admin role most likely went to a different identity than the
 * one Demo Builder signs in to Adobe with.
 *
 * AEM Code Sync gives the admin role to the primary email of the GitHub account
 * that installed it (Adobe's setup page said "We are using the primary email
 * address set in the GitHub account"; research 2026-09-15). Demo Builder calls
 * the Configuration Service as the SC's Adobe identity, so a site can refuse its
 * own owner and nothing said why.
 *
 * The role is minted from whatever was primary AT INSTALL TIME, which nobody can
 * read back. So the check looks at every verified address on the account, not
 * only today's primary: the first report (2026-09-15) came from an account whose
 * primary email had since been changed to the Adobe one, which made the original
 * primary-only comparison silent for exactly the person it was written for.
 */

import {
    describeAdminIdentityMismatch,
    findAdminIdentityMismatch,
} from '@/features/eds/services/configService/adminIdentityMismatch';

const ADOBE = 'sc@adobe.example';
const PERSONAL = { email: 'personal@example.com', primary: true, verified: true };
const PERSONAL_SECOND = { ...PERSONAL, primary: false };
const WORK_PRIMARY = { email: ADOBE, primary: true, verified: true };
const OLD_UNVERIFIED = { email: 'old@example.com', primary: false, verified: false };

describe('findAdminIdentityMismatch', () => {
    it('names the primary email and offers it as the candidate when it is not the Adobe identity', () => {
        expect(findAdminIdentityMismatch(ADOBE, [PERSONAL, { ...WORK_PRIMARY, primary: false }])).toEqual({
            githubPrimaryEmail: 'personal@example.com',
            adobeEmail: ADOBE,
            candidateEmails: ['personal@example.com'],
        });
    });

    it('still answers when the primary email IS the Adobe identity but another verified address exists', () => {
        // The role was minted against whatever was primary when Code Sync was
        // installed. Making the Adobe email primary afterwards does not move it.
        expect(findAdminIdentityMismatch(ADOBE, [WORK_PRIMARY, PERSONAL_SECOND])).toEqual({
            githubPrimaryEmail: ADOBE,
            adobeEmail: ADOBE,
            candidateEmails: ['personal@example.com'],
        });
    });

    it('puts the primary email first among the candidates', () => {
        const other = { email: 'second@example.com', primary: false, verified: true };
        expect(
            findAdminIdentityMismatch(ADOBE, [other, PERSONAL])?.candidateEmails,
        ).toEqual(['personal@example.com', 'second@example.com']);
    });

    it('ignores unverified addresses — GitHub never makes one primary', () => {
        expect(findAdminIdentityMismatch(ADOBE, [WORK_PRIMARY, OLD_UNVERIFIED])).toBeUndefined();
    });

    it('answers nothing when every verified address is the Adobe identity, whatever its case', () => {
        expect(findAdminIdentityMismatch('SC@Adobe.Example', [WORK_PRIMARY])).toBeUndefined();
    });

    it('answers nothing when either side is unknown: no Adobe email, no emails, no primary', () => {
        expect(findAdminIdentityMismatch(null, [PERSONAL])).toBeUndefined();
        expect(findAdminIdentityMismatch(ADOBE, [])).toBeUndefined();
        expect(findAdminIdentityMismatch(ADOBE, [PERSONAL_SECOND])).toBeUndefined();
    });
});

describe('describeAdminIdentityMismatch', () => {
    const LEAD =
        'AEM Code Sync gives the admin role to the primary email of the GitHub account that ' +
        'installed it, as that email was at the time. Demo Builder signs in to Adobe as ' +
        `${ADOBE}, and org/site refuses it. `;

    it('names the primary email as the account to sign in to when it differs', () => {
        const sentence = describeAdminIdentityMismatch(
            {
                githubPrimaryEmail: 'personal@example.com',
                adobeEmail: ADOBE,
                candidateEmails: ['personal@example.com'],
            },
            'org/site',
        );
        expect(sentence).toBe(
            `${LEAD}Your GitHub primary email is personal@example.com. Sign in to AEM as ` +
                `personal@example.com and add ${ADOBE} as an admin in AEM's User Admin tool, or ` +
                'ask Adobe to add it.',
        );
    });

    it('names the other addresses too when the primary email is already the Adobe identity', () => {
        const sentence = describeAdminIdentityMismatch(
            {
                githubPrimaryEmail: ADOBE,
                adobeEmail: ADOBE,
                candidateEmails: ['personal@example.com'],
            },
            'org/site',
        );
        expect(sentence).toBe(
            `${LEAD}Your GitHub primary email is now ${ADOBE} as well, so the role probably sits ` +
                'on an address that was primary earlier: personal@example.com. Sign in to AEM as ' +
                `personal@example.com and add ${ADOBE} as an admin in AEM's User Admin tool, or ` +
                'ask Adobe to add it.',
        );
    });

    it('says "one of those addresses" when it cannot tell which one holds the role', () => {
        const sentence = describeAdminIdentityMismatch(
            {
                githubPrimaryEmail: 'personal@example.com',
                adobeEmail: ADOBE,
                candidateEmails: ['personal@example.com', 'second@example.com'],
            },
            'org/site',
        );
        expect(sentence).toBe(
            `${LEAD}Your GitHub primary email is personal@example.com, and the account also has ` +
                'second@example.com. Sign in to AEM as one of those addresses and add ' +
                `${ADOBE} as an admin in AEM's User Admin tool, or ask Adobe to add it.`,
        );
    });
});
