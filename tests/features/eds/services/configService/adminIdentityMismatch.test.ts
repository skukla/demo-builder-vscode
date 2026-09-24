/*
 * The GitHub primary email, as a PRECONDITION of the reinstall remedy.
 *
 * AEM Code Sync grants the admin role to whichever address is primary when the app
 * is installed. So this exists to stop someone reinstalling with the wrong address
 * primary, getting the role granted to it, and reading that as the fix not working.
 *
 * It used to say the role probably sat on the other address and to go and sign in as
 * it. That was tested on 2026-09-23 against the real case and failed — the other
 * address authenticated fine and was refused identically, because the roster held
 * nobody. The tests for that advice went with it.
 */

import {
    describeAdminIdentityMismatch,
    findAdminIdentityMismatch,
} from '@/features/eds/services/configService/adminIdentityMismatch';

const ADOBE = 'sc@adobe.example';
const PERSONAL_PRIMARY = { email: 'personal@example.com', primary: true, verified: true };
const WORK_PRIMARY = { email: ADOBE, primary: true, verified: true };

describe('findAdminIdentityMismatch', () => {
    it('names both addresses when the primary email is not the Adobe identity', () => {
        expect(findAdminIdentityMismatch(ADOBE, [PERSONAL_PRIMARY, { ...WORK_PRIMARY, primary: false }])).toEqual({
            githubPrimaryEmail: 'personal@example.com',
            adobeEmail: ADOBE,
        });
    });

    it('answers nothing when the primary email IS the Adobe identity, whatever its case', () => {
        // Nothing to warn about: a reinstall will mint the address they want.
        expect(findAdminIdentityMismatch('SC@Adobe.Example', [WORK_PRIMARY])).toBeUndefined();
    });

    it('says nothing about other addresses on the account', () => {
        // The question "which old address might hold it" stopped mattering once the
        // remedy became "reinstall, which mints against today's primary".
        const withSecond = [WORK_PRIMARY, { email: 'old@example.com', primary: false, verified: true }];
        expect(findAdminIdentityMismatch(ADOBE, withSecond)).toBeUndefined();
    });

    it('ignores an unverified address — GitHub never makes one primary', () => {
        const unverifiedPrimary = { email: 'unverified@example.com', primary: true, verified: false };
        expect(findAdminIdentityMismatch(ADOBE, [unverifiedPrimary])).toBeUndefined();
    });

    it('answers nothing when either side is unknown: no Adobe email, no emails, no primary', () => {
        expect(findAdminIdentityMismatch(null, [PERSONAL_PRIMARY])).toBeUndefined();
        expect(findAdminIdentityMismatch(ADOBE, [])).toBeUndefined();
        expect(findAdminIdentityMismatch(ADOBE, [{ ...PERSONAL_PRIMARY, primary: false }])).toBeUndefined();
    });
});

describe('describeAdminIdentityMismatch', () => {
    it('says to change it BEFORE reinstalling, and what happens if it is not changed', () => {
        const sentence = describeAdminIdentityMismatch({
            githubPrimaryEmail: 'personal@example.com',
            adobeEmail: ADOBE,
        });
        expect(sentence).toContain('Before you reinstall');
        expect(sentence).toContain('personal@example.com');
        expect(sentence).toContain(ADOBE);
        // The consequence, not just the instruction: without it this reads as a nicety.
        expect(sentence).toContain('would grant personal@example.com the role');
    });
});
