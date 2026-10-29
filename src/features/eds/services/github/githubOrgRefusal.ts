/**
 * The 403s a GitHub ORGANIZATION gives that are not "you lack access to this
 * repository", explained in one sentence each (EDS-17).
 *
 * A storefront can live in an organization's repository, and organizations add
 * refusals a personal namespace never gives. Each is recognised by what GitHub
 * itself sends, not guessed:
 *
 * - SAML single sign-on: `X-GitHub-SSO: required; url=…` on a 403 (docs.github.com/
 *   en/rest/authentication/authenticating-to-the-rest-api, read 2026-10-04), with
 *   the body "Resource protected by organization SAML enforcement…". An OAuth app
 *   token needs an active SSO session when it is authorized, and re-authorizing
 *   after the organization turns SSO on (docs.github.com/en/authentication/
 *   authenticating-with-single-sign-on/about-authentication-with-single-sign-on).
 * - OAuth app access restrictions: "…has enabled OAuth App access restrictions…".
 *   A member asks the owners from Settings → Applications → Authorized OAuth Apps
 *   (docs.github.com/…/requesting-organization-approval-for-oauth-apps).
 * - Creating a repository without the right: 403 "You need admin access to the
 *   organization before adding a repository to it." (octokit/rest.js#383). The
 *   item's answer for SCs without creation rights: an owner creates an empty
 *   repository and grants write access, and the SC picks it.
 *
 * Anything else answers undefined, so the caller keeps its own wording.
 *
 * @module features/eds/services/github/githubOrgRefusal
 */

interface RefusalLike {
    status?: number;
    message?: string;
    response?: { headers?: Record<string, unknown>; data?: { message?: string } };
}

/** The link GitHub puts in `X-GitHub-SSO: required; url=<link>`, when it sends one. */
function ssoLink(header: string | undefined): string | undefined {
    const match = header?.match(/url=(\S+)/);
    return match?.[1];
}

/**
 * Explain an organization's refusal, or answer undefined when it is not one.
 *
 * @param error - whatever the GitHub call threw
 * @param owner - the organization (or owner) the call addressed
 * @returns one plain sentence saying what to do, or undefined
 */
export function explainOrgRefusal(error: unknown, owner: string): string | undefined {
    const refusal = error as RefusalLike | undefined;
    if (refusal?.status !== 403) return undefined;
    const message = refusal.response?.data?.message ?? refusal.message ?? '';
    const rawHeader = refusal.response?.headers?.['x-github-sso'];
    const ssoHeader = typeof rawHeader === 'string' ? rawHeader : undefined;

    if (ssoHeader?.startsWith('required') || /SAML enforcement/i.test(message)) {
        const link = ssoLink(ssoHeader);
        return (
            `The GitHub organization ${owner} requires single sign-on, and your GitHub sign-in in ` +
            `VS Code is not authorized for it. Complete the organization's single sign-on on ` +
            `github.com${link ? ` (${link})` : ''}, then sign out of GitHub in VS Code's Accounts ` +
            'menu and sign in again, so the new sign-in is authorized for it.'
        );
    }
    if (/OAuth App access restrictions/i.test(message)) {
        return (
            `The GitHub organization ${owner} has not approved the app VS Code signs in to GitHub ` +
            'through. Ask an owner to approve it, or request it yourself: on github.com, Settings → ' +
            'Applications → Authorized OAuth Apps → the app → Request access next to ' +
            `${owner}.`
        );
    }
    if (/admin access to the organization before adding a repository/i.test(message)) {
        return (
            `You cannot create repositories in ${owner}. Ask an owner of ${owner} to create an ` +
            'empty repository and give you write access, then choose it as an existing repository.'
        );
    }
    return undefined;
}
