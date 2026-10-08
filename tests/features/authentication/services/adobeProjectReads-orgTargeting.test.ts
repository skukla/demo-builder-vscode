/**
 * Project reads target the THREADED org: org-context env, the SDK org id, and the typed 403.
 *
 * Split 2026-10-08 from adobeEntityCollaborators.workspaces.test.ts (EDS-8).
 */

import {
    setupEntityCollaborators,
    type EntityCollaborators,
} from './adobeEntityCollaborators.testUtils';

import { ErrorCode } from '@/types/errorCodes';
import { AdobeOrgMismatchError } from '@/features/authentication/services/authenticationErrors';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';

describe('project reads — org targeting', () => {
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

    describe('getProjects() - org targeting & typed 403', () => {
        it('throws an ORG_MISMATCH-coded error (no terminal instruction) on a 403', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'not-json',
                stderr: '403 Forbidden',
                code: 2,
                duration: 0,
            });

            await expect(entities.projectReads.getProjects()).rejects.toMatchObject({
                code: ErrorCode.ORG_MISMATCH,
            });
        });

        it('does NOT include the "aio console org select" terminal instruction on a 403', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'not-json',
                stderr: 'Error: 403 forbidden',
                code: 2,
                duration: 0,
            });

            let caught: unknown;
            try {
                await entities.projectReads.getProjects();
            } catch (err) {
                caught = err;
            }
            // The org-mismatch error moved OUT of the retired central hierarchy and in
            // beside the code that throws it (2026-09-11). The assertion is about the
            // same thing either way: a typed failure a caller can branch on.
            expect(caught).toBeInstanceOf(AdobeOrgMismatchError);
            expect((caught as Error).message).not.toContain('aio console org select');
            expect((caught as Error).message.toLowerCase()).not.toContain('terminal');
        });

        it('keeps the 401 -> AUTH_EXPIRED branch intact', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'not-json',
                stderr: '401 Unauthorized',
                code: 2,
                duration: 0,
            });

            await expect(entities.projectReads.getProjects()).rejects.toThrow('AUTH_EXPIRED');
        });

        it('runs the project fetch under org-context targeting when orgId is supplied', async () => {
            // With an orgId, the CLI fallback must execute inside a withOrgContext
            // scope so the command executor targets that org. We assert targeting by
            // observing the active org context at execute() time.
            const seenOrgIds: (string | undefined)[] = [];
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            const { getActiveOrgContext } = require('@/core/shell/orgContextEnv');
            mockCommandExecutor.execute.mockImplementation(async () => {
                seenOrgIds.push(getActiveOrgContext()?.orgId);
                return { stdout: JSON.stringify([]), stderr: '', code: 0, duration: 0 };
            });

            await entities.projectReads.getProjects({ orgId: 'org-target' });

            expect(seenOrgIds).toContain('org-target');
        });

        it('does not establish targeting when no orgId is supplied (back-compat)', async () => {
            const seenOrgIds: (string | undefined)[] = [];
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            const { getActiveOrgContext } = require('@/core/shell/orgContextEnv');
            mockCommandExecutor.execute.mockImplementation(async () => {
                seenOrgIds.push(getActiveOrgContext()?.orgId);
                return { stdout: JSON.stringify([]), stderr: '', code: 0, duration: 0 };
            });

            await entities.projectReads.getProjects();

            expect(seenOrgIds).toEqual([undefined]);
        });
    });

    describe('getProjects() - SDK fetch honors the threaded org id', () => {
        it('fetches projects for the THREADED orgId, not the cached (stale) org, when orgId is supplied', async () => {
            // Regression: the wizard threads the intended org into get-projects, but the
            // SDK path used to fetch the cached/ambient org (which can be stale), returning
            // the wrong org's projects (or an empty list). The threaded org is the truth.
            const getProjectsForOrg = jest.fn().mockResolvedValue({
                body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
            });
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: 'stale-org',
                code: 'STALE@AdobeOrg',
                name: 'Stale Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg,
            } as ReturnType<typeof mockSDKClient.getClient>);

            await entities.projectReads.getProjects({ orgId: 'target-org' });

            expect(getProjectsForOrg).toHaveBeenCalledWith('target-org');
            expect(getProjectsForOrg).not.toHaveBeenCalledWith('stale-org');
        });

        it('falls back to the cached org id for the SDK fetch when orgId is omitted', async () => {
            const getProjectsForOrg = jest.fn().mockResolvedValue({
                body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
            });
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: 'cached-org',
                code: 'CACHED@AdobeOrg',
                name: 'Cached Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg,
            } as ReturnType<typeof mockSDKClient.getClient>);

            await entities.projectReads.getProjects();

            expect(getProjectsForOrg).toHaveBeenCalledWith('cached-org');
        });

        it('uses the threaded orgId for the SDK fetch even when no org is cached', async () => {
            const getProjectsForOrg = jest.fn().mockResolvedValue({
                body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
            });
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg,
            } as ReturnType<typeof mockSDKClient.getClient>);

            await entities.projectReads.getProjects({ orgId: 'target-org' });

            expect(getProjectsForOrg).toHaveBeenCalledWith('target-org');
        });
    });

    describe('getProjectsSdkOnly() - org targeting', () => {
        it('runs the SDK read for the threaded org, under that org context', async () => {
            const { getActiveOrgContext } = require('@/core/shell/orgContextEnv');
            const seenOrgIds: (string | undefined)[] = [];
            const getProjectsForOrg = jest.fn().mockImplementation(async () => {
                seenOrgIds.push(getActiveOrgContext()?.orgId);
                return { body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }] };
            });
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg,
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.projectReads.getProjectsSdkOnly({ orgId: 'target-org' });

            expect(result).toHaveLength(1);
            expect(getProjectsForOrg).toHaveBeenCalledWith('target-org');
            expect(seenOrgIds).toEqual(['target-org']);
        });
    });
});
