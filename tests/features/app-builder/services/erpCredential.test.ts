/**
 * erpCredential — reading an added ERP's own server-to-server credential (AB-16a).
 *
 * Measured on Bodea, 2026-09-28: Contoso ERP (`demo-erp-2`) lives in its own workspace and
 * answered the integration 401 "Technical account mismatch", because the integration signed
 * with its own workspace's credential. The read must therefore be aimed at the ERP's
 * workspace, not the project's: that targeting is what these pin, by the context the download
 * actually ran under.
 */

import { getActiveOrgContext, type OrgContextTarget } from '@/core/shell/orgContextEnv';
import { erpCredentialReader } from '@/features/app-builder/services/erpCredential';
import { fetchWorkspaceS2SCredential } from '@/features/app-builder/services/runtimeCredentials';
import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    fetchWorkspaceS2SCredential: jest.fn(),
}));

const fetchMock = fetchWorkspaceS2SCredential as jest.MockedFunction<typeof fetchWorkspaceS2SCredential>;
const CONTOSO_WS = { id: 'ws-contoso', name: 'ContosoERP' };
const CREDENTIAL = {
    clientId: 'fake-client',
    clientSecret: 'fake-test-pw-not-a-secret',
    orgId: 'FAKE@AdobeOrg',
    scopes: ['AdobeID'],
    technicalAccountId: 'fake-ta@techacct.adobe.com',
};

const project = createMockProject({ adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-project' } });
const commandManager = createMockCommandExecutor();

describe('erpCredentialReader', () => {
    beforeEach(() => jest.clearAllMocks());

    it("downloads under the ERP's OWN workspace, in the project's org and Console project", async () => {
        let ranUnder: OrgContextTarget | undefined;
        fetchMock.mockImplementation(async () => {
            ranUnder = getActiveOrgContext();
            return CREDENTIAL;
        });
        const read = erpCredentialReader(commandManager, project, { id: 'org-1', code: 'FAKE@AdobeOrg', name: 'Fake Org' });

        await expect(read(CONTOSO_WS)).resolves.toStrictEqual(CREDENTIAL);

        expect(fetchMock).toHaveBeenCalledWith(commandManager, demoBuilderNode());
        expect(ranUnder).toMatchObject({ orgId: 'org-1', orgCode: 'FAKE@AdobeOrg', projectId: 'proj-1', workspaceId: 'ws-contoso' });
    });

    it('refuses, in words, a workspace that holds no server-to-server credential', async () => {
        fetchMock.mockResolvedValue(undefined);
        const read = erpCredentialReader(commandManager, project, undefined);

        await expect(read(CONTOSO_WS)).rejects.toThrow('the ContosoERP workspace has no OAuth server-to-server credential');
    });
});
