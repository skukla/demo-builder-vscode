/**
 * AdobeEntityFetcher Unit Tests
 *
 * Tests the SDK-first fetching strategy with CLI fallback.
 * These tests verify the fetcher works correctly in isolation.
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';

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
            { onNoOrgsAccessible }
        );
    });

    describe('getOrganizations()', () => {
        it('should return cached organizations if available', async () => {
            const cachedOrgs = [{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' }];
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
                stdout: JSON.stringify([{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'CLI Org' }]),
                stderr: '',
                code: 0,
                duration: 0,
            });

            const result = await fetcher.getOrganizations();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('CLI Org');
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org list --json',
                expect.any(Object)
            );
        });

        it('should fall back to CLI when the SDK call exceeds the deadline', async () => {
            // A stalled Adobe endpoint must not hang the wizard: cap the SDK attempt
            // and fall back to the (fast) CLI instead of riding the ~60s remote ceiling.
            jest.useFakeTimers();
            try {
                mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
                mockSDKClient.isInitialized.mockReturnValue(true);
                mockSDKClient.getClient.mockReturnValue({
                    // Never resolves — simulates the stalled org-list endpoint.
                    getOrganizations: jest.fn().mockReturnValue(new Promise(() => {})),
                } as ReturnType<typeof mockSDKClient.getClient>);

                mockCommandExecutor.execute.mockResolvedValue({
                    stdout: JSON.stringify([
                        { id: 'org1', code: 'ORG1@AdobeOrg', name: 'CLI Org' },
                    ]),
                    stderr: '',
                    code: 0,
                    duration: 0,
                });

                const resultPromise = fetcher.getOrganizations();
                await jest.advanceTimersByTimeAsync(TIMEOUTS.SDK_ENTITY_FETCH + 1);
                const result = await resultPromise;

                expect(result).toHaveLength(1);
                expect(result[0].name).toBe('CLI Org');
                expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                    'aio console org list --json',
                    expect.any(Object)
                );
            } finally {
                jest.useRealTimers();
            }
        });

        it('should fallback to CLI when SDK not initialized', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'CLI Org' }]),
                stderr: '',
                code: 0,
                duration: 0,
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
                duration: 0,
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
                duration: 0,
            });

            await expect(fetcher.getOrganizations()).rejects.toThrow('Failed to get organizations');
        });
    });

    describe('getOrganizationsSdkOnly()', () => {
        it('returns the cached org list without touching SDK or CLI', async () => {
            const cachedOrgs = [{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' }];
            mockCacheManager.getCachedOrgList.mockReturnValue(cachedOrgs);

            const result = await fetcher.getOrganizationsSdkOnly();

            expect(result).toEqual(cachedOrgs);
            expect(mockSDKClient.isInitialized).not.toHaveBeenCalled();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('fetches via SDK when initialized and caches the non-empty result', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({
                    body: [{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org 1' }],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await fetcher.getOrganizationsSdkOnly();

            expect(result).toHaveLength(1);
            expect(result?.[0]?.id).toBe('org1');
            expect(mockCacheManager.setCachedOrgList).toHaveBeenCalledWith(result);
            // P1: never the CLI fallback.
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('returns [] WITHOUT the CLI fallback when the SDK call fails', async () => {
            // The whole point of the SDK-only path: a failed SDK read must degrade
            // to `undefined` ("could not answer" → "unknown") and must NEVER run
            // `aio console org list` (which can stall ~14.5s and launch a browser
            // on open). P1. NOT [] — an empty array is a real answer (the token
            // reaches no Console orgs) and drives the org-switch recovery instead.
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await fetcher.getOrganizationsSdkOnly();

            expect(result).toBeUndefined();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            // Must not poison the shared org-list cache with a degraded result.
            expect(mockCacheManager.setCachedOrgList).not.toHaveBeenCalled();
        });

        it('returns undefined WITHOUT the CLI fallback when the SDK is not initialized', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false);

            const result = await fetcher.getOrganizationsSdkOnly();

            expect(result).toBeUndefined();
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('returns a REAL empty list as [] (distinguishable from a failed read)', async () => {
            // the field SC's case (2026-08-13): the SDK answered successfully with zero
            // orgs. That must come back as [], not undefined — the dashboard
            // check maps [] to the org-mismatch warning (forced Switch IMS Org).
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({ body: [] }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await fetcher.getOrganizationsSdkOnly();

            expect(result).toEqual([]);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(mockCacheManager.setCachedOrgList).not.toHaveBeenCalled();
        });

        it('does not call onNoOrgsAccessible on an empty SDK read', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false);

            await fetcher.getOrganizationsSdkOnly();

            expect(onNoOrgsAccessible).not.toHaveBeenCalled();
        });
    });

    // P1 siblings for the entity reads a BACKGROUND caller makes. `getProjects`
    // and `getWorkspaces` fall back to `aio console …` when the SDK returns
    // nothing, and that CLI call triggers interactive browser auth on a stale
    // token — fine for a read the user asked for (the destination pickers guard
    // it and prompt), wrong for one they did not, such as hydrating a project's
    // display title. These variants degrade to [] instead, exactly as
    // getOrganizationsSdkOnly does.
    describe('SDK-only entity reads (P1)', () => {
        it('getProjectsSdkOnly returns SDK results without touching the CLI', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockResolvedValue({
                    body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await fetcher.getProjectsSdkOnly();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        // THE regression this exists to prevent: an empty SDK read is exactly when
        // the normal path shells out and opens a browser.
        it('getProjectsSdkOnly returns [] WITHOUT the CLI fallback on an empty SDK read', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await fetcher.getProjectsSdkOnly();

            expect(result).toEqual([]);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

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

            const result = await fetcher.getWorkspacesSdkOnly({ projectId: 'proj1' });

            expect(result).toEqual([]);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        // Control: the ordinary reads keep their fallback. Without this, deleting
        // the fallback entirely would satisfy every assertion above.
        it('the ordinary getProjects DOES still fall back to the CLI', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '[]',
                stderr: '',
                code: 0,
            } as never);

            await fetcher.getProjects();

            expect(mockCommandExecutor.execute).toHaveBeenCalled();
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
                    body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await fetcher.getProjects();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Project 1');
        });

        it('should carry who_created through the SDK project mapping', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockResolvedValue({
                    body: [
                        {
                            id: 'proj1',
                            name: 'Project 1',
                            title: 'Project 1 Title',
                            who_created: '5DA1B2C3D4E5F607080910A1@abcdef1234567890.e',
                        },
                        { id: 'proj2', name: 'Project 2', title: 'Project 2 Title' },
                    ],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await fetcher.getProjects();

            expect(result[0].who_created).toBe('5DA1B2C3D4E5F607080910A1@abcdef1234567890.e');
            // Missing on the wire → stays absent (ownership gate fails closed later).
            expect(result[1].who_created).toBeUndefined();
        });

        it('should use CLI when org ID is missing (and no token org)', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            // No threaded/cached org AND the token org fallback yields nothing → CLI.
            jest.spyOn(fetcher, 'getOrganizationsSdkOnly').mockResolvedValue([]);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'proj1', name: 'CLI Project', title: 'CLI Project' },
                ]),
                stderr: '',
                code: 0,
                duration: 0,
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
                duration: 0,
            });

            await fetcher.getProjects({ silent: true });

            expect(mockStepLogger.logTemplate).not.toHaveBeenCalledWith(
                'adobe-auth',
                'operations.loading-projects',
                expect.anything()
            );
        });

        it('should return empty array when no projects exist', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'does not have any projects',
                code: 1,
                duration: 0,
            });

            const result = await fetcher.getProjects();

            expect(result).toHaveLength(0);
        });

        it('should parse JSON when CLI stdout contains warning lines with ›', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            // Simulate aio CLI output with upgrade warnings before JSON
            const warningLines = [
                ' ›   Warning: @adobe/aio-cli update available from 10.3.4 to 11.0.2.',
                ' ›   Run npm install -g @adobe/aio-cli to update.',
                ' ›   Warning: @adobe/aio-cli-plugin-api-mesh update available from 5.5.0 to',
                ' ›  ',
            ].join('\n');
            const jsonData = JSON.stringify([
                { id: 'proj1', name: 'Project 1', title: 'Project 1 Title' },
            ]);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: warningLines + '\n' + jsonData,
                stderr: '',
                code: 2,
                duration: 0,
            });

            const result = await fetcher.getProjects();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Project 1');
        });

        it('should parse JSON when CLI stdout has warnings for organizations', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            const warningLines = ' ›   Warning: update available\n';
            const jsonData = JSON.stringify([{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org 1' }]);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: warningLines + jsonData,
                stderr: '',
                code: 2,
                duration: 0,
            });

            const result = await fetcher.getOrganizations();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Org 1');
        });
    });
});
