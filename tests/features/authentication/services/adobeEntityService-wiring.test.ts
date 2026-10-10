/**
 * adobeEntityService — the callbacks the factory hands from one service to another.
 *
 * Four of the services are built with a function that reaches a SIBLING service: the
 * reads' token-org source, the workspace listing both Console ops take, the project
 * ops' Runtime-namespace step, and the org reads' "no orgs" hook. None of them shows
 * in the factory's return value, so each is observed where it lands: the sibling's
 * method is spied on the REAL wired services and must receive the arguments the
 * caller passed. A callback emptied out still builds every service and still returns
 * them; only the hand-off goes missing.
 */

import { setupMocks, type TestMocks } from './adobeEntityService.testUtils';
import { getLogger } from '@/core/logging/debugLogger';
import { createMockLogger } from '../../../helpers/loggerFake';

describe('createEntityServices — the callbacks between the services', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());
        testMocks = setupMocks();
    });

    it('gives the project reads a token-org source that asks the org reads', async () => {
        const { entities, mockSDKClient, mockCacheManager, mockCommandExecutor } = testMocks;
        mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
        mockSDKClient.isInitialized.mockReturnValue(true);
        const getProjectsForOrg = jest.fn().mockResolvedValue({
            body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
        });
        mockSDKClient.getClient.mockReturnValue({
            getProjectsForOrg,
        } as ReturnType<typeof mockSDKClient.getClient>);
        const tokenOrgs = jest
            .spyOn(entities.orgReads, 'getOrganizationsSdkOnly')
            .mockResolvedValue([{ id: 'tok-org', code: 'TOK@AdobeOrg', name: 'Token Org' }]);

        await entities.projectReads.getProjects();

        expect(tokenOrgs).toHaveBeenCalledTimes(1);
        expect(getProjectsForOrg).toHaveBeenCalledWith('tok-org');
        expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
    });

    it('gives the project ops the workspace listing and the namespace step, with the ids', async () => {
        const { entities, mockSDKClient, mockCacheManager } = testMocks;
        mockCacheManager.getCachedOrganization.mockReturnValue({
            id: 'org-123',
            code: 'ORG@AdobeOrg',
            name: 'Test Org',
        });
        mockSDKClient.isInitialized.mockReturnValue(true);
        mockSDKClient.ensureInitialized.mockResolvedValue(true);
        mockSDKClient.getClient.mockReturnValue({
            createFireflyProject: jest.fn().mockResolvedValue({ body: { projectId: 'proj-new' } }),
        } as ReturnType<typeof mockSDKClient.getClient>);
        const fetchWorkspaces = jest
            .spyOn(entities.workspaceReads, 'fetchWorkspaces')
            .mockResolvedValue([{ id: 'ws-prod', name: 'Production', title: 'Production' }]);
        const ensureNamespace = jest
            .spyOn(entities.workspaceOps, 'ensureWorkspaceRuntimeNamespace')
            .mockResolvedValue(undefined);

        const created = await entities.projectOps.createProject('My Demo', 'A demo project');

        expect(created).toMatchObject({ id: 'proj-new', org_id: 'org-123' });
        expect(fetchWorkspaces).toHaveBeenCalledWith('org-123', 'proj-new');
        expect(ensureNamespace).toHaveBeenCalledWith('org-123', 'proj-new', 'ws-prod');
    });

    it('tells the selector to clear the CLI context when no org is reachable', async () => {
        const { entities, mockSDKClient, mockCacheManager, mockCommandExecutor } = testMocks;
        mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
        mockSDKClient.isInitialized.mockReturnValue(false);
        mockSDKClient.ensureInitialized.mockResolvedValue(false);
        mockCommandExecutor.execute.mockResolvedValue({
            stdout: '[]',
            stderr: '',
            code: 0,
            duration: 10,
        });
        const clearConsoleContext = jest
            .spyOn(entities.selector, 'clearConsoleContext')
            .mockResolvedValue(undefined);

        await expect(entities.orgReads.getOrganizations()).resolves.toStrictEqual([]);

        expect(clearConsoleContext).toHaveBeenCalledTimes(1);
    });
});
