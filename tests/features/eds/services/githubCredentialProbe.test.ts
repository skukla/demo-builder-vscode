/**
 * GitHub ↔ AEM credential triangulation probe
 *
 * Three questions, asked together because none of them is decisive alone:
 *   1. Who are we signed in as, and with which granted scopes?   (GET /user)
 *   2. Does GitHub agree this user can write to the repo?        (permissions.push)
 *   3. What does AEM say when handed that same credential?       (admin.hlx.page)
 *
 * The pairing that matters is `push: true` + AEM 401. That combination rules out
 * scope and permission problems outright — it is the branch we could not
 * distinguish during the 2026-07-24 field failure, where a user was told to
 * install a GitHub App that was already installed and syncing.
 */

import { probeGitHubCredential } from '@/features/eds/services/githubCredentialProbe';
import type { Logger } from '@/types/logger';

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { NORMAL: 30000, QUICK: 5000 },
}));

const REPO = 'sayurihanki/herberaircraftv3';
const TOKEN = 'gho_SUPERSECRETVALUE';

function makeLogger(): Logger {
    return {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as Logger;
}

function loggedText(logger: Logger): string {
    const l = logger as unknown as Record<string, jest.Mock>;
    return ['trace', 'debug', 'info', 'warn', 'error']
        .flatMap((lvl) => l[lvl].mock.calls.map((c) => String(c[0])))
        .join('\n');
}

const tokenService = (token?: string) => ({
    getToken: jest
        .fn()
        .mockResolvedValue(token ? { token, tokenType: 'bearer', scopes: [] } : undefined),
});

/** Route each mocked response by URL so tests read as scenarios, not call order. */
function routeFetch(routes: { user?: unknown; repo?: unknown; admin?: unknown }) {
    mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.github.com/user')) {
            if (routes.user instanceof Error) return Promise.reject(routes.user);
            return Promise.resolve(routes.user);
        }
        if (url.includes('api.github.com/repos/')) {
            if (routes.repo instanceof Error) return Promise.reject(routes.repo);
            return Promise.resolve(routes.repo);
        }
        if (url.includes('admin.hlx.page')) {
            if (routes.admin instanceof Error) return Promise.reject(routes.admin);
            return Promise.resolve(routes.admin);
        }
        return Promise.reject(new Error(`unexpected url: ${url}`));
    });
}

const okUser = (login = 'sayurihanki', scopes = 'repo, user, read:org') => ({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ login }),
    headers: { get: (h: string) => (h.toLowerCase() === 'x-oauth-scopes' ? scopes : null) },
});

const okRepo = (push: boolean) => ({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ permissions: { push, pull: true, admin: push } }),
    headers: { get: () => null },
});

const adminResponse = (status: number, xError?: string, codeStatus?: number) => ({
    ok: status === 200,
    status,
    json: jest
        .fn()
        .mockResolvedValue(codeStatus !== undefined ? { code: { status: codeStatus } } : {}),
    headers: { get: (h: string) => (h.toLowerCase() === 'x-error' ? (xError ?? null) : null) },
});

