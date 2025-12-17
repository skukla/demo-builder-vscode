/**
 * AdobeEntityFetcher Unit Tests
 *
 * Tests the SDK-first fetching strategy with CLI fallback.
 * These tests verify the fetcher works correctly in isolation.
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { Logger, StepLogger } from '@/core/logging';

// Mock external dependencies
jest.mock('@/core/logging');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { parseJSON } from '@/types/typeGuards';

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
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

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

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

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

    describe('getOrganizations()', () => {
        it('should return cached organizations if available', async () => {
            const cachedOrgs = [
                { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
            ];
            mockCacheManager.getCachedOrgList.mockReturnValue(cachedOrgs);

            const result = await fetcher.getOrganizations();

            expect(result).toEqual(cachedOrgs);
            expect(mockSDKClient.isInitialized).not.toHaveBeenCalled();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should fetch via SDK when initialized', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({
                    body: [
                        { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org 1' },
                        { id: 'org2', code: 'ORG2@AdobeOrg', name: 'Org 2' },
                    ],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await fetcher.getOrganizations();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('org1');
            expect(result[0].name).toBe('Org 1');
            expect(mockCacheManager.setCachedOrgList).toHaveBeenCalledWith(result);
        });

        it('should fallback to CLI when SDK fails', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'org1', code: 'ORG1@AdobeOrg', name: 'CLI Org' },
                ]),
                stderr: '',
                code: 0,
            });

            const result = await fetcher.getOrganizations();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('CLI Org');
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org list --json',
                expect.any(Object),
            );
        });

        it('should fallback to CLI when SDK not initialized', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'org1', code: 'ORG1@AdobeOrg', name: 'CLI Org' },
                ]),
                stderr: '',
                code: 0,
            });

            const result = await fetcher.getOrganizations();

            expect(result).toHaveLength(1);
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
        });

        it('should call onNoOrgsAccessible when no organizations available', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([]),
                stderr: '',
                code: 0,
            });

            const result = await fetcher.getOrganizations();

            expect(result).toHaveLength(0);
            expect(onNoOrgsAccessible).toHaveBeenCalled();
        });

        it('should throw on CLI failure', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Command failed',
                code: 1,
            });

            await expect(fetcher.getOrganizations()).rejects.toThrow('Failed to get organizations');
        });
    });

    describe('getProjects()', () => {
        it('should fetch projects via SDK with valid org ID', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockResolvedValue({
                    body: [
                        { id: 'proj1', name: 'Project 1', title: 'Project 1 Title' },
                    ],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await fetcher.getProjects();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Project 1');
        });

        it('should use CLI when org ID is missing', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'proj1', name: 'CLI Project', title: 'CLI Project' },
                ]),
                stderr: '',
                code: 0,
            });

            const result = await fetcher.getProjects();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('CLI Project');
        });

        it('should suppress log messages in silent mode', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([]),
                stderr: '',
                code: 0,
            });

            await fetcher.getProjects({ silent: true });

            expect(mockStepLogger.logTemplate).not.toHaveBeenCalledWith(
                'adobe-setup',
                'operations.loading-projects',
                expect.anything(),
            );
        });

        it('should return empty array when no projects exist', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'does not have any projects',
                code: 1,
            });

            const result = await fetcher.getProjects();

            expect(result).toHaveLength(0);
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
            });

            const result = await fetcher.getWorkspaces();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('CLI Workspace');
        });
    });
});
