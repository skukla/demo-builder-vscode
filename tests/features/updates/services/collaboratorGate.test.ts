/**
 * collaboratorGate Test Suite
 *
 * Verifies the early-access gate: reads the EDS-stored GitHub token directly,
 * checks identity (GET /user) + collaborator status, caches the result, and
 * fails closed (returns false) on ANY error. Never logs the token.
 */

// Mock the shared GitHub client so we control fetch behavior
jest.mock('@/features/updates/services/githubApiClient', () => ({
    GITHUB_API_BASE: 'https://api.github.com',
    fetchWithTimeout: jest.fn(),
}));

import {
    isRepoCollaborator,
    clearCollaboratorCache,
} from '@/features/updates/services/collaboratorGate';
import { fetchWithTimeout } from '@/features/updates/services/githubApiClient';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import { createMockLogger } from '../../../helpers/loggerFake';

const mockFetch = fetchWithTimeout as jest.Mock;

const TOKEN = 'secret-token-abc123';

function makeSecrets(stored?: string): any {
    return { get: jest.fn().mockResolvedValue(stored) };
}

function makeLogger(): any {
    return createMockLogger();
}

/** A valid EDS token blob (matches GitHubToken shape: { token, tokenType, scopes }). */
function tokenBlob(token = TOKEN): string {
    return JSON.stringify({ token, tokenType: 'bearer', scopes: ['repo'] });
}

function userOk(login = 'octocat') {
    return { ok: true, status: 200, json: async () => ({ login }) };
}

