/**
 * GitHub Token Service Tests
 *
 * Tests for token management methods extracted from GitHubService.
 */


// Mock Octokit — the real code calls `Octokit.plugin(retry)` which returns a
// constructor; the mock has to expose `.plugin()` returning itself so the
// downstream `new` succeeds.
jest.mock('@octokit/core', () => {
    const MockOctokit: any = jest.fn().mockImplementation(() => ({
        request: jest.fn(),
    }));
    MockOctokit.plugin = jest.fn(() => MockOctokit);
    return { Octokit: MockOctokit };
});

jest.mock('@octokit/plugin-retry', () => ({
    retry: jest.fn(() => ({})),
}));

// Mock timeoutConfig - includes custom TTL for tokens
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        TOKEN_VALIDATION_TTL: 1000, // Custom TTL for token validation
        QUICK: 5000, // Fast operations
    },
}));

// Mock logger

describe('GitHub Token Service', () => {
    let GitHubTokenService: any;
    let mockSecretStorage: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        mockSecretStorage = {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
        };

        const module = await import('@/features/eds/services/github/githubTokenService');
        GitHubTokenService = module.GitHubTokenService;
    });

    describe('storeToken', () => {
        it('should store token as JSON string', async () => {
            // Given: Token service
            const service = new GitHubTokenService(mockSecretStorage);
            const token = { token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] };

            // When: Storing token
            await service.storeToken(token);

            // Then: Token should be stored as JSON
            expect(mockSecretStorage.store).toHaveBeenCalledWith(
                'github-token',
                JSON.stringify(token)
            );
        });
    });

    describe('getToken', () => {
        it('should return parsed token when stored', async () => {
            // Given: Stored token
            const service = new GitHubTokenService(mockSecretStorage);
            const storedToken = { token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // When: Getting token
            const result = await service.getToken();

            // Then: Token should be parsed
            expect(result).toEqual(storedToken);
        });

        it('should return undefined when no token stored', async () => {
            // Given: No stored token
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When: Getting token
            const result = await service.getToken();

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should return undefined for invalid JSON', async () => {
            // Given: Invalid JSON in storage
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue('not-valid-json');

            // When: Getting token
            const result = await service.getToken();

            // Then: Should return undefined (not throw)
            expect(result).toBeUndefined();
        });
    });

    describe('clearToken', () => {
        it('should delete token from storage', async () => {
            // Given: Token service
            const service = new GitHubTokenService(mockSecretStorage);

            // When: Clearing token
            await service.clearToken();

            // Then: Token should be deleted
            expect(mockSecretStorage.delete).toHaveBeenCalledWith('github-token');
        });

        it('should invalidate validation cache', async () => {
            // Given: Token service with cached validation
            const service = new GitHubTokenService(mockSecretStorage);
            // Store a token first
            const token = { token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(token));

            // When: Clearing token
            await service.clearToken();

            // Then: Cache should be invalidated (next validation should hit API)
            expect(mockSecretStorage.delete).toHaveBeenCalled();
        });
    });

    describe('validateToken', () => {
        it('should return valid=false when no token stored', async () => {
            // Given: No stored token
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When: Validating
            const result = await service.validateToken();

            // Then: Should be invalid
            expect(result.valid).toBe(false);
        });
    });

    describe('hasToken', () => {
        it('should return true when token exists', async () => {
            // Given: Stored token
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(JSON.stringify({ token: 'xxx' }));

            // When: Checking token existence
            const result = await service.hasToken();

            // Then: Should return true
            expect(result).toBe(true);
        });

        it('should return false when no token', async () => {
            // Given: No stored token
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When: Checking token existence
            const result = await service.hasToken();

            // Then: Should return false
            expect(result).toBe(false);
        });
    });


    /**
     * The validated-token path, end to end.
     *
     * Nothing exercised it before this: the whole success branch, the user
     * mapping, the 401 self-clear and the five-minute cache were all reachable
     * only by a test that lets `GET /user` answer.
     */
    describe('validateToken against a live-shaped GitHub response', () => {
        const STORED = { token: 'ghp_stored', tokenType: 'bearer', scopes: ['repo'] };

        /** Point the mocked Octokit constructor at a request fake. */
        const useOctokit = async (request: jest.Mock) => {
            const { Octokit } = await import('@octokit/core');
            (Octokit as unknown as jest.Mock).mockImplementation(() => ({ request }));
            return Octokit as unknown as jest.Mock;
        };

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('maps the API user onto GitHubUser and authenticates with the STORED token', async () => {
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(STORED));
            const request = jest.fn().mockResolvedValue({
                data: {
                    login: 'octocat',
                    email: 'octo@github.com',
                    name: 'Octo Cat',
                    avatar_url: 'https://avatars.example/1',
                },
            });
            const Octokit = await useOctokit(request);

            const result = await service.validateToken();

            // The ARGUMENT is the point: a validation run against some other
            // token says nothing about the one we stored.
            expect(Octokit).toHaveBeenCalledWith({ auth: 'ghp_stored' });
            expect(request).toHaveBeenCalledWith('GET /user');
            expect(result).toEqual({
                valid: true,
                user: {
                    login: 'octocat',
                    email: 'octo@github.com',
                    name: 'Octo Cat',
                    avatarUrl: 'https://avatars.example/1',
                },
            });
        });

        it('normalises every absent profile field to null, not to undefined or ""', async () => {
            // GitHubUser declares these as `string | null`. An account with a
            // private email answers `null`, and a missing avatar answers ''.
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(STORED));
            await useOctokit(
                jest.fn().mockResolvedValue({
                    data: { login: 'ghost', email: null, name: undefined, avatar_url: '' },
                })
            );

            const result = await service.validateToken();

            expect(result.user).toEqual({
                login: 'ghost',
                email: null,
                name: null,
                avatarUrl: null,
            });
        });

        it('clears the stored token when GitHub rejects it with a 401', async () => {
            // A 401 means the token is dead. Leaving it in SecretStorage makes
            // every later call fail the same way with nothing to re-auth.
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(STORED));
            await useOctokit(
                jest.fn().mockRejectedValue(Object.assign(new Error('Bad credentials'), { status: 401 }))
            );

            const result = await service.validateToken();

            expect(result).toEqual({ valid: false });
            expect(mockSecretStorage.delete).toHaveBeenCalledWith('github-token');
        });

        it('KEEPS the token when the failure is not a 401', async () => {
            // A 500 or a network drop says nothing about the credential.
            // Clearing on those signs the user out over a transient outage.
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(STORED));
            await useOctokit(
                jest.fn().mockRejectedValue(Object.assign(new Error('Server error'), { status: 500 }))
            );

            const result = await service.validateToken();

            expect(result).toEqual({ valid: false });
            expect(mockSecretStorage.delete).not.toHaveBeenCalled();
        });
    });

    /**
     * The validation cache is a TTL window, and the window has both edges.
     *
     * `Date.now` is pinned rather than advanced with timers so each test names
     * the exact age it is asserting about. TTL is 1000ms in this suite's
     * `timeoutConfig` mock.
     */
    describe('validateToken caches within the TTL and re-checks past it', () => {
        const STORED = { token: 'ghp_stored', tokenType: 'bearer', scopes: ['repo'] };

        /**
         * Validate once at `firstAt`, then again at `secondAt`, and report how
         * many times GitHub was actually asked.
         */
        const validateTwice = async (firstAt: number, secondAt: number) => {
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(STORED));
            const request = jest.fn().mockResolvedValue({ data: { login: 'octocat' } });
            const { Octokit } = await import('@octokit/core');
            (Octokit as unknown as jest.Mock).mockImplementation(() => ({ request }));
            const now = jest.spyOn(Date, 'now').mockReturnValue(firstAt);

            await service.validateToken();
            now.mockReturnValue(secondAt);
            const second = await service.validateToken();

            return { request, second };
        };

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('answers from cache 500ms later without asking GitHub again', async () => {
            const { request, second } = await validateTwice(10_000, 10_500);

            expect(request).toHaveBeenCalledTimes(1);
            expect(second).toEqual({ valid: true, user: expect.objectContaining({ login: 'octocat' }) });
        });

        it('re-checks 1500ms later, past the TTL', async () => {
            const { request } = await validateTwice(10_000, 11_500);

            expect(request).toHaveBeenCalledTimes(2);
        });

        it('treats an age of exactly the TTL as expired', async () => {
            // The window is `age < ttl`. `<=` would serve one stale answer at
            // the boundary, which is the hardest kind of staleness to reproduce.
            const { request } = await validateTwice(10_000, 11_000);

            expect(request).toHaveBeenCalledTimes(2);
        });
    });

    describe('getUserOrgs', () => {
        it('returns the list of org logins for the authenticated user', async () => {
            // Given: stored token, /user/orgs returns three orgs
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(JSON.stringify({ token: 'xxx' }));

            const mockRequest = jest.fn().mockResolvedValue({
                data: [
                    { login: 'adobe' },
                    { login: 'demo-system-stores' },
                    { login: 'hlxsites' },
                ],
            });
            const { Octokit } = await import('@octokit/core');
            (Octokit as unknown as jest.Mock).mockImplementation(() => ({ request: mockRequest }));

            // When
            const orgs = await service.getUserOrgs();

            // Then
            expect(orgs).toEqual(['adobe', 'demo-system-stores', 'hlxsites']);
            expect(mockRequest).toHaveBeenCalledWith('GET /user/orgs', expect.objectContaining({ per_page: 100 }));
        });

        it('returns empty array when no token is stored', async () => {
            // Given: no stored token
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When
            const orgs = await service.getUserOrgs();

            // Then: empty (picker degrades to "personal account only")
            expect(orgs).toEqual([]);
        });

        it('returns empty array when the GitHub request fails (graceful degradation)', async () => {
            // Given: stored token, but /user/orgs throws (network, scope, etc.)
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(JSON.stringify({ token: 'xxx' }));

            const mockRequest = jest.fn().mockRejectedValue(new Error('Network error'));
            const { Octokit } = await import('@octokit/core');
            (Octokit as unknown as jest.Mock).mockImplementation(() => ({ request: mockRequest }));

            // When
            const orgs = await service.getUserOrgs();

            // Then: empty, not throw — wizard should still advance with personal-only picker
            expect(orgs).toEqual([]);
        });
    });
});
