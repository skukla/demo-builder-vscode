/**
 * ForkSyncService Test Suite
 *
 * Tests fork status checking and upstream sync functionality:
 * - Fork detection and behind-by count
 * - Non-fork repository handling
 * - 404 (repo not found) handling
 * - Network timeout handling
 * - Merge-upstream success and conflict
 * - Rate limit (403) error handling
 *
 * Total tests: 8
 */

// Mock vscode
jest.mock('vscode', () => ({}), { virtual: true });

// Mock Logger
jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Mock timeoutConfig (used by githubApiClient)
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000,
    },
}));

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;

import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import type { ForkStatus, ForkSyncResult } from '@/features/updates/services/forkSyncService';

describe('ForkSyncService', () => {
    let service: ForkSyncService;
    let mockSecrets: any;
    let mockLogger: any;
    const mockFetch = global.fetch as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSecrets = {
            get: jest.fn().mockResolvedValue('test-github-token'),
            store: jest.fn(),
            delete: jest.fn(),
            onDidChange: jest.fn(),
        };

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

        service = new ForkSyncService(mockSecrets, mockLogger);
    });

    describe('checkForkStatus', () => {
        it('should detect fork behind upstream by N commits', async () => {
            // First call: GET /repos/{owner}/{repo} - returns fork info
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        fork: true,
                        default_branch: 'main',
                        parent: {
                            full_name: 'demo-system-stores/accs-citisignal',
                            default_branch: 'main',
                        },
                    }),
                })
                // Second call: GET compare endpoint - returns behind_by
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        ahead_by: 5,
                    }),
                });

            const result = await service.checkForkStatus('my-org', 'accs-citisignal');

            expect(result).not.toBeNull();
            expect(result!.isFork).toBe(true);
            expect(result!.behindBy).toBe(5);
            expect(result!.parentFullName).toBe('demo-system-stores/accs-citisignal');
            expect(result!.defaultBranch).toBe('main');
        });

        it('should report fork is up to date when behind_by is 0', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        fork: true,
                        default_branch: 'main',
                        parent: {
                            full_name: 'demo-system-stores/accs-citisignal',
                            default_branch: 'main',
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        ahead_by: 0,
                    }),
                });

            const result = await service.checkForkStatus('my-org', 'accs-citisignal');

            expect(result).not.toBeNull();
            expect(result!.isFork).toBe(true);
            expect(result!.behindBy).toBe(0);
        });

        it('should handle non-fork repo', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    fork: false,
                    default_branch: 'main',
                }),
            });

            const result = await service.checkForkStatus('my-org', 'my-repo');

            expect(result).not.toBeNull();
            expect(result!.isFork).toBe(false);
            expect(result!.behindBy).toBe(0);
            // Should NOT make a second API call for compare
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should return null on 404 (repo not found)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            const result = await service.checkForkStatus('my-org', 'nonexistent');

            expect(result).toBeNull();
            expect(mockLogger.debug).toHaveBeenCalled();
        });

        it('should return null on network timeout', async () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            mockFetch.mockRejectedValueOnce(abortError);

            const result = await service.checkForkStatus('my-org', 'my-repo');

            expect(result).toBeNull();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Timeout'),
            );
        });
    });

    describe('syncFork', () => {
        it('should call merge-upstream and return success', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    message: 'Successfully fetched and fast-forwarded from upstream',
                    merge_type: 'fast-forward',
                }),
            });

            const result = await service.syncFork('my-org', 'accs-citisignal', 'main');

            expect(result.success).toBe(true);
            expect(result.conflict).toBeUndefined();
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.github.com/repos/my-org/accs-citisignal/merge-upstream',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ branch: 'main' }),
                }),
            );
        });

        it('should handle 409 (diverged fork) and return conflict', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 409,
                json: async () => ({
                    message: 'Merge conflict',
                }),
            });

            const result = await service.syncFork('my-org', 'accs-citisignal', 'main');

            expect(result.success).toBe(false);
            expect(result.conflict).toBe(true);
            expect(result.message).toBeTruthy();
        });

        it('should throw rate limit error on 403 with rate limit message', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                json: async () => ({
                    message: 'API rate limit exceeded',
                }),
            });

            await expect(
                service.syncFork('my-org', 'accs-citisignal', 'main'),
            ).rejects.toThrow(/rate limit/i);
        });

        it('should throw permission error on 403 without rate limit message', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                json: async () => ({
                    message: 'Resource not accessible by personal access token',
                }),
            });

            await expect(
                service.syncFork('my-org', 'accs-citisignal', 'main'),
            ).rejects.toThrow(/permission denied/i);
        });
    });
});
