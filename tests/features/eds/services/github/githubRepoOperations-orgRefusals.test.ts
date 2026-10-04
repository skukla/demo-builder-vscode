/**
 * GitHubRepoOperations — an ORGANIZATION's refusals reach the SC in words that say
 * what to do (EDS-17), instead of "Access denied" or "missing delete_repo scope".
 * The wording itself is pinned in githubOrgRefusal.test.ts; this suite pins that
 * every 403 branch consults it, and that an ordinary 403 keeps its old message.
 */

import { createTokenService, GitHubRepoOperations, mockRequest } from './githubRepoOperations.testUtils';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../../helpers/loggerFake';

const SAML = 'Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.';
const CREATE = 'You need admin access to the organization before adding a repository to it.';

function refusal(message: string, headers: Record<string, string> = {}) {
    return Object.assign(new Error(message), { status: 403, response: { headers, data: { message } } });
}

describe('GitHubRepoOperations — organization refusals', () => {
    let logger: ReturnType<typeof createMockLogger>;
    const build = () => new GitHubRepoOperations(createTokenService(), createMockCommandExecutor(), logger);

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

    it('deleteRepository names single sign-on instead of blaming the delete_repo scope', async () => {
        mockRequest.mockRejectedValue(refusal(SAML));
        await expect(build().deleteRepository('acme', 'site')).rejects.toThrow(/single sign-on/);
    });

    it('createFromTemplate in an org the SC cannot create in says what to ask an owner for', async () => {
        mockRequest.mockRejectedValue(refusal(CREATE));
        await expect(build().createFromTemplate('adobe', 'tpl', 'site', false, 'acme')).rejects.toThrow(
            /Ask an owner of acme to create an empty repository/,
        );
    });

    it('createEmptyRepository in an org the SC cannot create in says the same', async () => {
        mockRequest.mockRejectedValue(refusal(CREATE));
        await expect(build().createEmptyRepository('site', false, 'acme')).rejects.toThrow(
            /Ask an owner of acme to create an empty repository/,
        );
    });

    it('an ordinary 403 keeps the message it always had', async () => {
        mockRequest.mockRejectedValue(refusal('Must have admin rights to Repository.'));
        await expect(build().getRepository('acme', 'site')).rejects.toThrow('Access denied to this repository');
        await expect(build().deleteRepository('acme', 'site')).rejects.toThrow('delete_repo scope');
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
