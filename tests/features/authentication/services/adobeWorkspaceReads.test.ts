/**
 * Workspace reads: org-context targeting, SDK-first with the CLI fallback, and the SDK-only variant.
 *
 * Split 2026-10-08 from adobeEntityCollaborators.workspaces.test.ts and
 * adobeEntityCollaborators.test.ts (EDS-8).
 */

import {
    setupEntityCollaborators,
    type EntityCollaborators,
} from './adobeEntityCollaborators.testUtils';

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';

describe('workspace reads', () => {
    let entities: EntityCollaborators;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;

    beforeEach(() => {
        ({
            entities,
            mockCommandExecutor,
            mockSDKClient,
            mockCacheManager,
        } = setupEntityCollaborators());
    });

    describe('getWorkspaces() - org-context targeting', () => {
        it('runs the workspace fetch under org-context targeting (cached org + project)', async () => {
            // getWorkspaces has no orgId option: it targets from the cached org + project so
            // the CLI fallback hits the project's org, not the CLI's ambient one (ORG_MISMATCH).
            const seen: { orgId?: string; projectId?: string }[] = [];
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org-ws', code: 'C@AdobeOrg', name: 'WS Org' });
            mockCacheManager.getCachedProject.mockReturnValue({ id: 'proj-ws', name: 'Proj WS' });
            mockSDKClient.isInitialized.mockReturnValue(false); // force the CLI fallback

            const { getActiveOrgContext } = require('@/core/shell/orgContextEnv');
            mockCommandExecutor.execute.mockImplementation(async () => {
                const ctx = getActiveOrgContext();
                seen.push({ orgId: ctx?.orgId, projectId: ctx?.projectId });
                return { stdout: JSON.stringify([]), stderr: '', code: 0, duration: 0 };
            });

            await entities.workspaceReads.getWorkspaces();

            expect(seen).toContainEqual({ orgId: 'org-ws', projectId: 'proj-ws' });
        });

        it('does not establish targeting when org or project id is missing (back-compat)', async () => {
            const seen: (string | undefined)[] = [];
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            const { getActiveOrgContext } = require('@/core/shell/orgContextEnv');
            mockCommandExecutor.execute.mockImplementation(async () => {
                seen.push(getActiveOrgContext()?.orgId);
                return { stdout: JSON.stringify([]), stderr: '', code: 0, duration: 0 };
            });

            await entities.workspaceReads.getWorkspaces();

            expect(seen).toEqual([undefined]);
        });

        it('prefers the threaded target over the (stale) cache', async () => {
            // The cache holds a stale/pruned project; the threaded selection must win so the
            // lookup targets the real project (not "Invalid Project id").
            const seen: { orgId?: string; projectId?: string }[] = [];
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'cached-org', code: 'X@AdobeOrg', name: 'Cached Org' });
            mockCacheManager.getCachedProject.mockReturnValue({ id: 'stale-proj', name: 'Stale' });
            mockSDKClient.isInitialized.mockReturnValue(false);

            const { getActiveOrgContext } = require('@/core/shell/orgContextEnv');
            mockCommandExecutor.execute.mockImplementation(async () => {
                const ctx = getActiveOrgContext();
                seen.push({ orgId: ctx?.orgId, projectId: ctx?.projectId });
                return { stdout: JSON.stringify([]), stderr: '', code: 0, duration: 0 };
            });

            await entities.workspaceReads.getWorkspaces({ orgId: 'threaded-org', projectId: 'threaded-proj' });

            expect(seen).toContainEqual({ orgId: 'threaded-org', projectId: 'threaded-proj' });
        });
    });

    describe('getWorkspaces()', () => {
        it('should fetch workspaces via SDK with valid org and project IDs', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockCacheManager.getCachedProject.mockReturnValue({
                id: 'proj123',
                name: 'Test Project',
                title: 'Test Project',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getWorkspacesForProject: jest.fn().mockResolvedValue({
                    body: [
                        { id: 'ws1', name: 'Production', title: 'Production' },
                        { id: 'ws2', name: 'Stage', title: 'Stage' },
                    ],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.workspaceReads.getWorkspaces();

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('Production');
            expect(result[1].name).toBe('Stage');
        });

        it('should use CLI when project ID is missing', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'ws1', name: 'CLI Workspace', title: 'CLI Workspace' },
                ]),
                stderr: '',
                code: 0,
                duration: 0,
            });

            const result = await entities.workspaceReads.getWorkspaces();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('CLI Workspace');
        });
    });

    describe('getWorkspacesSdkOnly()', () => {
        it('getWorkspacesSdkOnly returns [] WITHOUT the CLI fallback on an empty SDK read', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getWorkspacesForProject: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.workspaceReads.getWorkspacesSdkOnly({ projectId: 'proj1' });

            expect(result).toStrictEqual([]);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('reads the THREADED org and project, not the cache', async () => {
            const getWorkspacesForProject = jest.fn().mockResolvedValue({
                body: [{ id: 'ws1', name: 'Stage', title: 'Stage' }],
            });
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getWorkspacesForProject,
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.workspaceReads.getWorkspacesSdkOnly({
                orgId: 'threaded-org',
                projectId: 'threaded-proj',
            });

            expect(result).toHaveLength(1);
            expect(getWorkspacesForProject).toHaveBeenCalledWith('threaded-org', 'threaded-proj');
        });

        it('answers [] when nothing is threaded or cached and the SDK is unavailable', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            const result = await entities.workspaceReads.getWorkspacesSdkOnly();

            expect(result).toStrictEqual([]);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });
    });

    describe('getWorkspaces() - which org context is established', () => {
        /** The org context active while the CLI fallback runs. */
        function captureContext(): { seen: unknown[] } {
            const { getActiveOrgContext } = require('@/core/shell/orgContextEnv');
            const seen: unknown[] = [];
            mockCommandExecutor.execute.mockImplementation(async () => {
                seen.push(getActiveOrgContext());
                return { stdout: JSON.stringify([]), stderr: '', code: 0, duration: 0 };
            });
            return { seen };
        }

        it('carries the cached org code and name when the target org IS the cached org', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org-ws', code: 'C@AdobeOrg', name: 'WS Org' });
            mockCacheManager.getCachedProject.mockReturnValue({ id: 'proj-ws', name: 'Proj WS' });
            mockSDKClient.isInitialized.mockReturnValue(false);
            const { seen } = captureContext();

            await entities.workspaceReads.getWorkspaces();

            expect(seen).toContainEqual(
                expect.objectContaining({ orgId: 'org-ws', orgCode: 'C@AdobeOrg', orgName: 'WS Org' }),
            );
        });

        it("drops the cached org's code and name when a different org is threaded", async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'cached-org', code: 'X@AdobeOrg', name: 'Cached Org' });
            mockSDKClient.isInitialized.mockReturnValue(false);
            const { seen } = captureContext();

            await entities.workspaceReads.getWorkspaces({ orgId: 'threaded-org', projectId: 'threaded-proj' });

            expect(seen).toContainEqual(
                expect.objectContaining({ orgId: 'threaded-org', orgCode: undefined, orgName: undefined }),
            );
        });

        it('establishes no context when the org is known but the project is not', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org-ws', code: 'C@AdobeOrg', name: 'WS Org' });
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            const { seen } = captureContext();

            await entities.workspaceReads.getWorkspaces();

            expect(seen).toEqual([undefined]);
        });
    });

    describe('fetchWorkspaces() - failure', () => {
        it('rejects when the CLI fallback fails, rather than answering nothing', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockRejectedValue(new Error('aio crashed'));

            await expect(entities.workspaceReads.fetchWorkspaces('org', 'proj')).rejects.toThrow(
                'aio crashed',
            );
        });
    });
});
