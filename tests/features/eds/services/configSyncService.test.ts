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

// Delays in this path are real wall-clock waits on the node project's real timers.
// Mocking the shared sleep keeps the orchestration under test and drops the waiting.
// Assertions here pin the SEQUENCE of attempts, never elapsed duration.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import {
    syncConfigToRemote,
    verifyConfigOnCdn,
    describeCdnPropagation,
    CDN_VERIFY_BUDGET_SECONDS,
    ConfigSyncParams,
} from '@/features/eds/services/configSyncService';
import { sleep } from '@/core/utils/sleep';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { promises as fsPromises } from 'fs';
import type * as vscode from 'vscode';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
// Mock the dependencies
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
    },
}));

jest.mock('@/features/eds/services/github/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue('mock-github-token'),
    })),
}));

// The subject now asks the service cache instead of constructing its own token
// service. This delegates to the SAME mocked class above, so the suite's
// behaviour is unchanged — only the route to it is.
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => {
        const { GitHubTokenService } = jest.requireMock(
            '@/features/eds/services/github/githubTokenService'
        );
        return { tokenService: new GitHubTokenService() };
    }),
}));

jest.mock('@/features/eds/services/github/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation(() => ({
        getFileContent: jest.fn(),
        createOrUpdateFile: jest.fn(),
    })),
}));

// HelixService is NOT module-mocked. It arrives through the `makeHelix` seam on
// ConfigSyncParams, so the suite hands in the one method this service calls.
/** The one Helix call syncConfigToRemote makes, handed in through the seam. */
const mockPreviewCode = jest.fn();

