/**
 * GitHubRepoOperations — an ORGANIZATION's refusals reach the SC in words that say
 * what to do (EDS-17), instead of "Access denied". The wording itself is pinned in
 * githubOrgRefusal.test.ts; this suite pins that every 403 branch of the reads
 * consults it, that an ordinary 403 keeps its old message, and that the list
 * reports the SSO gap GitHub only names in a header. The create and delete
 * refusals moved with the code to githubRepoLifecycle-orgRefusals.test.ts.
 */

import { createTokenService, GitHubRepoOperations, mockRequest } from './githubRepoOperations.testUtils';
import { createMockLogger } from '../../../../helpers/loggerFake';

const SAML = 'Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.';

function refusal(message: string, headers: Record<string, string> = {}) {
    return Object.assign(new Error(message), { status: 403, response: { headers, data: { message } } });
}

describe('GitHubRepoOperations — organization refusals', () => {
    let logger: ReturnType<typeof createMockLogger>;
    const build = () => new GitHubRepoOperations(createTokenService(), logger);

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
    });

    it('getRepository names single sign-on for an SSO-protected org', async () => {
        mockRequest.mockRejectedValue(refusal(SAML));
        await expect(build().getRepository('acme', 'site')).rejects.toThrow(/acme requires single sign-on/);
    });

    it('checkRepositoryAccess answers the SSO explanation as its error', async () => {
        mockRequest.mockRejectedValue(refusal(SAML));
        const result = await build().checkRepositoryAccess('acme', 'site');
        expect(result.hasAccess).toBe(false);
        expect(result.error).toMatch(/acme requires single sign-on/);
    });

    it('an ordinary 403 keeps the message it always had', async () => {
        mockRequest.mockRejectedValue(refusal('Must have admin rights to Repository.'));
        await expect(build().getRepository('acme', 'site')).rejects.toThrow('Access denied to this repository');
    });

    it('logs when GitHub left out an SSO organization’s repositories from the list', async () => {
        mockRequest.mockResolvedValue({
            data: [],
            headers: { 'x-github-sso': 'partial-results; organizations=21955855' },
        });
        await build().listUserRepositories();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('logs nothing when the list is complete', async () => {
        mockRequest.mockResolvedValue({ data: [], headers: {} });
        await build().listUserRepositories();
        expect(logger.warn).not.toHaveBeenCalled();
    });
});
