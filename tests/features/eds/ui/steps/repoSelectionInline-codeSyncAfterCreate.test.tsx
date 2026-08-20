/**
 * Never report an answer to a question nobody asked.
 *
 * Creating a repository showed "Couldn't verify AEM Code Sync — Adobe did not
 * answer for skukla/bodea-team-demo". Adobe was never asked. The user's log
 * (2026-08-17) has no `[GitHub App Check]` line anywhere after the repo was
 * created at 17:49:22; the only check ran at 17:48:49, against the repo they then
 * deleted at 17:49:07.
 *
 * The creation handler FABRICATED a status instead of measuring one:
 *
 *     setGitHubAppStatus({
 *         isChecking: false,
 *         isInstalled: false,        // asserts a verdict
 *         installUrl: '…',           // intends the install view
 *     });                            // codeStatus omitted
 *
 * `resolveCodeSyncView` maps `isInstalled === false` + `codeStatus === undefined`
 * to `unverifiable`, whose whole purpose is to say "Adobe refused or was
 * unreachable, which tells us NOTHING". The author plainly meant `needs-install`
 * — they set `installUrl` in the same object — but that view needs a defined
 * `codeStatus`, so it could never render.
 *
 * These tests pin the resolver's contract, which is where the mismatch lives.
 * `pollGitHubAppInstallation` already exists for a freshly created repo (it
 * retries while GitHub has not indexed it) and was wired only to the manual
 * "Check Again" button.
 */

// 2026-08-20: `cannot-verify` is gone -- every state that reached it now lands
// on `after-setup`. In Helix 5 a "site" is a Configuration Service record
// created during setup, and `admin.hlx.page/status` reports on the site, so
// before that record exists it answers `404 no such site` whatever the App is
// doing. Measured unauthenticated (401 = site exists, 404 = it does not):
// kukla-bodea 404 with the App installed and full template content;
// citisignal, demo-builder-test and adobe/helix-website all 401.
// So the old view's install steps and "Check Again" were both dead ends -- the
// install cannot create a site and the re-check cannot succeed, which is
// exactly what pressing it did: return to the same screen.


const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));

const mockSleep = jest.fn().mockResolvedValue(undefined);
jest.mock('@/core/utils/sleep', () => ({ sleep: () => mockSleep() }));

import {
    pollGitHubAppInstallation,
    probeRepoCodeSync,
    resolveCodeSyncView,
} from '@/features/eds/ui/steps/repoSelectionInline.helpers';

beforeEach(() => {
    mockRequest.mockReset();
    mockSleep.mockClear();
});

describe('a status nobody measured', () => {
    it('reads as NOT-YET-ASKED, never as an unanswered request', () => {
        // The shape the creation path should set: no verdict claimed.
        const justCreated = { isChecking: true, isInstalled: null };

        expect(resolveCodeSyncView(justCreated, false).kind).toBe('checking');
    });

    it('a bare verdict with no evidence either way cannot be verified', () => {
        // No installUrl (the handler was not confident) and no `undetermined` flag
        // either — nothing to act on, so claim nothing.
        const bare = { isChecking: false, isInstalled: false };

        expect(resolveCodeSyncView(bare, false).kind).toBe('after-setup');
    });
});

describe('what each state must still mean', () => {
    it('a real 404 is a real install prompt', () => {
        const measured = { isChecking: false, isInstalled: false, codeStatus: 404 };

        expect(resolveCodeSyncView(measured, false).kind).toBe('needs-install');
    });

    it('Helix not knowing the repo is an install prompt, not a shrug', () => {
        // The case that matters for a brand-new repo. Helix answers HTTP 404
        // ("no such site") because the AEM Code Sync app has never registered it,
        // and there is no `code.status` to report — so `codeStatus` is undefined
        // while the answer is perfectly definite.
        //
        // `githubAppService` says this outright: `httpNotFound` is the only signal
        // meaning "Helix has never heard of this repo", and callers "must not
        // re-derive it from codeStatus === undefined, which is equally true of a
        // 401/403/5xx". This view was doing exactly that.
        //
        // The handler already draws the line for us: it sends `installUrl` when it
        // is confident enough to offer the install, and `undetermined` when it is
        // not. Read THAT, not the absence of a number.
        const helixNeverHeardOfIt = {
            isChecking: false,
            isInstalled: false,
            installUrl: 'https://github.com/apps/aem-code-sync/installations/select_target',
        };

        // Collapsed 2026-08-20: this is `after-setup`, and the INTENT still
        // holds — that view leads with the install steps and an Install action.
        // The kind changed; "an install prompt, not a shrug" did not. What it no
        // longer does is CLAIM the app is missing, which an outer 404 never
        // established.
        expect(resolveCodeSyncView(helixNeverHeardOfIt, false).kind).toBe('after-setup');
    });

    it('a refused credential is not reported as a missing app', () => {
        // The distinction this file was written to protect. Adobe refusing the
        // credential says nothing about the app, so it must never reach the
        // DEFINITIVE `needs-install` verdict — the one that blocks and asserts
        // absence. It lands in the same cannot-verify view as the 404 above,
        // which offers the install without claiming it is the problem.
        const refused = { isChecking: false, isInstalled: false, undetermined: true };

        expect(resolveCodeSyncView(refused, false).kind).toBe('after-setup');
        expect(resolveCodeSyncView(refused, false).kind).not.toBe('needs-install');
    });

    it('installed is verified', () => {
        expect(
            resolveCodeSyncView({ isChecking: false, isInstalled: true }, false).kind,
        ).toBe('verified');
    });
});

