/**
 * check-github-app handler — HTTP 404 vs HTTP 401 classification
 *
 * The handler auto-triggers a Helix code sync when it believes Helix has not
 * indexed the repo yet (HTTP 404). It inferred that condition from
 * `codeStatus === undefined`, which is ALSO true when Helix rejects the
 * credential with HTTP 401. Consequence in the field: on a 401 the handler
 * logged "HTTP 404 detected - repo not indexed yet" and fired a code-sync
 * trigger that could only 401 in turn — roughly forty times in one minute
 * across two concurrent pollers. The log line was fiction, and it sent the
 * subsequent diagnosis after a nonexistent 404.
 *
 * A code sync must be triggered only on a genuine HTTP 404.
 */

import { checkGitHubApp } from '@/features/project-creation/handlers/checkGitHubAppHandler';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

const mockIsAppInstalled = jest.fn();
const mockPreviewCode = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => ({ tokenService: { getToken: jest.fn() } })),
}));

jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: mockIsAppInstalled,
        getInstallUrl: jest
            .fn()
            .mockReturnValue('https://github.com/apps/aem-code-sync/installations/select_target'),
    })),
}));

jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn().mockImplementation(() => ({ previewCode: mockPreviewCode })),
}));

function makeContext(): HandlerContext {
    return {
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            trace: jest.fn(),
        } as unknown as Logger,
        context: { secrets: {} },
    } as unknown as HandlerContext;
}

function allLogs(context: HandlerContext): string {
    const l = context.logger as unknown as Record<string, jest.Mock>;
    return ['info', 'debug', 'warn', 'error']
        .flatMap((level) => l[level].mock.calls.map((c) => String(c[0])))
        .join('\n');
}

const REQUEST = { owner: 'acme-demos', repo: 'aircraft-demo' };

describe('checkGitHubApp handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPreviewCode.mockResolvedValue(undefined);
    });

    it('reports installed when Helix answers with code.status 200', async () => {
        mockIsAppInstalled.mockResolvedValue({ isInstalled: true, codeStatus: 200 });
        const context = makeContext();

        const result = await checkGitHubApp(context, REQUEST);

        expect(result.success).toBe(true);
        expect(result.isInstalled).toBe(true);
        expect(mockPreviewCode).not.toHaveBeenCalled();
    });

    it('triggers a code sync on a genuine HTTP 404', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            httpNotFound: true,
            httpStatus: 404,
        });
        const context = makeContext();

        await checkGitHubApp(context, REQUEST);

        expect(mockPreviewCode).toHaveBeenCalled();
    });

    it('does NOT trigger a code sync when Helix rejects the credential (HTTP 401)', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
        });
        const context = makeContext();

        const result = await checkGitHubApp(context, REQUEST);

        expect(mockPreviewCode).not.toHaveBeenCalled();
        expect(result.codeSyncTriggered).toBe(false);
    });

    it('does NOT claim "HTTP 404" in the log when the response was 401', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
        });
        const context = makeContext();

        await checkGitHubApp(context, REQUEST);

        expect(allLogs(context)).not.toContain('HTTP 404');
    });

    it('records the actual HTTP status in the log', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
        });
        const context = makeContext();

        await checkGitHubApp(context, REQUEST);

        expect(allLogs(context)).toContain('401');
    });

    // ─── The response the UI acts on ────────────────────────────────────────
    //
    // Every UI consumer keys off `isInstalled === false` to show the install
    // prompt. If an undetermined check reports plain `isInstalled: false` with
    // an installUrl, the wizard hands the user the same dead-end instruction
    // the storefront gate used to — the defect simply moves one layer out.

    it('marks an undetermined check as undetermined, not uninstalled', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
            helixError: '[admin] not authenticated',
        });
        const context = makeContext();

        const result = await checkGitHubApp(context, REQUEST);

        expect(result.undetermined).toBe(true);
    });

    it('withholds the install URL when the check was undetermined', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
        });
        const context = makeContext();

        const result = await checkGitHubApp(context, REQUEST);

        // No install URL means no "Install App" button to send the user down.
        expect(result.installUrl).toBeUndefined();
    });

    it('explains an undetermined check in terms the user can act on', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
        });
        const context = makeContext();

        const result = await checkGitHubApp(context, REQUEST);

        expect(String(result.reason)).toMatch(/401/);
        expect(String(result.reason)).toMatch(/sign-in|credential/i);
    });

    it('still offers the install URL when the App is genuinely absent', async () => {
        mockIsAppInstalled.mockResolvedValue({ isInstalled: false, codeStatus: 404 });
        const context = makeContext();

        const result = await checkGitHubApp(context, REQUEST);

        expect(result.undetermined).toBeFalsy();
        expect(result.installUrl).toContain('aem-code-sync');
    });

    it('does NOT trigger a code sync on a definitive code.status 404', async () => {
        // Helix answered authoritatively: the App is not installed. Triggering a
        // sync cannot help — the webhook that would drive it does not exist.
        mockIsAppInstalled.mockResolvedValue({ isInstalled: false, codeStatus: 404 });
        const context = makeContext();

        await checkGitHubApp(context, REQUEST);

        expect(mockPreviewCode).not.toHaveBeenCalled();
    });

    /**
     * Selection-time checks must answer fast. A genuine 404 (Helix has never indexed
     * the repo) otherwise triggers a code sync and polls for up to three minutes —
     * fine mid-pipeline, unusable behind a step's Continue button.
     *
     * `skipTrigger` reports what Helix says right now and stops. The mid-pipeline
     * gate keeps the trigger, because that is where the latency is affordable and
     * where a repo genuinely needs indexing before setup can proceed.
     */
    describe('skipTrigger — for the selection-time check', () => {
        it('does NOT trigger a code sync on a 404 when asked to skip', async () => {
            mockIsAppInstalled.mockResolvedValue({
                isInstalled: false,
                httpNotFound: true,
                httpStatus: 404,
            });

            await checkGitHubApp(makeContext(), { ...REQUEST, skipTrigger: true });

            expect(mockPreviewCode).not.toHaveBeenCalled();
        });

        it('still reports the 404 verdict rather than swallowing it', async () => {
            mockIsAppInstalled.mockResolvedValue({
                isInstalled: false,
                httpNotFound: true,
                httpStatus: 404,
            });

            const res = await checkGitHubApp(makeContext(), { ...REQUEST, skipTrigger: true });

            expect(res.isInstalled).toBe(false);
        });

        it('leaves the default path triggering, so the mid-pipeline gate is unchanged', async () => {
            mockIsAppInstalled.mockResolvedValue({
                isInstalled: false,
                httpNotFound: true,
                httpStatus: 404,
            });

            await checkGitHubApp(makeContext(), REQUEST);

            expect(mockPreviewCode).toHaveBeenCalled();
        });
    });
});