// Mock global fetch for CDN verification
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('syncConfigToRemote', () => {
    let mockLogger: ReturnType<typeof createMockLogger>;

    let mockSecrets: jest.Mocked<vscode.SecretStorage>;

    let mockAuthManager: jest.Mocked<AuthenticationService>;

    let baseParams: ConfigSyncParams;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPreviewCode.mockResolvedValue(undefined);

        mockLogger = createMockLogger();

        mockSecrets = createMockSecretStorage().secrets;

        mockAuthManager = createMockAuthenticationService({
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
            }),
        });

        baseParams = {
            componentPath: '/path/to/eds-storefront',
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            logger: mockLogger,
            secrets: mockSecrets,
            authManager: mockAuthManager,
            makeHelix: () => ({ previewCode: mockPreviewCode }),
        };

        // Mock successful CDN verification response by default
        mockFetch.mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue(
                JSON.stringify({
                    public: {
                        default: {
                            'commerce-endpoint': 'https://example.com/graphql',
                        },
                    },
                })
            ),
        });
    });

    describe('successful sync', () => {
        beforeEach(() => {
            // Mock successful file read
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            // Mock GitHub operations
            const {
                GitHubFileOperations,
            } = require('@/features/eds/services/github/githubFileOperations');
            const mockGitHubFileOps = GitHubFileOperations.mock.results[0]?.value || {
                getFileContent: jest.fn().mockResolvedValue({ sha: 'existing-sha' }),
                createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
            };
            GitHubFileOperations.mockImplementation(() => mockGitHubFileOps);
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
                'utf-8'
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('config.json pushed to GitHub')
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
                expect.stringContaining('config.json published to Helix CDN')
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
            expect(result.cdnVerified).toBe(false);
            expect(result.error).toContain('Local config.json not found');
        });

        it('returns error if GitHub push fails', async () => {
            // Arrange
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            const {
                GitHubFileOperations,
            } = require('@/features/eds/services/github/githubFileOperations');
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

        it('reports a failure raised before the GitHub step as a sync failure', async () => {
            // The only work outside an inner try/catch: if the service cache
            // cannot hand back a token service there is no push to report on,
            // and the outer catch is the one that has to answer.
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');
            (getGitHubServices as jest.Mock).mockImplementationOnce(() => {
                throw new Error('no secret storage');
            });

            const result = await syncConfigToRemote(baseParams);

            expect(result.success).toBe(false);
            expect(result.githubPushed).toBe(false);
            expect(result.error).toBe('Config sync failed: no secret storage');
        });

        it('returns partial success if CDN publish fails but GitHub succeeds', async () => {
            // Arrange
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            const {
                GitHubFileOperations,
            } = require('@/features/eds/services/github/githubFileOperations');
            GitHubFileOperations.mockImplementation(() => ({
                getFileContent: jest.fn().mockResolvedValue({ sha: 'existing-sha' }),
                createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
            }));

            mockPreviewCode.mockRejectedValue(new Error('CDN API error'));

            // Act
            const result = await syncConfigToRemote(baseParams);

            // Assert
            expect(result.success).toBe(true); // Overall success because GitHub push succeeded
            expect(result.githubPushed).toBe(true);
            expect(result.cdnPublished).toBe(false);
            expect(result.cdnVerified).toBe(false);
            expect(result.cdnError).toBe('CDN API error');
            // No error set because GitHub (critical part) succeeded
            expect(result.error).toBeUndefined();
        });
    });

    describe('the GitHub write', () => {
        beforeEach(() => {
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');
        });

        it('passes the existing SHA through so the push updates rather than duplicates', async () => {
            const createOrUpdateFile = jest.fn().mockResolvedValue(undefined);
            const {
                GitHubFileOperations,
            } = require('@/features/eds/services/github/githubFileOperations');
            GitHubFileOperations.mockImplementation(() => ({
                getFileContent: jest.fn().mockResolvedValue({ sha: 'existing-sha' }),
                createOrUpdateFile,
            }));

            await syncConfigToRemote({ ...baseParams, componentPath: '/p' });

            expect(createOrUpdateFile).toHaveBeenCalledWith(
                'test-owner',
                'test-repo',
                'config.json',
                '{"public": {}}',
                'chore: sync config.json with mesh endpoint',
                'existing-sha'
            );
        });

        it('pushes with no SHA when config.json is not on GitHub yet', async () => {
            // The repo has no config.json, so getFileContent answers null. Reading
            // `.sha` off it without the optional chain throws, and the throw lands
            // in the GitHub catch — a first-ever sync reported as a push failure.
            const createOrUpdateFile = jest.fn().mockResolvedValue(undefined);
            const {
                GitHubFileOperations,
            } = require('@/features/eds/services/github/githubFileOperations');
            GitHubFileOperations.mockImplementation(() => ({
                getFileContent: jest.fn().mockResolvedValue(null),
                createOrUpdateFile,
            }));

            const result = await syncConfigToRemote(baseParams);

            expect(result.githubPushed).toBe(true);
            expect(createOrUpdateFile).toHaveBeenCalledWith(
                'test-owner',
                'test-repo',
                'config.json',
                '{"public": {}}',
                'chore: sync config.json with mesh endpoint',
                undefined
            );
        });
    });

    describe('logging', () => {
        it('logs debug messages for each step', async () => {
            // Arrange
            (fsPromises.readFile as jest.Mock).mockResolvedValue('{"public": {}}');

            const {
                GitHubFileOperations,
            } = require('@/features/eds/services/github/githubFileOperations');
            GitHubFileOperations.mockImplementation(() => ({
                getFileContent: jest.fn().mockResolvedValue(null),
                createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
            }));

            // Act
            await syncConfigToRemote(baseParams);

            // Assert - verify debug logs for key steps
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Read local config.json')
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Checking for existing config.json on GitHub')
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Pushing config.json to GitHub')
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

            const {
                GitHubFileOperations,
            } = require('@/features/eds/services/github/githubFileOperations');
            GitHubFileOperations.mockImplementation(() => ({
                getFileContent: jest.fn().mockResolvedValue({ sha: 'existing-sha' }),
                createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
            }));
        });

        it('sets cdnVerified to true when config.json is accessible with valid commerce-endpoint', async () => {
            // Arrange
            // CDN returns valid config immediately
            mockFetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue(
                    JSON.stringify({
                        public: { default: { 'commerce-endpoint': 'https://example.com/graphql' } },
                    })
                ),
            });

            // Act
            const result = await syncConfigToRemote(baseParams);

            // Assert
            expect(result.cdnVerified).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('aem.live/config.json'),
                expect.any(Object)
            );
        });

        it('builds correct CDN URL from repo owner and name', async () => {
            // Arrange
            mockFetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue(
                    JSON.stringify({
                        public: { default: { 'commerce-endpoint': 'https://example.com/graphql' } },
                    })
                ),
            });

            // Act
            await syncConfigToRemote(baseParams);

            // Assert - URL should be https://main--{repo}--{owner}.aem.live/config.json
            expect(mockFetch).toHaveBeenCalledWith(
                'https://main--test-repo--test-owner.aem.live/config.json',
                expect.any(Object)
            );
        });
    });
});

/**
 * verifyConfigOnCdn — the retry loop the sync path leans on.
 *
 * Every wait here goes through the mocked `sleep`, so the loop's SHAPE is
 * observable without any elapsed time: which cadence it slept at, and how many
 * times. That is what these assert — never a duration.
 */
