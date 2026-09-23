/**
 * Whether the GitHub account's primary email is the identity Demo Builder signs in
 * to Adobe with — and why that matters BEFORE the fix is attempted, not after.
 *
 * AEM Code Sync mints the site admin role for the GitHub account's PRIMARY email as
 * it stands when the app is installed. So the primary email is a precondition of the
 * remedy in `noAdminRoleRemedy.ts`: reinstall with the wrong address primary and the
 * role is granted to the wrong address, which looks exactly like the reinstall
 * having failed.
 *
 * ## This used to give different advice, and the advice was wrong
 *
 * Until 2026-09-23 it said the role probably sat on the other address and told the
 * user to sign in to AEM as that address. That was a reasonable theory and it was
 * tested that day on the one real case: the other address was signed in to
 * successfully and refused exactly as the first had been. Neither address held the
 * role — the roster held nobody — so naming an address to go and use was advice
 * that could not work.
 *
 * It also briefly reported EVERY verified address as a candidate, for the same
 * theory. That is gone with it: once the remedy is "reinstall, which mints against
 * today's primary", which old address might have held the role stops being a
 * question anyone needs answered.
 *
 * What survives is the part that is load-bearing: if the primary email is not the
 * Adobe one, say so, because the fix will not work until it is.
 *
 * @module features/eds/services/configService/adminIdentityMismatch
 */

import type { GitHubAccountEmail } from '../types';


/** The two addresses that differ, when they do. */
export interface AdminIdentityMismatch {
    githubPrimaryEmail: string;
    adobeEmail: string;
}

/**
 * The mismatch, or nothing when either side is unknown or the primary email already
 * IS the Adobe identity — in which case the reinstall will mint the right address
 * and there is nothing to warn about.
 *
 * Only a verified address can be primary on GitHub, so unverified ones are ignored.
 */
export function findAdminIdentityMismatch(
    adobeEmail: string | null | undefined,
    githubEmails: readonly GitHubAccountEmail[],
): AdminIdentityMismatch | undefined {
    const primary = githubEmails.find((entry) => entry.verified && entry.primary)?.email;
    if (!adobeEmail || !primary) return undefined;
    if (primary.toLowerCase() === adobeEmail.toLowerCase()) return undefined;
    return { githubPrimaryEmail: primary, adobeEmail };
}

/** One paragraph: what to change on GitHub, and what happens if it is not changed. */
export function describeAdminIdentityMismatch(mismatch: AdminIdentityMismatch): string {
    const { githubPrimaryEmail: github, adobeEmail: adobe } = mismatch;
    return (
        `Before you reinstall, change your GitHub primary email. It is ${github}, but Demo ` +
        `Builder signs in to Adobe as ${adobe}, and AEM Code Sync grants the role to whichever ` +
        `address is primary when it is installed. Reinstalling as it stands would grant ${github} ` +
        `the role and leave ${adobe} refused exactly as it is now.`
    );
}
