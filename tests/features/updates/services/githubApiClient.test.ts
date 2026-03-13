/**
 * Unit tests for githubApiClient shared utilities
 */

jest.mock('vscode', () => ({}), { virtual: true });
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000 },
}));

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;

import { buildGitHubHeaders, fetchWithTimeout } from '@/features/updates/services/githubApiClient';

describe('githubApiClient', () => {
    const mockFetch = global.fetch as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('buildGitHubHeaders', () => {
        it('should include auth token when available', async () => {
            const mockSecrets = {
                get: jest.fn().mockResolvedValue('my-token'),
            };

            const headers = await buildGitHubHeaders(mockSecrets as any);

            expect(headers['Authorization']).toBe('token my-token');
            expect(headers['Accept']).toBe('application/vnd.github.v3+json');
            expect(headers['User-Agent']).toBe('Demo-Builder-VSCode');
        });

        it('should omit auth header when no token stored', async () => {
            const mockSecrets = {
                get: jest.fn().mockResolvedValue(undefined),
            };

            const headers = await buildGitHubHeaders(mockSecrets as any);

            expect(headers['Authorization']).toBeUndefined();
            expect(headers['Accept']).toBe('application/vnd.github.v3+json');
        });
    });

    describe('fetchWithTimeout', () => {
        it('should pass options through to fetch and return response', async () => {
            const mockResponse = { ok: true, status: 200 };
            mockFetch.mockResolvedValueOnce(mockResponse);

            const result = await fetchWithTimeout('https://api.github.com/test', {
                headers: { 'X-Custom': 'value' },
            });

            expect(result).toBe(mockResponse);
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.github.com/test',
                expect.objectContaining({
                    headers: { 'X-Custom': 'value' },
                    signal: expect.any(AbortSignal),
                }),
            );
        });

        it('should propagate fetch errors', async () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            mockFetch.mockRejectedValueOnce(abortError);

            await expect(
                fetchWithTimeout('https://api.github.com/test'),
            ).rejects.toThrow('The operation was aborted');
        });
    });

});
