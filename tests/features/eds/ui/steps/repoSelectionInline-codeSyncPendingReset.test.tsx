/**
 * Do not ask Helix a question whose answer cannot be true yet.
 *
 * Reported 2026-08-19. The user selected an existing repo, `skukla/kukla-bodea`,
 * ticked reset-to-template, reached the Code Sync sub-step, and got:
 *
 *     Couldn't verify AEM Code Sync
 *     Adobe did not answer for skukla/kukla-bodea. This does not mean the app is
 *     missing — a new repository can take a few minutes to register.
 *
 * Adobe answered perfectly clearly. From their log:
 *
 *     [RepoReadiness] skukla/kukla-bodea is populated but missing:
 *         scripts/scripts.js, scripts/delayed.js, head.html
 *     [GitHub App] Status endpoint returned HTTP 404 (Helix does not know this
 *         repo) — [admin] no such site: skukla/kukla-bodea
 *
 * Those three files are what make a repo a Helix site, so the 404 is correct AND
 * permanent — until the repo is reset from the template, which happens in
 * `storefrontSetupPhase1` LONG after this wizard step. Re-checking could never
 * come good; the user tried three times over six minutes, each attempt firing a
 * Helix code sync and polling it to exhaustion.
 *
 * The message blamed indexing latency for a known, permanent state. The comment
 * above `resolveCodeSyncView`'s `unverifiable` branch already describes this
 * exact failure being fixed once for NEW repos — "offered nothing but a re-check
 * that could never come good". This is the same bug on the existing-repo path.
 */

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));

jest.mock('@/core/utils/sleep', () => ({ sleep: () => Promise.resolve() }));

import { resolveCodeSyncView } from '@/features/eds/ui/steps/repoSelectionInline.helpers';

beforeEach(() => {
    mockRequest.mockReset();
});

describe('a repo awaiting its reset', () => {
    // The state the reporter was in: Helix 404, no install offer, no code status.
    const helix404 = { isChecking: false, isInstalled: false };

    it('does not report a failure it already knows the reason for', () => {
        expect(resolveCodeSyncView(helix404, false, true).kind).toBe('pending-reset');
    });

    it('still reports unverifiable when no reset is queued', () => {
        // Without a pending reset the 404 IS unexplained, and the existing
        // message is the right one.
        expect(resolveCodeSyncView(helix404, false, false).kind).toBe('unverifiable');
    });

    it('lets a verified repo stay verified', () => {
        // Reset queued, but Helix already knows the site — say so. A pending
        // reset must not downgrade a real answer.
        const verified = { isChecking: false, isInstalled: true };

        expect(resolveCodeSyncView(verified, false, true).kind).toBe('verified');
    });

    it('still shows the in-flight check while one is running', () => {
        const checking = { isChecking: true, isInstalled: null };

        expect(resolveCodeSyncView(checking, false, true).kind).toBe('checking');
    });

    it('defaults to the old behaviour when the caller says nothing', () => {
        // The third argument is optional so every existing call site keeps its
        // meaning; only a caller that KNOWS a reset is queued opts in.
        expect(resolveCodeSyncView(helix404, false).kind).toBe('unverifiable');
    });
});

describe('an undetermined check', () => {
    // `unverifiable` means Helix DECLINED — a refused credential or an
    // unreachable service. It says nothing about the site and nothing about the
    // App. Naming a cause here is the eleven-reinstalls failure: a user was sent
    // to reinstall an App that was installed, because a 401 was read as absence.
    const undetermined = { isChecking: false, isInstalled: false, undetermined: true };

    it('stays undetermined regardless of what the preconditions say', () => {
        expect(resolveCodeSyncView(undetermined, false, false).kind).toBe('unverifiable');
    });

    it('is not downgraded by a pending reset', () => {
        expect(resolveCodeSyncView(undetermined, false, true).kind).toBe('unverifiable');
    });
});
