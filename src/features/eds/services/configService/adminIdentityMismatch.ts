/**
 * Whether a site's admin role most likely went to a different identity than the
 * one Demo Builder signs in to Adobe with, and what to say about it.
 *
 * AEM Code Sync gives the admin role to the primary email of the GitHub account
 * that installed it: Adobe's own setup page said "We are using the primary email
 * address set in the GitHub account" (research,
 * `.rptc/research/site-admin-identity-mismatch/`). Demo Builder calls the
 * Configuration Service as the SC's Adobe identity. When the role sits on a
 * different address, the site refuses its own owner.
 *
 * It is minted from whatever was primary AT INSTALL TIME, and nobody without the
 * role can read back who holds it — so today's primary email is not the whole
 * question. Every VERIFIED address on the account is a candidate; unverified ones
 * are not, because GitHub never makes one primary. The first report this was
 * written for came from an account whose primary email had since been changed to
 * the Adobe one, which a primary-only comparison answers nothing about.
 *
 * This is a strong lead, not proof: the service that assigns the role is not
 * public. So the wording says what Code Sync does and what to try, not that this
 * is certainly the cause.
 *
 * @module features/eds/services/configService/adminIdentityMismatch
 */

import type { GitHubAccountEmail } from '../types';


/** The Adobe identity, and the GitHub addresses that may hold the role instead. */
export interface AdminIdentityMismatch {
    /** The GitHub account's primary email today — which may itself be the Adobe one. */
    githubPrimaryEmail: string;
    adobeEmail: string;
    /** Verified GitHub addresses that are not the Adobe identity, primary first. */
    candidateEmails: string[];
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * The Code Sync identity mismatch, or nothing when either side is unknown or
 * every verified GitHub address already is the Adobe identity.
 */
export function findAdminIdentityMismatch(
    adobeEmail: string | null | undefined,
    githubEmails: readonly GitHubAccountEmail[],
): AdminIdentityMismatch | undefined {
    const verified = githubEmails.filter((entry) => entry.verified);
    const primary = verified.find((entry) => entry.primary)?.email;
    if (!adobeEmail || !primary) return undefined;

    // Primary first: it is the likeliest holder, and the one a person recognises.
    const candidateEmails = verified
        .map((entry) => entry.email)
        .filter((email) => !same(email, adobeEmail))
        .sort((a, b) => Number(same(b, primary)) - Number(same(a, primary)));
    if (candidateEmails.length === 0) return undefined;
    return { githubPrimaryEmail: primary, adobeEmail, candidateEmails };
}

/** Which GitHub addresses the role may sit on, and why they are the ones to try. */
function whichAddresses({ githubPrimaryEmail, adobeEmail, candidateEmails }: AdminIdentityMismatch): string {
    if (same(githubPrimaryEmail, adobeEmail)) {
        return (
            `Your GitHub primary email is now ${adobeEmail} as well, so the role probably sits on ` +
            `an address that was primary earlier: ${candidateEmails.join(', ')}.`
        );
    }
    const rest = candidateEmails.filter((email) => !same(email, githubPrimaryEmail));
    if (rest.length === 0) return `Your GitHub primary email is ${githubPrimaryEmail}.`;
    return `Your GitHub primary email is ${githubPrimaryEmail}, and the account also has ${rest.join(', ')}.`;
}

/** One paragraph for a person: what Code Sync does, which addresses, and what to do. */
export function describeAdminIdentityMismatch(mismatch: AdminIdentityMismatch, site: string): string {
    const { adobeEmail, candidateEmails } = mismatch;
    const signInAs = candidateEmails.length === 1 ? candidateEmails[0] : 'one of those addresses';
    return (
        'AEM Code Sync gives the admin role to the primary email of the GitHub account that ' +
        `installed it, as that email was at the time. Demo Builder signs in to Adobe as ` +
        `${adobeEmail}, and ${site} refuses it. ${whichAddresses(mismatch)} Sign in to AEM as ` +
        `${signInAs} and add ${adobeEmail} as an admin in AEM's User Admin tool, or ask Adobe ` +
        'to add it.'
    );
}
