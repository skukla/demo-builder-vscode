/**
 * An INNER `code.status` that Helix will not stand behind is undetermined.
 *
 * Helix answers HTTP 200 and puts its real verdict in `code.status`. The outer
 * classifier already treats 401/403/5xx as transient — that fix exists because a
 * user was told eleven times to install an App that was installed. But a 403 in
 * the INNER status arrives inside a 200, so it never reaches that code, and
 * strict mode turned it into a definitive "App not installed".
 *
 * Measured live 2026-08-16 on `skukla/bodea-template-test`, one minute apart,
 * same repo, same 403, with the App demonstrably installed on GitHub:
 *
 *   19:54:17  code.status 403 → installed: true   (lenient)
 *   19:55:23  code.status 403 → installed: false  (strict) → "not installed"
 *
 * Only 200, 400 and 404 are answers. Everything else is a refusal to answer.
 */

// `export {}` makes this a MODULE. Without it tsc treats both this file and
// githubAppService.test.ts as scripts in one global scope and rejects the second
// `mockFetch` as a redeclaration — jest is unaffected, so only `typecheck:tests`
// catches it.
export {};

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { NORMAL: 30000, POLL: { INTERVAL: 5000 } },
}));

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('GitHubAppService — an inner code.status Helix will not stand behind', () => {
    let GitHubAppService: any;
    let mockTokenService: any;

    /** Helix answering HTTP 200 with `code.status` in the body. */
    const helixAnswers = (codeStatus: number) => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ code: { status: codeStatus } }),
        });
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        mockTokenService = { getToken: jest.fn().mockResolvedValue({ token: 'ghp_x' }) };
        const module = await import('@/features/eds/services/githubAppService');
        GitHubAppService = module.GitHubAppService;
    });

    it('flags a 403 as transient in STRICT mode rather than "not installed"', async () => {
        helixAnswers(403);
        const service = new GitHubAppService(mockTokenService);

        const result = await service.isAppInstalled('skukla', 'bodea-template-test');

        expect(result.transient).toBe(true);
        expect(result.isInstalled).toBe(false);
        expect(result.codeStatus).toBe(403);
    });

    // The lenient path must not change: the resolver checks isInstalled BEFORE
    // transient, so a permissive caller still gets its permissive answer.
    it('leaves the LENIENT verdict permissive for the same 403', async () => {
        helixAnswers(403);
        const service = new GitHubAppService(mockTokenService);

        const result = await service.isAppInstalled('skukla', 'bodea-template-test', {
            lenient: true,
        });

        expect(result.isInstalled).toBe(true);
        expect(result.transient).toBe(true);
    });

    /**
     * CONTROL. 404 must stay DEFINITIVE — it is the one inner status that really
     * does mean "Helix knows this repo and has no code sync for it". If this went
     * transient too, the fix would have destroyed the check's only real "no" and
     * the tests above would prove nothing.
     */
    it('CONTROL — 404 remains a definitive "not installed"', async () => {
        helixAnswers(404);
        const service = new GitHubAppService(mockTokenService);

        const result = await service.isAppInstalled('skukla', 'bodea-template-test');

        expect(result.isInstalled).toBe(false);
        expect(result.transient).toBeUndefined();
    });

    it.each([
        [200, 'working'],
        [400, 'initializing'],
    ])('CONTROL — %i stays a definitive installed (%s)', async (status) => {
        helixAnswers(status);
        const service = new GitHubAppService(mockTokenService);

        const result = await service.isAppInstalled('skukla', 'bodea-template-test');

        expect(result.isInstalled).toBe(true);
        expect(result.transient).toBeUndefined();
    });

    it.each([401, 429, 500])('treats an inner %i as undetermined too', async (status) => {
        helixAnswers(status);
        const service = new GitHubAppService(mockTokenService);

        const result = await service.isAppInstalled('skukla', 'bodea-template-test');

        expect(result.transient).toBe(true);
    });
});
