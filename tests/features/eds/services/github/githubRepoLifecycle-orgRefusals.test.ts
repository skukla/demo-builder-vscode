/**
 * GitHubRepoLifecycle — an ORGANIZATION's refusals reach the SC in words that say
 * what to do (EDS-17), instead of "missing delete_repo scope" or a bare 403. The
 * wording itself is pinned in githubOrgRefusal.test.ts; this suite pins that the
 * create and delete 403 branches consult it, and that an ordinary 403 on delete
 * still blames the scope. Moved from githubRepoOperations-orgRefusals.test.ts with
 * the code on 2026-10-08 (EDS-8).
 */

import { createTokenService, GitHubRepoLifecycle, mockRequest } from './githubRepoLifecycle.testUtils';
import { createMockLogger } from '../../../../helpers/loggerFake';

const SAML = 'Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.';
const CREATE = 'You need admin access to the organization before adding a repository to it.';

function refusal(message: string, headers: Record<string, string> = {}) {
    return Object.assign(new Error(message), { status: 403, response: { headers, data: { message } } });
}

describe('GitHubRepoLifecycle — organization refusals', () => {
    let logger: ReturnType<typeof createMockLogger>;
    const build = () => new GitHubRepoLifecycle(createTokenService(), logger);

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
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
        await expect(build().deleteRepository('acme', 'site')).rejects.toThrow('delete_repo scope');
    });
});
