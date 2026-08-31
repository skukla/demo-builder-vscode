/**
 * AdobeEntityFetcher Unit Tests
 *
 * Tests the SDK-first fetching strategy with CLI fallback.
 * These tests verify the fetcher works correctly in isolation.
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import { ErrorCode } from '@/types/errorCodes';
import { AppError } from '@/core/errors';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';

// Mock external dependencies
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { parseJSON } from '@/types/typeGuards';
import { createMockLogger } from '../../../helpers/loggerFake';

describe('AdobeEntityFetcher', () => {
    let fetcher: AdobeEntityFetcher;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let onNoOrgsAccessible: jest.Mock;

    beforeEach(() => {
        // Setup logger mock
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());

        // Mock parseJSON
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        // Create mocks
        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;

        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(false),
            getClient: jest.fn(),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        mockCacheManager = {
            getCachedOrgList: jest.fn().mockReturnValue(undefined),
            setCachedOrgList: jest.fn(),
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
            getCachedProject: jest.fn().mockReturnValue(undefined),
        } as unknown as jest.Mocked<AuthCacheManager>;

        mockLogger = createMockLogger() as unknown as jest.Mocked<Logger>;

        mockStepLogger = {
            logTemplate: jest.fn(),
        } as unknown as jest.Mocked<StepLogger>;

        onNoOrgsAccessible = jest.fn();

        fetcher = new AdobeEntityFetcher(
            mockCommandExecutor,
            mockSDKClient,
            mockCacheManager,
            mockLogger,
            mockStepLogger,
            { onNoOrgsAccessible },
        );
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

            await expect(fetcher.getProjects()).rejects.toMatchObject({
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
                await fetcher.getProjects();
            } catch (err) {
                caught = err;
            }
            expect(caught).toBeInstanceOf(AppError);
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

            await expect(fetcher.getProjects()).rejects.toThrow('AUTH_EXPIRED');
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

            await fetcher.getProjects({ orgId: 'org-target' });

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

            await fetcher.getProjects();

            expect(seenOrgIds).toEqual([undefined]);
        });
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

            await fetcher.getWorkspaces();

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

            await fetcher.getWorkspaces();

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

            await fetcher.getWorkspaces({ orgId: 'threaded-org', projectId: 'threaded-proj' });

            expect(seen).toContainEqual({ orgId: 'threaded-org', projectId: 'threaded-proj' });
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

            await fetcher.getProjects({ orgId: 'target-org' });

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

            await fetcher.getProjects();

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

            await fetcher.getProjects({ orgId: 'target-org' });

            expect(getProjectsForOrg).toHaveBeenCalledWith('target-org');
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

            const result = await fetcher.getWorkspaces();

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

            const result = await fetcher.getWorkspaces();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('CLI Workspace');
        });
    });
});