describe('the probe behind both checks', () => {
    // Assert the ARGUMENT, not the outcome: the collaborator is mocked, so a
    // request missing `skipTrigger` answers exactly like one that has it. What
    // this pins is what the handler is ASKED to do — and `skipTrigger` is the
    // difference between an answer in a second and a code sync polled for three
    // minutes behind a Continue button.
    it('asks Helix what it knows now, without triggering a code sync', async () => {
        mockRequest.mockResolvedValue({ success: true, isInstalled: true, codeStatus: 200 });

        await probeRepoCodeSync('skukla', 'demo', jest.fn());

        expect(mockRequest).toHaveBeenCalledWith('check-github-app', {
            owner: 'skukla',
            repo: 'demo',
            lenient: true,
            skipTrigger: true,
        });
    });

    it('forwards undetermined, so a refusal is not read as a missing app', async () => {
        mockRequest.mockResolvedValue({ success: true, isInstalled: false, undetermined: true });
        const setStatus = jest.fn();

        await probeRepoCodeSync('skukla', 'demo', setStatus);

        expect(setStatus).toHaveBeenLastCalledWith(
            expect.objectContaining({ undetermined: true }),
        );
    });

    it('says it is checking before it asks', async () => {
        mockRequest.mockResolvedValue({ success: true, isInstalled: true });
        const setStatus = jest.fn();

        await probeRepoCodeSync('skukla', 'demo', setStatus);

        expect(setStatus).toHaveBeenNthCalledWith(1, { isChecking: true, isInstalled: null });
    });
});

describe('re-checking after "Check Again"', () => {
    const notInstalled = {
        success: true,
        isInstalled: false,
        installUrl: 'https://github.com/apps/aem-code-sync/installations/select_target',
    };

    it('stops on the first definite answer instead of waiting out five attempts', async () => {
        // "Repository is still being registered... (attempt 3 of 5)" is what the
        // user saw for a repo whose App was simply never installed. The retry
        // keyed off `codeStatus === undefined`, which a definitive Helix 404 also
        // satisfies — so it spent 25 seconds waiting for a state no amount of
        // waiting produces, and ended on the same view it started from.
        mockRequest.mockResolvedValue(notInstalled);

        const { status, failed } = await pollGitHubAppInstallation('skukla', 'demo', jest.fn());

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockSleep).not.toHaveBeenCalled();
        expect(failed).toBe(true);
        expect(status.installUrl).toBe(notInstalled.installUrl);
    });

    it('carries the install offer through, so the caller can render the steps', async () => {
        mockRequest.mockResolvedValue(notInstalled);

        const { status } = await pollGitHubAppInstallation('skukla', 'demo', jest.fn());

        // Collapsed 2026-08-20: this lands in `after-setup`, whose view leads
        // with the install steps — so the offer still reaches the user. Assert
        // the OFFER survives the poll rather than the kind, which is the thing
        // this test was actually protecting and the thing that has now moved.
        expect(status.installUrl).toBe(notInstalled.installUrl);
        expect(resolveCodeSyncView(status, false).kind).toBe('after-setup');
    });

    it('still retries while the check is UNDETERMINED', async () => {
        // The state retrying is actually for: AEM refused or was unreachable, and
        // the next attempt may well resolve it.
        mockRequest
            .mockResolvedValueOnce({ success: true, isInstalled: false, undetermined: true })
            .mockResolvedValueOnce({ success: true, isInstalled: true, codeStatus: 200 });

        const setMessage = jest.fn();
        const { status, failed } = await pollGitHubAppInstallation('skukla', 'demo', setMessage);

        expect(mockRequest).toHaveBeenCalledTimes(2);
        expect(setMessage).toHaveBeenCalledWith(expect.stringContaining('attempt 2 of 5'));
        expect(failed).toBe(false);
        expect(status.isInstalled).toBe(true);
    });

    it('reports undetermined after the retries are spent, never "install this"', async () => {
        mockRequest.mockResolvedValue({ success: true, isInstalled: false, undetermined: true });

        const { status } = await pollGitHubAppInstallation('skukla', 'demo', jest.fn());

        expect(mockRequest).toHaveBeenCalledTimes(5);
        expect(status.undetermined).toBe(true);
        expect(resolveCodeSyncView(status, false).kind).toBe('after-setup');
    });
});
