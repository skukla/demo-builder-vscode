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
import type { CheckGitHubAppServices } from '@/features/project-creation/handlers/checkGitHubAppHandler';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

const mockIsAppInstalled = jest.fn();
const mockPreviewCode = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => ({ tokenService: { getToken: jest.fn() } })),
    // The handler passes a DA.live provider so the status check survives a site
    // with an `access.admin` role; `undefined` mirrors the degraded path.
    tryCreateDaLiveTokenProvider: jest.fn(() => undefined),
}));

// Neither service is module-mocked. Both arrive through the `services` seam — a third
// optional parameter on the handler — so the suite hands in exactly the three methods
// this handler calls, typed to the interfaces the handler itself declares.
const mockMakeGitHubAppService = jest.fn();
const SERVICES: CheckGitHubAppServices = {
    makeHelix: () => ({ previewCode: mockPreviewCode }),
    makeGitHubAppService: (...args) => {
        mockMakeGitHubAppService(...args);
        return {
            isAppInstalled: mockIsAppInstalled,
            getInstallUrl: () =>
                'https://github.com/apps/aem-code-sync/installations/select_target',
        };
    },
};

function makeContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger() as unknown as Logger,
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
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

        const result = await checkGitHubApp(context, REQUEST, SERVICES);

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

        await checkGitHubApp(context, REQUEST, SERVICES);

        expect(mockPreviewCode).toHaveBeenCalled();
    });

    it('does NOT trigger a code sync when Helix rejects the credential (HTTP 401)', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
        });
        const context = makeContext();

        const result = await checkGitHubApp(context, REQUEST, SERVICES);

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

        await checkGitHubApp(context, REQUEST, SERVICES);

        expect(allLogs(context)).not.toContain('HTTP 404');
    });

    it('records the actual HTTP status in the log', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
        });
        const context = makeContext();

        await checkGitHubApp(context, REQUEST, SERVICES);

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

        const result = await checkGitHubApp(context, REQUEST, SERVICES);

        expect(result.undetermined).toBe(true);
    });

    it('withholds the install URL when the check was undetermined', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
        });
        const context = makeContext();

        const result = await checkGitHubApp(context, REQUEST, SERVICES);

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

        const result = await checkGitHubApp(context, REQUEST, SERVICES);

        expect(String(result.reason)).toMatch(/401/);
        expect(String(result.reason)).toMatch(/sign-in|credential/i);
    });

    it('still offers the install URL when the App is genuinely absent', async () => {
        mockIsAppInstalled.mockResolvedValue({ isInstalled: false, codeStatus: 404 });
        const context = makeContext();

        const result = await checkGitHubApp(context, REQUEST, SERVICES);

        expect(result.undetermined).toBeFalsy();
        expect(result.installUrl).toContain('aem-code-sync');
    });

    it('does NOT trigger a code sync on a definitive code.status 404', async () => {
        // Helix answered authoritatively: the App is not installed. Triggering a
        // sync cannot help — the webhook that would drive it does not exist.
        mockIsAppInstalled.mockResolvedValue({ isInstalled: false, codeStatus: 404 });
        const context = makeContext();

        await checkGitHubApp(context, REQUEST, SERVICES);

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
    describe('the answer AFTER the trigger', () => {
        // These queue per-call answers, and `jest.clearAllMocks()` does NOT drain a
        // `mockResolvedValueOnce` queue — it clears calls, not implementations. An
        // unconsumed answer therefore leaks into the NEXT test and satisfies it for
        // the wrong reason: caught here when the old-behaviour control failed 2 of 4
        // instead of 3. Reset the queue, so each case starts from nothing.
        beforeEach(() => {
            mockIsAppInstalled.mockReset();
        });

        /**
         * The trigger IS the remedy, so its whole value is that the answer
         * changes. Measured on skukla/kukla-bodea, 2026-08-20:
         *
         *   11:20:07.940  Successfully previewed code            <- Helix accepted
         *   11:22:41.850  Code sync polling failed: Maximum ...  <- 154s, unrelated file
         *
         * The re-check was gated on that poll, which asked whether
         * `scripts/aem.js` was being served. A repo reaching this check is
         * usually not a storefront yet, so that file cannot exist and the poll
         * could only fail — taking the re-check down with it and returning the
         * stale pre-trigger 404. The user's App was installed throughout.
         *
         * These assert the CALL and the REPORTED verdict, not that `previewCode`
         * happened. Every test above passed while the bug shipped, because
         * `toHaveBeenCalled()` on the trigger is equally true of a handler that
         * throws the result away.
         */
        it('asks again once Helix has accepted the trigger', async () => {
            mockIsAppInstalled
                .mockResolvedValueOnce({ isInstalled: false, httpNotFound: true, httpStatus: 404 })
                .mockResolvedValueOnce({ isInstalled: true, codeStatus: 200 });
            const context = makeContext();

            await checkGitHubApp(context, REQUEST, SERVICES);

            expect(mockIsAppInstalled).toHaveBeenCalledTimes(2);
        });

        it('reports the SECOND answer, not the 404 that prompted the trigger', async () => {
            mockIsAppInstalled
                .mockResolvedValueOnce({ isInstalled: false, httpNotFound: true, httpStatus: 404 })
                .mockResolvedValueOnce({ isInstalled: true, codeStatus: 200 });
            const context = makeContext();

            const result = await checkGitHubApp(context, REQUEST, SERVICES);

            expect(result.isInstalled).toBe(true);
            expect(result.codeStatus).toBe(200);
            // The install URL is the tell: offering it here is the wizard telling
            // someone to install an App they already have.
            expect(result.installUrl).toBeUndefined();
        });

        it('does not re-ask when Helix refused the trigger', async () => {
            mockIsAppInstalled.mockResolvedValue({
                isInstalled: false,
                httpNotFound: true,
                httpStatus: 404,
            });
            mockPreviewCode.mockRejectedValue(new Error('Failed to preview code: 403 Forbidden'));
            const context = makeContext();

            const result = await checkGitHubApp(context, REQUEST, SERVICES);

            expect(mockIsAppInstalled).toHaveBeenCalledTimes(1);
            expect(result.isInstalled).toBe(false);
        });

        it('still reports a repo Helix cannot place even after the trigger', async () => {
            mockIsAppInstalled.mockResolvedValue({
                isInstalled: false,
                httpNotFound: true,
                httpStatus: 404,
            });
            const context = makeContext();

            const result = await checkGitHubApp(context, REQUEST, SERVICES);

            expect(mockIsAppInstalled).toHaveBeenCalledTimes(2);
            expect(result.isInstalled).toBe(false);
            expect(result.installUrl).toBeTruthy();
        });
    });

    describe('skipTrigger — for the selection-time check', () => {
        it('does NOT trigger a code sync on a 404 when asked to skip', async () => {
            mockIsAppInstalled.mockResolvedValue({
                isInstalled: false,
                httpNotFound: true,
                httpStatus: 404,
            });

            await checkGitHubApp(makeContext(), { ...REQUEST, skipTrigger: true }, SERVICES);

            expect(mockPreviewCode).not.toHaveBeenCalled();
        });

        it('still reports the 404 verdict rather than swallowing it', async () => {
            mockIsAppInstalled.mockResolvedValue({
                isInstalled: false,
                httpNotFound: true,
                httpStatus: 404,
            });

            const res = await checkGitHubApp(
                makeContext(),
                { ...REQUEST, skipTrigger: true },
                SERVICES
            );

            expect(res.isInstalled).toBe(false);
        });

        it('leaves the default path triggering, so the mid-pipeline gate is unchanged', async () => {
            mockIsAppInstalled.mockResolvedValue({
                isInstalled: false,
                httpNotFound: true,
                httpStatus: 404,
            });

            await checkGitHubApp(makeContext(), REQUEST, SERVICES);

            expect(mockPreviewCode).toHaveBeenCalled();
        });
    });
});