describe('probeGitHubCredential', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('the decisive case', () => {
        it('reports that AEM rejects a credential GitHub accepts', async () => {
            routeFetch({
                user: okUser(),
                repo: okRepo(true),
                admin: adminResponse(401, '[admin] not authenticated'),
            });

            const result = await probeGitHubCredential(tokenService(TOKEN), REPO, makeLogger());

            expect(result.repo?.canPush).toBe(true);
            expect(result.adminApi?.httpStatus).toBe(401);
            expect(result.adminApi?.xError).toBe('[admin] not authenticated');
            // The whole point of asking all three: this rules out scope/permission.
            expect(result.verdict).toMatch(/not a (scope|permission)/i);
        });
    });

    describe('other verdicts', () => {
        it('reports when no credential is stored', async () => {
            const result = await probeGitHubCredential(tokenService(undefined), REPO, makeLogger());

            expect(result.github.reachable).toBe(false);
            expect(result.verdict).toMatch(/not signed in/i);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('reports when GitHub itself rejects the credential', async () => {
            routeFetch({ user: { ok: false, status: 401, headers: { get: () => null } } });

            const result = await probeGitHubCredential(tokenService(TOKEN), REPO, makeLogger());

            expect(result.github.reachable).toBe(false);
            expect(result.verdict).toMatch(/github rejected/i);
        });

        it('reports when the signed-in user lacks write access', async () => {
            routeFetch({
                user: okUser('someone-else'),
                repo: okRepo(false),
                admin: adminResponse(401, '[admin] not authenticated'),
            });

            const result = await probeGitHubCredential(tokenService(TOKEN), REPO, makeLogger());

            expect(result.repo?.canPush).toBe(false);
            expect(result.verdict).toMatch(/write access/i);
            expect(result.verdict).toContain('someone-else');
        });

        it('reports that AEM does not know the repo on a 404', async () => {
            routeFetch({
                user: okUser(),
                repo: okRepo(true),
                admin: adminResponse(404, '[admin] no such site: o/r'),
            });

            const result = await probeGitHubCredential(tokenService(TOKEN), REPO, makeLogger());

            expect(result.verdict).toMatch(/not installed/i);
        });

        it('reports a healthy credential when every leg agrees', async () => {
            routeFetch({
                user: okUser(),
                repo: okRepo(true),
                admin: adminResponse(200, undefined, 200),
            });

            const result = await probeGitHubCredential(tokenService(TOKEN), REPO, makeLogger());

            expect(result.adminApi?.codeStatus).toBe(200);
            expect(result.verdict).toMatch(/healthy/i);
        });
    });

    describe('what it collects', () => {
        it('captures the login and the scopes GitHub actually granted', async () => {
            routeFetch({
                user: okUser('sayurihanki', 'repo, workflow'),
                repo: okRepo(true),
                admin: adminResponse(200, undefined, 200),
            });

            const result = await probeGitHubCredential(tokenService(TOKEN), REPO, makeLogger());

            expect(result.github.login).toBe('sayurihanki');
            // Granted, not requested — our stored record hardcodes the requested
            // set, so only this header can answer the scope question.
            expect(result.github.grantedScopes).toEqual(['repo', 'workflow']);
        });

        it('sends the credential as a bearer token to GitHub', async () => {
            routeFetch({
                user: okUser(),
                repo: okRepo(true),
                admin: adminResponse(200, undefined, 200),
            });

            await probeGitHubCredential(tokenService(TOKEN), REPO, makeLogger());

            const userCall = mockFetch.mock.calls.find((c) =>
                String(c[0]).includes('api.github.com/user')
            );
            expect(userCall?.[1]?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
        });
    });

    describe('degradation', () => {
        it('still reports identity when no repo is known', async () => {
            routeFetch({ user: okUser() });

            const result = await probeGitHubCredential(
                tokenService(TOKEN),
                undefined,
                makeLogger()
            );

            expect(result.github.login).toBe('sayurihanki');
            expect(result.repo).toBeUndefined();
            expect(result.adminApi).toBeUndefined();
            expect(result.verdict).toMatch(/no .*project|repo/i);
        });

        it('records a failing leg without sinking the others', async () => {
            routeFetch({
                user: okUser(),
                repo: new Error('socket hang up'),
                admin: adminResponse(200, undefined, 200),
            });

            const result = await probeGitHubCredential(tokenService(TOKEN), REPO, makeLogger());

            expect(result.github.login).toBe('sayurihanki');
            expect(result.repo?.error).toContain('socket hang up');
            expect(result.adminApi?.httpStatus).toBe(200);
        });
    });

    describe('privacy', () => {
        it('never places the credential in the result or the logs', async () => {
            const logger = makeLogger();
            routeFetch({
                user: okUser(),
                repo: okRepo(true),
                admin: adminResponse(401, '[admin] not authenticated'),
            });

            const result = await probeGitHubCredential(tokenService(TOKEN), REPO, logger);

            // This output is designed to be pasted into tickets, and the repo is public.
            expect(JSON.stringify(result)).not.toContain('SUPERSECRETVALUE');
            expect(loggedText(logger)).not.toContain('SUPERSECRETVALUE');
        });
    });
});
