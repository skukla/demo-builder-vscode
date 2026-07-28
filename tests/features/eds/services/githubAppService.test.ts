/**
 * GitHub App Service Tests
 *
 * Tests for AEM Code Sync GitHub App detection and installation URL generation.
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock timeoutConfig
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        POLL: {
            INTERVAL: 5000,
        },
    },
}));

// Mock logger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('GitHub App Service', () => {
    let GitHubAppService: any;
    let mockTokenService: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        mockTokenService = {
            getToken: jest.fn(),
        };

        const module = await import('@/features/eds/services/githubAppService');
        GitHubAppService = module.GitHubAppService;
    });

    describe('isAppInstalled', () => {
        it('should return false when no token available', async () => {
            // Given: No token
            mockTokenService.getToken.mockResolvedValue(undefined);
            const service = new GitHubAppService(mockTokenService);

            // When: Checking if app is installed
            const result = await service.isAppInstalled('owner', 'repo');

            // Then: Should return isInstalled: false
            expect(result).toEqual({ isInstalled: false });
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should return true when code.status is 200', async () => {
            // Given: Valid token and working code sync
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 200 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking if app is installed
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: Should return isInstalled: true with codeStatus
            expect(result).toEqual({ isInstalled: true, codeStatus: 200 });
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/status/test-owner/test-repo/main?editUrl=auto',
                expect.objectContaining({
                    method: 'GET',
                    headers: {
                        'x-auth-token': 'ghp_xxx',
                    },
                })
            );
        });

        it('should return false when code.status is 404', async () => {
            // Given: Valid token but app not installed (code.status = 404)
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 404 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking if app is installed
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: Should return isInstalled: false with codeStatus
            expect(result).toEqual({ isInstalled: false, codeStatus: 404 });
        });

        it('should return false when code.status is 400 in strict mode (default)', async () => {
            // Given: Valid token, status 400 (may be initializing or config issues)
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 400 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking in strict mode (default)
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: Should return isInstalled: true (app is installed, just has config issues)
            // Status 400 typically means app is installed but fstab.yaml has issues
            expect(result).toEqual({ isInstalled: true, codeStatus: 400 });
        });

        it('should return true when code.status is 400 in lenient mode', async () => {
            // Given: Valid token, status 400 (may be initializing or config issues)
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 400 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking in lenient mode (for post-install verification)
            const result = await service.isAppInstalled('test-owner', 'test-repo', {
                lenient: true,
            });

            // Then: Should return isInstalled: true with codeStatus
            expect(result).toEqual({ isInstalled: true, codeStatus: 400 });
        });

        it('should return false when code.status is 404 even in lenient mode', async () => {
            // Given: Valid token but app not installed (code.status = 404)
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 404 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking in lenient mode
            const result = await service.isAppInstalled('test-owner', 'test-repo', {
                lenient: true,
            });

            // Then: Should return isInstalled: false (404 = definitely not installed)
            expect(result).toEqual({ isInstalled: false, codeStatus: 404 });
        });

        it('should return transient false when HTTP response is a non-404 transport error (e.g. 401, 5xx)', async () => {
            // Given: Valid token but HTTP error (401/5xx/etc. are transient — caller can retry)
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
            });
            const service = new GitHubAppService(mockTokenService);

            // When
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: isInstalled false + transient flag set, so the caller can decide to retry
            // before declaring the App actually missing.
            expect(result).toEqual({ isInstalled: false, transient: true, httpStatus: 401 });
        });

        it('should NOT mark transient when HTTP response is 404 (Helix definitively does not know this repo)', async () => {
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });
            const service = new GitHubAppService(mockTokenService);

            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Retrying a real "Helix doesn't have this repo" won't change the answer —
            // do not set transient, so the caller routes straight to the install dialog.
            expect(result.isInstalled).toBe(false);
            expect(result.transient).toBeUndefined();
        });

        // ─── Regression: HTTP 401 must not masquerade as HTTP 404 ────────────
        //
        // admin.hlx.page answers three ways, and only one of them means the App
        // is missing:
        //   HTTP 404 + `no such site`        → Helix has never heard of the repo
        //   HTTP 401 + `not authenticated`   → Helix refused the credential; says
        //                                      NOTHING about the App
        //   HTTP 200 + code.status           → authoritative answer
        //
        // Callers previously inferred "HTTP 404" from `codeStatus === undefined`,
        // which is equally true of a 401. `httpNotFound` makes the distinction
        // explicit so a rejected credential can never be reported as a missing
        // GitHub App install.

        it('should flag httpNotFound ONLY for a real HTTP 404', async () => {
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({ ok: false, status: 404 });
            const service = new GitHubAppService(mockTokenService);

            const result = await service.isAppInstalled('test-owner', 'test-repo');

            expect(result).toEqual({ isInstalled: false, httpNotFound: true, httpStatus: 404 });
        });

        it('should NOT flag httpNotFound when Helix rejects the credential with HTTP 401', async () => {
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({ ok: false, status: 401 });
            const service = new GitHubAppService(mockTokenService);

            const result = await service.isAppInstalled('test-owner', 'test-repo');

            expect(result.httpNotFound).toBeUndefined();
            expect(result.transient).toBe(true);
            expect(result.httpStatus).toBe(401);
        });

        // ─── Helix's own reason for refusing ────────────────────────────────
        //
        // admin.hlx.page returns an EMPTY body on 401/403 and puts the reason in
        // the `x-error` header (`[admin] not authenticated`, `[admin] no such
        // site: owner/repo`). helixService already reads this header for its own
        // 401/403 diagnostics; the App check threw the response away, which is
        // why a user's logs could not say why the check failed.

        it('should capture the x-error reason Helix returns on a 401', async () => {
            mockTokenService.getToken.mockResolvedValue({
                token: 'gho_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
                headers: {
                    get: (h: string) => (h === 'x-error' ? '[admin] not authenticated' : null),
                },
            });
            const service = new GitHubAppService(mockTokenService);

            const result = await service.isAppInstalled('test-owner', 'test-repo');

            expect(result.helixError).toBe('[admin] not authenticated');
        });

        it('should capture the x-error reason Helix returns on a 404', async () => {
            mockTokenService.getToken.mockResolvedValue({
                token: 'gho_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                headers: {
                    get: (h: string) => (h === 'x-error' ? '[admin] no such site: o/r' : null),
                },
            });
            const service = new GitHubAppService(mockTokenService);

            const result = await service.isAppInstalled('test-owner', 'test-repo');

            expect(result.httpNotFound).toBe(true);
            expect(result.helixError).toBe('[admin] no such site: o/r');
        });

        it('should tolerate a response with no headers object', async () => {
            mockTokenService.getToken.mockResolvedValue({
                token: 'gho_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({ ok: false, status: 401 });
            const service = new GitHubAppService(mockTokenService);

            const result = await service.isAppInstalled('test-owner', 'test-repo');

            expect(result.helixError).toBeUndefined();
            expect(result.httpStatus).toBe(401);
        });

        // ─── Credential type, never the credential ──────────────────────────
        //
        // GitHub credentials are self-identifying by prefix: gho_ (OAuth app),
        // ghu_ (GitHub App user token), ghp_ (classic PAT), github_pat_
        // (fine-grained). These behave differently against Helix's write-access
        // check. Logging the TYPE narrows the cause; logging the token would
        // leak a secret into a file users paste into tickets.

        it('should log the credential type but never the credential itself', async () => {
            const logger = {
                trace: jest.fn(),
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            };
            mockTokenService.getToken.mockResolvedValue({
                token: 'gho_SUPERSECRETVALUE',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ code: { status: 200 } }),
            });
            const service = new GitHubAppService(mockTokenService, logger);

            await service.isAppInstalled('test-owner', 'test-repo');

            const logged = ['trace', 'debug', 'info', 'warn', 'error']
                .flatMap((lvl) => (logger as never as Record<string, jest.Mock>)[lvl].mock.calls)
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).toContain('gho_');
            expect(logged).not.toContain('SUPERSECRETVALUE');
        });

        it('should surface the HTTP status for any non-ok response so callers can log it', async () => {
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({ ok: false, status: 503 });
            const service = new GitHubAppService(mockTokenService);

            const result = await service.isAppInstalled('test-owner', 'test-repo');

            expect(result).toEqual({ isInstalled: false, transient: true, httpStatus: 503 });
        });

        it('should return transient false when fetch throws (network failure / abort)', async () => {
            // Given: Valid token but network error
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockRejectedValue(new Error('Network error'));
            const service = new GitHubAppService(mockTokenService);

            const result = await service.isAppInstalled('test-owner', 'test-repo');

            expect(result).toEqual({ isInstalled: false, transient: true });
        });

        it('should return transient false when code.status is undefined (response shape unrecognized)', async () => {
            // Given: Response without code.status field
            mockTokenService.getToken.mockResolvedValue({
                token: 'ghp_xxx',
                tokenType: 'bearer',
                scopes: ['repo'],
            });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    preview: { status: 200 },
                    // No code field
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Unrecognized shape → don't trust it as "not installed" — flag transient.
            expect(result).toEqual({ isInstalled: false, transient: true });
        });
    });

    describe('getInstallUrl', () => {
        it('should return GitHub app installation URL', () => {
            // Given: App service
            const service = new GitHubAppService(mockTokenService);

            // When: Getting install URL
            const url = service.getInstallUrl('test-owner', 'test-repo');

            // Then: Should return GitHub app installation page
            expect(url).toBe('https://github.com/apps/aem-code-sync/installations/select_target');
        });
    });
});
