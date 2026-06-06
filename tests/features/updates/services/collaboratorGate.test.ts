/**
 * collaboratorGate Test Suite
 *
 * Verifies the early-access gate: reads the EDS-stored GitHub token directly,
 * checks identity (GET /user) + collaborator status, caches the result, and
 * fails closed (returns false) on ANY error. Never logs the token.
 */

// Mock vscode (only the SecretStorage type/namespace is referenced)
jest.mock('vscode', () => ({}), { virtual: true });

// Mock timeout/cache constants
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000 },
    CACHE_TTL: { MEDIUM: 300000 },
}));

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

const mockFetch = fetchWithTimeout as jest.Mock;

const TOKEN = 'secret-token-abc123';

function makeSecrets(stored?: string): any {
    return { get: jest.fn().mockResolvedValue(stored) };
}

function makeLogger(): any {
    return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
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
            mockFetch
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 404 });

            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
        });
    });

    describe('failure modes fail closed', () => {
        it('returns false when GET /user is unauthorized (401)', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
        });

        it('returns false when GET /user rejects (network error)', async () => {
            mockFetch.mockRejectedValueOnce(new Error('network down'));
            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
        });

        it('returns false when collaborator endpoint returns 403', async () => {
            mockFetch
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 403 });
            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
        });

        it('returns false when collaborator endpoint returns 500', async () => {
            mockFetch
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 500 });
            const result = await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());
            expect(result).toBe(false);
        });
    });

    describe('caching (TTL)', () => {
        it('serves the second call within TTL from cache (one round of fetches)', async () => {
            mockFetch
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 204 });
            const secrets = makeSecrets(tokenBlob());

            const first = await isRepoCollaborator(secrets, makeLogger());
            const second = await isRepoCollaborator(secrets, makeLogger());

            expect(first).toBe(true);
            expect(second).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(2); // not 4
        });

        it('caches a negative result too (no re-fetch within TTL)', async () => {
            mockFetch
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 404 });
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
    });

    describe('security', () => {
        it('never logs the token value', async () => {
            mockFetch
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 204 });
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
            mockFetch
                .mockResolvedValueOnce(userOk())
                .mockResolvedValueOnce({ status: 204 });

            await isRepoCollaborator(makeSecrets(tokenBlob()), makeLogger());

            const [, options] = mockFetch.mock.calls[0];
            expect(options.headers.Authorization).toBe(`token ${TOKEN}`);
        });
    });
});
