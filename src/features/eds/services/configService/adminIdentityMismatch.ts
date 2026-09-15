/**
 * Whether a site's admin role most likely went to a different identity than the
 * one Demo Builder signs in to Adobe with, and what to say about it.
 *
 * AEM Code Sync gives the admin role to the primary email of the GitHub account
 * that installed it: Adobe's own setup page said "We are using the primary email
 * address set in the GitHub account" (research,
 * `.rptc/research/site-admin-identity-mismatch/`). Demo Builder calls the
 * Configuration Service as the SC's Adobe identity. When the GitHub primary
 * email is a different address, the site refuses its own owner.
 *
 * This is a strong lead, not proof: the service that assigns the role is not
 * public, and nobody without the role can read who holds it. So the wording says
 * what Code Sync does and what to try, not that this is certainly the cause.
 *
 * @module features/eds/services/configService/adminIdentityMismatch
 */

import type { GitHubAccountEmail } from '../types';


/** The two addresses that differ. */
export interface AdminIdentityMismatch {
    githubPrimaryEmail: string;
    adobeEmail: string;
}

/**
 * The mismatch, or nothing when either side is unknown or the GitHub primary
 * email already is the Adobe identity.
 */
export function findAdminIdentityMismatch(
    adobeEmail: string | null | undefined,
    githubEmails: readonly GitHubAccountEmail[],
): AdminIdentityMismatch | undefined {
    const primary = githubEmails.find((entry) => entry.primary)?.email;
    if (!adobeEmail || !primary) return undefined;
    if (primary.toLowerCase() === adobeEmail.toLowerCase()) return undefined;
    return { githubPrimaryEmail: primary, adobeEmail };
}

/** One paragraph for a person: what Code Sync does, the two addresses, and what to do. */
export function describeAdminIdentityMismatch(mismatch: AdminIdentityMismatch, site: string): string {
    const { githubPrimaryEmail: github, adobeEmail: adobe } = mismatch;
    return (
        'AEM Code Sync gives the admin role to the primary email of the GitHub account that ' +
        `installed it. Your GitHub primary email is ${github}, but Demo Builder signs in to ` +
        `Adobe as ${adobe}, so ${site} refuses it. Sign in to AEM as ${github} and add ${adobe} ` +
        "as an admin in AEM's User Admin tool, or ask Adobe to add it."
    );
}
