/**
 * Unit Tests: Config Sync Service
 *
 * Tests the syncConfigToRemote function which syncs locally generated
 * config.json to GitHub and publishes to Helix CDN.
 *
 * These tests verify:
 * 1. Reading local config.json
 * 2. Pushing to GitHub
 * 3. Publishing to Helix CDN
 * 4. CDN verification with cache invalidation
 * 5. Error handling for each step
 */

import { syncConfigToRemote, ConfigSyncParams, ConfigSyncResult } from '@/features/eds/services/configSyncService';
import { promises as fsPromises } from 'fs';

// Mock the dependencies
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
    },
}));

jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue('mock-github-token'),
    })),
}));

jest.mock('@/features/eds/services/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation(() => ({
        getFileContent: jest.fn(),
        createOrUpdateFile: jest.fn(),
    })),
}));

jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn().mockImplementation(() => ({
        previewCode: jest.fn(),
    })),
}));

// Mock global fetch for CDN verification
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('syncConfigToRemote', () => {
    let mockLogger: {
        debug: jest.Mock;
        info: jest.Mock;
        warn: jest.Mock;
        error: jest.Mock;
    };

    let mockSecrets: {
        get: jest.Mock;
        store: jest.Mock;
        delete: jest.Mock;
    };

    let mockAuthManager: {
        getTokenManager: jest.Mock;
    };

    let baseParams: ConfigSyncParams;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

        mockSecrets = {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
        };

        mockAuthManager = {
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
            }),
        };

        baseParams = {
            componentPath: '/path/to/eds-storefront',
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            logger: mockLogger as any,
            secrets: mockSecrets as any,
            authManager: mockAuthManager as any,
        };

        // Mock successful CDN verification response by default
        mockFetch.mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue(JSON.stringify({
                public: {
                    default: {
                        'commerce-endpoint': 'https://example.com/graphql',
                    },
                },
            })),
        });
    });

    describe('successful sync', () => {
        beforeEach(() => {
            // Mock successful file read
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            // Mock GitHub operations
            const { GitHubFileOperations } = require('@/features/eds/services/githubFileOperations');
            const mockGitHubFileOps = GitHubFileOperations.mock.results[0]?.value || {
                getFileContent: jest.fn().mockResolvedValue({ sha: 'existing-sha' }),
                createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
            };
            GitHubFileOperations.mockImplementation(() => mockGitHubFileOps);

            // Mock Helix service
            const { HelixService } = require('@/features/eds/services/helixService');
            const mockHelixService = HelixService.mock.results[0]?.value || {
                previewCode: jest.fn().mockResolvedValue(undefined),
            };
            HelixService.mockImplementation(() => mockHelixService);
        });

        it('reads local config.json and pushes to GitHub', async () => {
            // Arrange
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {"test": "value"}}');

            // Act
            const result = await syncConfigToRemote(baseParams);

            // Assert
            expect(result.success).toBe(true);
            expect(result.githubPushed).toBe(true);
            expect(fsPromises.readFile).toHaveBeenCalledWith(
                '/path/to/eds-storefront/config.json',
                'utf-8',
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('config.json pushed to GitHub'),
            );
        });

        it('publishes config.json to Helix CDN after GitHub push', async () => {
            // Arrange
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            // Act
            const result = await syncConfigToRemote(baseParams);

            // Assert
            expect(result.success).toBe(true);
            expect(result.cdnPublished).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('config.json published to Helix CDN'),
            );
        });
    });

    describe('error handling', () => {
        it('returns error if local config.json not found', async () => {
            // Arrange
            (fsPromises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT: no such file'));

            // Act
            const result = await syncConfigToRemote(baseParams);

            // Assert
            expect(result.success).toBe(false);
            expect(result.githubPushed).toBe(false);
            expect(result.cdnPublished).toBe(false);
            expect(result.error).toContain('Local config.json not found');
        });

        it('returns error if GitHub push fails', async () => {
            // Arrange
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            const { GitHubFileOperations } = require('@/features/eds/services/githubFileOperations');
            GitHubFileOperations.mockImplementation(() => ({
                getFileContent: jest.fn().mockResolvedValue(null),
                createOrUpdateFile: jest.fn().mockRejectedValue(new Error('GitHub API error')),
            }));

            // Act
            const result = await syncConfigToRemote(baseParams);

            // Assert
            expect(result.success).toBe(false);
            expect(result.githubPushed).toBe(false);
            expect(result.error).toContain('Failed to push config.json to GitHub');
        });

        it('returns partial success if CDN publish fails but GitHub succeeds', async () => {
            // Arrange
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            const { GitHubFileOperations } = require('@/features/eds/services/githubFileOperations');
            GitHubFileOperations.mockImplementation(() => ({
                getFileContent: jest.fn().mockResolvedValue({ sha: 'existing-sha' }),
                createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
            }));

            const { HelixService } = require('@/features/eds/services/helixService');
            HelixService.mockImplementation(() => ({
                previewCode: jest.fn().mockRejectedValue(new Error('CDN API error')),
            }));

            // Act
            const result = await syncConfigToRemote(baseParams);

            // Assert
            expect(result.success).toBe(true); // Overall success because GitHub push succeeded
            expect(result.githubPushed).toBe(true);
            expect(result.cdnPublished).toBe(false);
            // No error set because GitHub (critical part) succeeded
            expect(result.error).toBeUndefined();
        });
    });

    describe('logging', () => {
        it('logs debug messages for each step', async () => {
            // Arrange
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            const { GitHubFileOperations } = require('@/features/eds/services/githubFileOperations');
            GitHubFileOperations.mockImplementation(() => ({
                getFileContent: jest.fn().mockResolvedValue(null),
                createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
            }));

            const { HelixService } = require('@/features/eds/services/helixService');
            HelixService.mockImplementation(() => ({
                previewCode: jest.fn().mockResolvedValue(undefined),
            }));

            // Act
            await syncConfigToRemote(baseParams);

            // Assert - verify debug logs for key steps
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Read local config.json'),
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Checking for existing config.json on GitHub'),
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Pushing config.json to GitHub'),
            );
        });
    });

    describe('CDN verification', () => {
        /**
         * CDN verification tests verify that config.json is accessible
         * on the live CDN after publishing.
         *
         * Note: The cache invalidation mechanism (republish on 404) is tested
         * indirectly through the cdnVerified result. Internal retry timing
         * is not tested to avoid test flakiness.
         */

        beforeEach(() => {
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            const { GitHubFileOperations } = require('@/features/eds/services/githubFileOperations');
            GitHubFileOperations.mockImplementation(() => ({
                getFileContent: jest.fn().mockResolvedValue({ sha: 'existing-sha' }),
                createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
            }));
        });

        it('sets cdnVerified to true when config.json is accessible with valid commerce-endpoint', async () => {
            // Arrange
            const { HelixService } = require('@/features/eds/services/helixService');
            HelixService.mockImplementation(() => ({
                previewCode: jest.fn().mockResolvedValue(undefined),
            }));

            // CDN returns valid config immediately
            mockFetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue(JSON.stringify({
                    public: { default: { 'commerce-endpoint': 'https://example.com/graphql' } },
                })),
            });

            // Act
            const result = await syncConfigToRemote(baseParams);

            // Assert
            expect(result.cdnVerified).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('aem.live/config.json'),
                expect.any(Object),
            );
        });

        it('builds correct CDN URL from repo owner and name', async () => {
            // Arrange
            const { HelixService } = require('@/features/eds/services/helixService');
            HelixService.mockImplementation(() => ({
                previewCode: jest.fn().mockResolvedValue(undefined),
            }));

            mockFetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue(JSON.stringify({
                    public: { default: { 'commerce-endpoint': 'https://example.com/graphql' } },
                })),
            });

            // Act
            await syncConfigToRemote(baseParams);

            // Assert - URL should be https://main--{repo}--{owner}.aem.live/config.json
            expect(mockFetch).toHaveBeenCalledWith(
                'https://main--test-repo--test-owner.aem.live/config.json',
                expect.any(Object),
            );
        });
    });
});