/**
 * The DA.live session must reach the status check.
 *
 * Observed 2026-08-14 editing `demo-builder-test`: the check sent only the GitHub
 * token, admin.hlx.page answered 401 "[admin] not authenticated", and the wizard
 * showed a permanent "Registering...". Cause: writing any `access.admin` role
 * makes Adobe set `requireAuth: "auto"`, closing the whole admin API to callers
 * without an accepted admin identity — and storefront setup now pins such a role
 * on every project it registers, so this is the normal state, not an edge case.
 *
 * Without this assertion the wiring is invisible: the service-level tests pass a
 * provider directly, so the handler could stop supplying one and nothing would fail.
 */
/**
 * What the handler ASKS FOR, and what it answers with.
 *
 * The tests above drive the handler through its branches and read the verdict.
 * These pin the two things a mock cannot see on its own: the arguments the
 * service is called with, and the shape returned when the call throws. A mode
 * flag that never reaches `isAppInstalled` is invisible to every assertion that
 * only reads the answer, because the fake answers the same either way.
 */
describe('checkGitHubApp handler — the call it makes and the answer it gives', () => {
    // These queue per-call answers; `jest.clearAllMocks()` clears calls, not the
    // `mockResolvedValueOnce` queue, so an unconsumed answer would leak forward.
    beforeEach(() => {
        mockIsAppInstalled.mockReset();
    });

    it('asks in strict mode when the request does not say otherwise', async () => {
        mockIsAppInstalled.mockResolvedValue({ isInstalled: true, codeStatus: 200 });

        await checkGitHubApp(makeContext(), REQUEST, SERVICES);

        expect(mockIsAppInstalled).toHaveBeenCalledWith('acme-demos', 'aircraft-demo', {
            lenient: false,
        });
    });

    it('passes lenient through to the service when the request asks for it', async () => {
        mockIsAppInstalled.mockResolvedValue({ isInstalled: true, codeStatus: 200 });

        await checkGitHubApp(makeContext(), { ...REQUEST, lenient: true }, SERVICES);

        expect(mockIsAppInstalled).toHaveBeenCalledWith('acme-demos', 'aircraft-demo', {
            lenient: true,
        });
    });

    it('re-asks in the SAME mode after the trigger', async () => {
        mockIsAppInstalled
            .mockResolvedValueOnce({ isInstalled: false, httpNotFound: true, httpStatus: 404 })
            .mockResolvedValueOnce({ isInstalled: true, codeStatus: 200 });

        await checkGitHubApp(makeContext(), { ...REQUEST, lenient: true }, SERVICES);

        // A re-check that silently reverted to strict mode would reject the very
        // status the lenient caller asked to accept.
        expect(mockIsAppInstalled).toHaveBeenNthCalledWith(2, 'acme-demos', 'aircraft-demo', {
            lenient: true,
        });
    });

    it('reports that a code sync was triggered', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            httpNotFound: true,
            httpStatus: 404,
        });

        const result = await checkGitHubApp(makeContext(), REQUEST, SERVICES);

        // The wizard uses this to say "indexing started" instead of "not installed".
        expect(result.codeSyncTriggered).toBe(true);
    });

    it('names the repository in the undetermined reason', async () => {
        mockIsAppInstalled.mockResolvedValue({
            isInstalled: false,
            transient: true,
            httpStatus: 401,
        });

        const result = await checkGitHubApp(makeContext(), REQUEST, SERVICES);

        // The reason is user-facing text; without the repo in it the SC cannot tell
        // which of several storefronts AEM refused.
        expect(String(result.reason)).toContain('acme-demos/aircraft-demo');
    });

    it('answers with the failure instead of throwing when the service rejects', async () => {
        mockIsAppInstalled.mockRejectedValue(new Error('admin.hlx.page unreachable'));

        const result = await checkGitHubApp(makeContext(), REQUEST, SERVICES);

        expect(result).toEqual({
            success: false,
            isInstalled: false,
            error: 'admin.hlx.page unreachable',
        });
    });

    it('builds its own service when no seam is handed in', async () => {
        // The production call passes no `services`. The real GitHubAppService is
        // reached here and answers from the fake token service the suite installs —
        // no credential, so no network — which makes the default factory's OUTPUT
        // observable rather than merely constructed.
        const result = await checkGitHubApp(makeContext(), REQUEST);

        expect(result.success).toBe(true);
        expect(result.undetermined).toBe(true);
        expect(String(result.reason)).toContain("not signed in to GitHub");
    });
});

describe('checkGitHubApp handler — DA.live session wiring', () => {
    it('constructs the service WITH the DA.live token provider', async () => {
        const { tryCreateDaLiveTokenProvider } = jest.requireMock(
            '@/features/eds/handlers/edsHelpers'
        );
        const provider = { getAccessToken: jest.fn() };
        tryCreateDaLiveTokenProvider.mockReturnValue(provider);
        mockIsAppInstalled.mockResolvedValue({ isInstalled: true, codeStatus: 200 });

        await checkGitHubApp(makeContext(), REQUEST, SERVICES);

        // Asserted on the FACTORY the handler was given, not on a mocked constructor.
        // Same property, and it can now name all three arguments instead of two
        // `expect.anything()` placeholders — a module mock could not see the token
        // service or the logger it was handed.
        expect(mockMakeGitHubAppService).toHaveBeenCalledWith(
            expect.objectContaining({ getToken: expect.any(Function) }),
            expect.objectContaining({ info: expect.any(Function) }),
            provider
        );
    });
});
