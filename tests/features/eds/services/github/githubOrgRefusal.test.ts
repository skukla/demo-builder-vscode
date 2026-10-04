/**
 * explainOrgRefusal — the three 403s an ORGANIZATION gives that are not "you
 * lack access to this repository" (EDS-17). Each fixture carries GitHub's own
 * wording, read from real reports: the SAML text from
 * remotion-dev/github-unwrapped#189, the OAuth restriction text from
 * lofi-tools/todo-lofi#9, the create refusal from octokit/rest.js#383 (403).
 * The header format is from docs.github.com/en/rest/authentication/
 * authenticating-to-the-rest-api (read 2026-10-04).
 */

import { explainOrgRefusal } from '@/features/eds/services/github/githubOrgRefusal';

function refusal(status: number, message: string, headers: Record<string, string> = {}) {
    return Object.assign(new Error(message), {
        status,
        response: { headers, data: { message } },
    });
}

describe('explainOrgRefusal', () => {
    it('names single sign-on and passes on the authorization link GitHub sends', () => {
        const error = refusal(
            403,
            'Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.',
            { 'x-github-sso': 'required; url=https://github.com/orgs/acme/sso?authorization_request=abc' },
        );
        const text = explainOrgRefusal(error, 'acme');
        expect(text).toContain('acme');
        expect(text).toContain('single sign-on');
        expect(text).toContain('https://github.com/orgs/acme/sso?authorization_request=abc');
    });

    it('recognises the SAML refusal by its wording when the header is absent', () => {
        const error = refusal(403, 'Resource protected by organization SAML enforcement.');
        const text = explainOrgRefusal(error, 'acme');
        expect(text).toContain('single sign-on');
        expect(text).not.toContain('undefined');
    });

    it('names the OAuth app approval and the steps to request it', () => {
        const error = refusal(
            403,
            'Although you appear to have the correct authorization credentials, the `acme` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.',
        );
        const text = explainOrgRefusal(error, 'acme');
        expect(text).toContain('Authorized OAuth Apps');
        expect(text).toContain('Request access');
    });

    it('turns the org create refusal into what to ask an owner for', () => {
        const error = refusal(403, 'You need admin access to the organization before adding a repository to it.');
        const text = explainOrgRefusal(error, 'acme');
        expect(text).toContain('empty repository');
        expect(text).toContain('write access');
    });

    it('leaves every other error alone, so the caller keeps its own wording', () => {
        expect(explainOrgRefusal(refusal(403, 'Must have admin rights to Repository.'), 'acme')).toBeUndefined();
        expect(explainOrgRefusal(refusal(404, 'Not Found'), 'acme')).toBeUndefined();
        expect(explainOrgRefusal(new Error('socket hang up'), 'acme')).toBeUndefined();
        expect(explainOrgRefusal(undefined, 'acme')).toBeUndefined();
    });
});