describe('collaboratorGate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearCollaboratorCache();
    });

    describe('token read', () => {
        it('returns false and makes no requests when no token is stored', async () => {
            const result = await isRepoCollaborator(makeSecrets(undefined), makeLogger());
            expect(result).toBe(false);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('returns false when the stored secret is not valid JSON', async () => {
            const result = await isRepoCollaborator(makeSecrets('not-json{'), makeLogger());
            expect(result).toBe(false);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('returns false when the token blob is missing the token field', async () => {
            const blob = JSON.stringify({ tokenType: 'bearer', scopes: [] });
            const result = await isRepoCollaborator(makeSecrets(blob), makeLogger());
            expect(result).toBe(false);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('reads the token from the key the EDS token service writes', async () => {
            const secrets = makeSecrets(undefined);
            await isRepoCollaborator(secrets, makeLogger());
            expect(secrets.get).toHaveBeenCalledWith('github-token');
        });

        it('does not send a token field that is not a string', async () => {
            const blob = JSON.stringify({ token: ['not', 'a', 'string'], tokenType: 'bearer' });
            const result = await isRepoCollaborator(makeSecrets(blob), makeLogger());
            expect(result).toBe(false);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('does not send an empty token', async () => {
            const result = await isRepoCollaborator(makeSecrets(tokenBlob('')), makeLogger());
            expect(result).toBe(false);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('identity + collaborator check', () => {
        it('returns true when GET /user is ok and collaborator endpoint returns 204', async () => {
            mockFetch
                .mockResolvedValueOnce(userOk('octocat'))
                .mockResolvedValueOnce({ status: 204 });

            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());

            expect(result).toBe(true);
            expect(mockFetch).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('/repos/skukla/demo-builder-vscode/collaborators/octocat'),
                expect.any(Object)
            );
        });

        it('returns false when the collaborator endpoint returns 404', async () => {
            mockFetch.mockResolvedValueOnce(userOk()).mockResolvedValueOnce({ status: 404 });

            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
        });

        it('asks GitHub who the token belongs to, with the v3 headers, on both requests', async () => {
            mockFetch
                .mockResolvedValueOnce(userOk('octocat'))
                .mockResolvedValueOnce({ status: 204 });

            await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());

            const expectedHeaders = {
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'Demo-Builder-VSCode',
                Authorization: `token ${TOKEN}`,
            };
            expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://api.github.com/user', {
                headers: expectedHeaders,
            });
            expect(mockFetch).toHaveBeenNthCalledWith(
                2,
                'https://api.github.com/repos/skukla/demo-builder-vscode/collaborators/octocat',
                { headers: expectedHeaders }
            );
        });

        it('does not trust the body of a non-ok /user response, even one carrying a login', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                json: async () => ({ login: 'octocat' }),
            });

            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());

            expect(result).toBe(false);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('does not look up a collaborator when /user gives no string login', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ login: 42 }),
            });

            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());

            expect(result).toBe(false);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('failure modes fail closed', () => {
        it('returns false when GET /user is unauthorized (401)', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('returns false when GET /user rejects (network error)', async () => {
            mockFetch.mockRejectedValueOnce(new Error('network down'));
            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
        });

        it('returns false when collaborator endpoint returns 403', async () => {
            mockFetch.mockResolvedValueOnce(userOk()).mockResolvedValueOnce({ status: 403 });
            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
        });

        it('returns false when collaborator endpoint returns 500', async () => {
            mockFetch.mockResolvedValueOnce(userOk()).mockResolvedValueOnce({ status: 500 });
            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
        });
    });

    describe('caching (TTL)', () => {
        it('serves the second call within TTL from cache (one round of fetches)', async () => {
            mockFetch.mockResolvedValueOnce(userOk()).mockResolvedValueOnce({ status: 204 });
            const secrets = makeSecrets(tokenBlob());

            const first = await isRepoCollaborator(secrets, makeLogger());
            const second = await isRepoCollaborator(secrets, makeLogger());

            expect(first).toBe(true);
            expect(second).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(2); // not 4
        });

        it('caches a negative result too (no re-fetch within TTL)', async () => {
            mockFetch.mockResolvedValueOnce(userOk()).mockResolvedValueOnce({ status: 404 });
            const secrets = makeSecrets(tokenBlob());

            await isRepoCollaborator(secrets, makeLogger());
            const second = await isRepoCollaborator(secrets, makeLogger());

            expect(second).toBe(false);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('re-checks after clearCollaboratorCache()', async () => {
            mockFetch
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 204 })
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 204 });
            const secrets = makeSecrets(tokenBlob());

            await isRepoCollaborator(secrets, makeLogger());
            clearCollaboratorCache();
            await isRepoCollaborator(secrets, makeLogger());

            expect(mockFetch).toHaveBeenCalledTimes(4);
        });

        it('re-checks once the cached answer is exactly CACHE_TTL.MEDIUM old', async () => {
            mockFetch
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 204 })
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 404 });
            const secrets = makeSecrets(tokenBlob());
            const t0 = 1_700_000_000_000;
            const now = jest.spyOn(Date, 'now').mockReturnValue(t0);

            const first = await isRepoCollaborator(secrets, makeLogger());
            now.mockReturnValue(t0 + CACHE_TTL.MEDIUM - 1);
            const stillCached = await isRepoCollaborator(secrets, makeLogger());
            now.mockReturnValue(t0 + CACHE_TTL.MEDIUM);
            const refreshed = await isRepoCollaborator(secrets, makeLogger());
            now.mockRestore();

            expect(first).toBe(true);
            expect(stillCached).toBe(true);
            expect(refreshed).toBe(false);
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });
    });

    describe('security', () => {
        it('never logs the token value', async () => {
            mockFetch.mockResolvedValueOnce(userOk()).mockResolvedValueOnce({ status: 204 });
            const logger = makeLogger();

            await isRepoCollaborator(makeSecrets(tokenBlob()), logger);

            const allLogged = [
                ...logger.debug.mock.calls,
                ...logger.info.mock.calls,
                ...logger.warn.mock.calls,
                ...logger.error.mock.calls,
            ]
                .flat()
                .map((a) => String(a))
                .join(' ');
            expect(allLogged).not.toContain(TOKEN);
        });

        it('sends the token in an Authorization: token <value> header', async () => {
            mockFetch.mockResolvedValueOnce(userOk()).mockResolvedValueOnce({ status: 204 });

            await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());

            const [, options] = mockFetch.mock.calls[0];
            expect(options.headers.Authorization).toBe(`token ${TOKEN}`);
        });
    });
});
