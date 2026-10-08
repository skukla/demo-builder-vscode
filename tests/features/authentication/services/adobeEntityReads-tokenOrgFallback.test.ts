/**
 * resolveEffectiveOrgId (adobeEntityReads.ts) — token-org SDK fallback tests
 *
 * Split from adobeEntityFetcher.test.ts (kept under the 750-line test-file cap).
 * Covers `resolveEffectiveOrgId`: an un-threaded, un-cached getProjects/getWorkspaces
 * resolves the TOKEN org via the SDK (getOrganizationsSdkOnly()[0]) instead of falling
 * to the stale-console CLI (which 403s -> ORG_MISMATCH).
 */

import {
    setupEntityCollaborators,
    type EntityCollaborators,
} from './adobeEntityCollaborators.testUtils';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';

describe('entity collaborators — token-org SDK fallback', () => {
    let entities: EntityCollaborators;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;

    beforeEach(() => {
        ({ entities, mockCommandExecutor, mockSDKClient, mockCacheManager } =
            setupEntityCollaborators());
    });

    describe('token-org SDK fallback (no threaded/cached org)', () => {
        it('getProjects resolves the TOKEN org via the SDK and skips the CLI', async () => {
            // Regression: an un-threaded, un-cached getProjects used to fall to the CLI,
            // which targets the stale `aio console` org and 403s -> ORG_MISMATCH. With the
            // SDK initialized it must instead resolve the TOKEN org (getOrganizationsSdkOnly()[0])
            // and fetch via the SDK.
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            const getProjectsForOrg = jest.fn().mockResolvedValue({
                body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
            });
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg,
            } as ReturnType<typeof mockSDKClient.getClient>);
            jest.spyOn(entities.orgReads, 'getOrganizationsSdkOnly').mockResolvedValue([
                { id: 'tok-org', code: 'TOK@AdobeOrg', name: 'Token Org' },
            ]);

            await entities.projectReads.getProjects();

            expect(getProjectsForOrg).toHaveBeenCalledWith('tok-org');
            // The SDK path succeeded — the CLI fallback must NOT run.
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('getProjects does NOT consult the token org when an orgId is threaded', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            const getProjectsForOrg = jest.fn().mockResolvedValue({
                body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
            });
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg,
            } as ReturnType<typeof mockSDKClient.getClient>);
            const tokenSpy = jest.spyOn(entities.orgReads, 'getOrganizationsSdkOnly');

            await entities.projectReads.getProjects({ orgId: 'threaded-org' });

            expect(getProjectsForOrg).toHaveBeenCalledWith('threaded-org');
            expect(tokenSpy).not.toHaveBeenCalled();
        });

        it('getProjects does NOT consult the token org when an org is cached', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: 'cached-org', code: 'C@AdobeOrg', name: 'Cached Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            const getProjectsForOrg = jest.fn().mockResolvedValue({
                body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
            });
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg,
            } as ReturnType<typeof mockSDKClient.getClient>);
            const tokenSpy = jest.spyOn(entities.orgReads, 'getOrganizationsSdkOnly');

            await entities.projectReads.getProjects();

            expect(getProjectsForOrg).toHaveBeenCalledWith('cached-org');
            expect(tokenSpy).not.toHaveBeenCalled();
        });

        it('getWorkspaces resolves the TOKEN org via the SDK and skips the CLI', async () => {
            // Mirror of the getProjects fallback: no threaded/cached org, a threaded
            // projectId, SDK initialized → resolve the token org and fetch via the SDK.
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            const getWorkspacesForProject = jest.fn().mockResolvedValue({
                body: [{ id: 'ws1', name: 'Production', title: 'Production' }],
            });
            mockSDKClient.getClient.mockReturnValue({
                getWorkspacesForProject,
            } as ReturnType<typeof mockSDKClient.getClient>);
            jest.spyOn(entities.orgReads, 'getOrganizationsSdkOnly').mockResolvedValue([
                { id: 'tok-org', code: 'TOK@AdobeOrg', name: 'Token Org' },
            ]);

            await entities.workspaceReads.getWorkspaces({ projectId: 'threaded-proj' });

            expect(getWorkspacesForProject).toHaveBeenCalledWith('tok-org', 'threaded-proj');
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });
    });
});
