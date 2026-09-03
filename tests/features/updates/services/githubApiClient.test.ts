/**
 * Unit tests for githubApiClient shared utilities
 */


// Mock global fetch
global.fetch = jest.fn();

import {
    buildGitHubHeaders,
    compareCommits,
    fetchWithTimeout,
    getLatestBranchCommit,
    getLatestRelease,
} from '@/features/updates/services/githubApiClient';

import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
describe('githubApiClient', () => {
    const mockFetch = global.fetch as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('buildGitHubHeaders', () => {
        it('should include auth token when available', async () => {
            // Keyed, not blanket. The old fake resolved its token for ANY key, so
            // a rename of `githubToken` in production would not have failed here —
            // a fake more generous than the real thing, which is the shape this
            // repo has been bitten by.
            const mockSecrets = createMockSecretStorage({ githubToken: 'my-token' }).secrets;

            const headers = await buildGitHubHeaders(mockSecrets as any);

            expect(headers['Authorization']).toBe('token my-token');
            expect(headers['Accept']).toBe('application/vnd.github.v3+json');
            expect(headers['User-Agent']).toBe('Demo-Builder-VSCode');
        });

        it('should omit auth header when no token stored', async () => {
            // Empty store: `get` resolves undefined for every key.
            const mockSecrets = createMockSecretStorage().secrets;

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
                })
            );
        });

        it('should propagate fetch errors', async () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            mockFetch.mockRejectedValueOnce(abortError);

            await expect(fetchWithTimeout('https://api.github.com/test')).rejects.toThrow(
                'The operation was aborted'
            );
        });
    });

    describe('getLatestBranchCommit', () => {
        const mockSecrets = createMockSecretStorage({ githubToken: 'tok' }).secrets;

        it('should return commit SHA on success', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ commit: { sha: 'abc123' } }),
            });

            const sha = await getLatestBranchCommit(mockSecrets, 'owner', 'repo', 'main');

            expect(sha).toBe('abc123');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.github.com/repos/owner/repo/branches/main',
                expect.objectContaining({ headers: expect.any(Object) })
            );
        });

        it('should return null on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

            const sha = await getLatestBranchCommit(mockSecrets, 'owner', 'repo', 'main');

            expect(sha).toBeNull();
        });

        it('should return null on network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const sha = await getLatestBranchCommit(mockSecrets, 'owner', 'repo', 'main');

            expect(sha).toBeNull();
        });
    });

    describe('getLatestRelease', () => {
        const mockSecrets = createMockSecretStorage({ githubToken: 'tok' }).secrets;

        it('should return tag + version on success and strip a v-prefix', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ tag_name: 'v3.5.0', name: 'Release 3.5.0' }),
            });

            const result = await getLatestRelease(
                mockSecrets,
                'adobe-commerce',
                'commerce-extensibility-tools'
            );

            expect(result).toEqual({ tag: 'v3.5.0', version: '3.5.0' });
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.github.com/repos/adobe-commerce/commerce-extensibility-tools/releases/latest',
                expect.objectContaining({ headers: expect.any(Object) })
            );
        });

        it('should preserve a tag that has no v-prefix', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ tag_name: '3.5.0' }),
            });

            const result = await getLatestRelease(mockSecrets, 'owner', 'repo');

            expect(result).toEqual({ tag: '3.5.0', version: '3.5.0' });
        });

        it('should return null when tag_name is missing', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ name: 'No tag here' }),
            });

            expect(await getLatestRelease(mockSecrets, 'owner', 'repo')).toBeNull();
        });

        it('should return null on non-ok response (404, 403, etc.)', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

            expect(await getLatestRelease(mockSecrets, 'owner', 'repo')).toBeNull();
        });

        it('should return null on network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            expect(await getLatestRelease(mockSecrets, 'owner', 'repo')).toBeNull();
        });

        it('should return null when version is not a valid semver string', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ tag_name: 'beta' }),
            });

            expect(await getLatestRelease(mockSecrets, 'owner', 'repo')).toBeNull();
        });
    });

    describe('compareCommits', () => {
        const mockSecrets = createMockSecretStorage({ githubToken: 'tok' }).secrets;

        it('should return comparison data on success', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ahead_by: 5,
                }),
            });

            const result = await compareCommits(mockSecrets, 'owner', 'repo', 'aaa', 'bbb');

            expect(result).toEqual({
                ahead_by: 5,
            });
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.github.com/repos/owner/repo/compare/aaa...bbb',
                expect.objectContaining({ headers: expect.any(Object) })
            );
        });

        it('should return null on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

            const result = await compareCommits(mockSecrets, 'owner', 'repo', 'aaa', 'bbb');

            expect(result).toBeNull();
        });

        it('should return null on network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await compareCommits(mockSecrets, 'owner', 'repo', 'aaa', 'bbb');

            expect(result).toBeNull();
        });
    });
});