describe('verifyConfigOnCdn', () => {
    /** Between attempts. Mirrors CDN_VERIFY_INTERVAL, which is module-private. */
    const BETWEEN_ATTEMPTS_MS = 2000;
    /** The extra settle after an early success — CDN_VERIFY_INTERVAL * 2. */
    const EDGE_SETTLE_MS = 4000;
    /** Mirrors CDN_VERIFY_ATTEMPTS. */
    const ATTEMPTS = 10;

    const sleepMock = sleep as jest.Mock;
    let logger: ReturnType<typeof createMockLogger>;

    /** A CDN answer carrying a config with the field the check looks for. */
    function servedConfig(ok = true) {
        return {
            ok,
            status: ok ? 200 : 404,
            text: jest
                .fn()
                .mockResolvedValue(
                    JSON.stringify({ public: { default: { 'commerce-endpoint': 'https://x/gql' } } })
                ),
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger();
    });

    it('requests the config over a signal that can abort the fetch', async () => {
        mockFetch.mockResolvedValue(servedConfig());

        await verifyConfigOnCdn('test-owner', 'test-repo', logger);

        expect(mockFetch).toHaveBeenCalledWith(
            'https://main--test-repo--test-owner.aem.live/config.json',
            expect.objectContaining({ signal: expect.anything() })
        );
    });

    it('settles for a further interval when the first attempt already succeeds', async () => {
        // An edge that answers immediately is the one most likely to be a single
        // fast node ahead of the rest, so the check waits again before believing it.
        mockFetch.mockResolvedValue(servedConfig());

        await expect(verifyConfigOnCdn('o', 'r', logger)).resolves.toBe(true);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(sleepMock).toHaveBeenCalledWith(EDGE_SETTLE_MS);
    });

    it('does not settle again once the third attempt is the one that succeeds', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: false, status: 503 })
            .mockResolvedValueOnce({ ok: false, status: 503 })
            .mockResolvedValue(servedConfig());

        await expect(verifyConfigOnCdn('o', 'r', logger)).resolves.toBe(true);

        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(sleepMock).not.toHaveBeenCalledWith(EDGE_SETTLE_MS);
    });

    it('does not accept a body served under a non-OK status', async () => {
        // A 404 page can still parse as the config we want if the edge is
        // serving an error document; the status is what says it is not live.
        mockFetch.mockResolvedValue(servedConfig(false));

        await expect(verifyConfigOnCdn('o', 'r', logger)).resolves.toBe(false);

        expect(mockFetch).toHaveBeenCalledTimes(ATTEMPTS);
    });

    it('does not accept a config that lacks the commerce endpoint', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: jest.fn().mockResolvedValue(JSON.stringify({ public: { default: {} } })),
        });

        await expect(verifyConfigOnCdn('o', 'r', logger)).resolves.toBe(false);

        expect(mockFetch).toHaveBeenCalledTimes(ATTEMPTS);
    });

    it('waits between attempts but not after the last one', async () => {
        mockFetch.mockRejectedValue(new Error('network down'));

        await expect(verifyConfigOnCdn('o', 'r', logger)).resolves.toBe(false);

        expect(mockFetch).toHaveBeenCalledTimes(ATTEMPTS);
        const waits = sleepMock.mock.calls.filter(([ms]) => ms === BETWEEN_ATTEMPTS_MS);
        expect(waits).toHaveLength(ATTEMPTS - 1);
    });

    it('still accepts a config that only arrives on the final attempt', async () => {
        for (let i = 1; i < ATTEMPTS; i++) mockFetch.mockRejectedValueOnce(new Error('not yet'));
        mockFetch.mockResolvedValue(servedConfig());

        await expect(verifyConfigOnCdn('o', 'r', logger)).resolves.toBe(true);

        expect(mockFetch).toHaveBeenCalledTimes(ATTEMPTS);
    });
});

/**
 * The publish path has always known whether the CDN was serving the new copy;
 * the answer died in the debug log. An agent that published, looked at the site,
 * saw the old page and had nothing to weigh that against concluded its commits
 * were being discarded and filed a bug for a defect that did not exist.
 */
describe('describeCdnPropagation', () => {
    it('says the site is serving this publish when the CDN confirmed it', () => {
        expect(describeCdnPropagation({ cdnVerified: true })).toMatch(/serving this publish/i);
    });

    it('calls an unconfirmed publish propagation delay, not lost work', () => {
        const message = describeCdnPropagation({ cdnVerified: false });

        expect(message).toMatch(/not\s+lost work/i);
        expect(message).toMatch(/git log/i);
    });

    it('quotes the real polling budget rather than a number typed by hand', () => {
        // Guards the one detail this message can get wrong in a way nobody
        // notices: claiming we waited a length of time we did not.
        expect(describeCdnPropagation({ cdnVerified: false })).toContain(
            `~${CDN_VERIFY_BUDGET_SECONDS}s`
        );
        expect(CDN_VERIFY_BUDGET_SECONDS).toBe(20);
    });

    it('does not call a FAILED publish propagation delay', () => {
        // Waiting fixes a slow edge. It does not fix a publish that never
        // happened, and saying so would send the caller off to wait forever.
        const message = describeCdnPropagation({ cdnVerified: false, cdnError: 'Helix 503' });

        expect(message).toContain('Helix 503');
        expect(message).toMatch(/not propagation delay/i);
    });
});
