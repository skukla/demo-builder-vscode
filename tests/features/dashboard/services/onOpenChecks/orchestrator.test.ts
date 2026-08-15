/**
 * Tests for the on-open check orchestrator (Step 1).
 *
 * Covers the coordination contract with NO real checks registered:
 *   - runs a check and posts its outcome on `checkResult`
 *   - edsOnly gate
 *   - P2: a throwing check becomes a posted `error` outcome (no rejection escapes)
 *   - pending-then-resolved
 *   - per-session re-entrancy guard
 *   - concurrency (all checks post)
 */

import {
    runOnOpenChecks,
    _resetOnOpenChecksGuardForTests,
    armOnOpenChecks,
    type OnOpenCheck,
    type CheckOutcome,
} from '@/features/dashboard/services/onOpenChecks';
import { CHECK_RESULT_MESSAGE } from '@/types/messages';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

const mockLogger: Logger = {
    trace: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

const project = { path: '/tmp/proj' } as Project;

function makeDeps(isEds = true) {
    const postMessage = jest.fn();
    return { deps: { project, logger: mockLogger, isEds, postMessage }, postMessage };
}

/** Pull the CheckOutcome payloads posted on the checkResult channel. */
function outcomes(postMessage: jest.Mock): CheckOutcome[] {
    return postMessage.mock.calls
        .filter(([type]) => type === CHECK_RESULT_MESSAGE)
        .map(([, payload]) => payload as CheckOutcome);
}

beforeEach(() => {
    jest.clearAllMocks();
    _resetOnOpenChecksGuardForTests();
});

it('runs a check and posts its outcome on checkResult', async () => {
    const { deps, postMessage } = makeDeps();
    const check: OnOpenCheck = {
        id: 'org-context',
        mode: 'background',
        run: async () => ({ status: 'ok', data: { org: 'X' } }),
    };

    await runOnOpenChecks(deps, [check]);

    const posted = outcomes(postMessage);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ checkId: 'org-context', status: 'ok', data: { org: 'X' } });
});

it('stamps checkId from check.id onto every posted outcome', async () => {
    // Checks return a bare CheckResult (no checkId); the orchestrator is the sole
    // stamp site, so the posted payload always carries the check's id.
    const { deps, postMessage } = makeDeps();
    const check: OnOpenCheck = {
        id: 'mesh-verify',
        mode: 'background',
        run: async () => ({ status: 'ok' }),
    };

    await runOnOpenChecks(deps, [check]);

    expect(outcomes(postMessage)[0].checkId).toBe('mesh-verify');
});

it('skips an edsOnly check on a non-EDS project (no run, no post)', async () => {
    const { deps, postMessage } = makeDeps(false);
    const run = jest.fn();
    const check: OnOpenCheck = { id: 'mcp-health', mode: 'background', edsOnly: true, run };

    await runOnOpenChecks(deps, [check]);

    expect(run).not.toHaveBeenCalled();
    expect(outcomes(postMessage)).toHaveLength(0);
});

it('P2: a throwing check posts an error outcome and never rejects; others still run', async () => {
    const { deps, postMessage } = makeDeps();
    const thrower: OnOpenCheck = {
        id: 'org-context',
        mode: 'background',
        run: async () => { throw new Error('boom'); },
    };
    const healthy: OnOpenCheck = {
        id: 'ai-verify',
        mode: 'background',
        run: async () => ({ status: 'ok' }),
    };

    await expect(runOnOpenChecks(deps, [thrower, healthy])).resolves.toBeUndefined();

    const posted = outcomes(postMessage);
    const err = posted.find((o) => o.checkId === 'org-context');
    expect(err).toMatchObject({ status: 'error', message: 'boom' });
    expect(posted.find((o) => o.checkId === 'ai-verify')).toMatchObject({ status: 'ok' });
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('org-context'));
});

// A disposed panel is NOT a check failure: it means the user navigated away
// while a slow check was in flight. Common since the dashboard ⇄ integrations
// swap disposes the sibling panel, and auth + org fetch runs ~4-6s. Reporting it
// as an error logged a warning about nothing, then tried to post the outcome to
// the very panel that had just gone away.
it('treats a disposed panel as abandonment, not failure — no warn, no post', async () => {
    const { deps, postMessage } = makeDeps();
    const abandoned: OnOpenCheck = {
        id: 'org-context',
        mode: 'background',
        run: async () => {
            throw new Error('Webview is disposed');
        },
    };
    const healthy: OnOpenCheck = {
        id: 'ai-verify',
        mode: 'background',
        run: async () => ({ status: 'ok' }),
    };

    await expect(runOnOpenChecks(deps, [abandoned, healthy])).resolves.toBeUndefined();

    const posted = outcomes(postMessage);
    expect(posted.find((o) => o.checkId === 'org-context')).toBeUndefined();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    // Siblings are unaffected — one abandoned check must not stop the rest.
    expect(posted.find((o) => o.checkId === 'ai-verify')).toMatchObject({ status: 'ok' });
});

it('supports an intermediate pending post then the resolved outcome', async () => {
    const { deps, postMessage } = makeDeps();
    const check: OnOpenCheck = {
        id: 'org-context',
        mode: 'background',
        run: async (ctx) => {
            ctx.post({ status: 'pending' });
            return { status: 'warning', message: 'mismatch' };
        },
    };

    await runOnOpenChecks(deps, [check]);

    const posted = outcomes(postMessage);
    expect(posted.map((o) => o.status)).toEqual(['pending', 'warning']);
});

it('re-entrancy: a check runs at most once per session for the same project', async () => {
    const { deps, postMessage } = makeDeps();
    const run = jest.fn(async () => ({ status: 'ok' as const }));
    const check: OnOpenCheck = { id: 'org-context', mode: 'background', run };

    await runOnOpenChecks(deps, [check]);
    await runOnOpenChecks(deps, [check]); // second open / re-requestStatus

    expect(run).toHaveBeenCalledTimes(1);
    expect(outcomes(postMessage)).toHaveLength(1);
});

it('reRunnable: a check opts out of the per-session guard and runs every time', async () => {
    // Org-context is a live check: a forced switch / re-auth re-invokes
    // requestStatus precisely to re-check, so it must NOT be guarded.
    const { deps, postMessage } = makeDeps();
    const run = jest.fn(async () => ({ status: 'ok' as const }));
    const check: OnOpenCheck = { id: 'org-context', mode: 'background', reRunnable: true, run };

    await runOnOpenChecks(deps, [check]);
    await runOnOpenChecks(deps, [check]); // re-check after a switch / re-auth

    expect(run).toHaveBeenCalledTimes(2);
    expect(outcomes(postMessage)).toHaveLength(2);
});

it('runs multiple checks concurrently and posts each', async () => {
    const { deps, postMessage } = makeDeps();
    const mk = (id: string): OnOpenCheck => ({
        id, mode: 'background', run: async () => ({ status: 'ok' }),
    });

    await runOnOpenChecks(deps, [mk('org-context'), mk('mesh-verify'), mk('ai-verify')]);

    const ids = outcomes(postMessage).map((o) => o.checkId).sort();
    expect(ids).toEqual(['ai-verify', 'mesh-verify', 'org-context']);
});

/**
 * Reported 2026-08-06: open demo-builder-test (AI "Ready"), switch to another
 * project, switch back — the AI badge hangs on "Verifying" forever and the AI
 * Capabilities modal reads "No MCP servers wired yet / No skills yet" for a project
 * whose files are fine.
 *
 * The guard's lifetime outlived the state it feeds. `ai-verify` is not reRunnable,
 * so returning to a project skipped it — but the dashboard REMOUNTS on that return,
 * resetting `verifyResult` to null. No outcome ever arrives to refill it, and null
 * renders as both "Verifying" (badge) and "nothing here" (modal).
 *
 * Re-opening a dashboard must therefore re-arm the checks for that project, while
 * the guard keeps doing its real job: deduping a re-`requestStatus` within one mount
 * (the Integrations refresh button).
 */
describe('re-opening a project re-arms its checks (2026-08-06 regression)', () => {
    it('runs a guarded check again after the project dashboard is re-opened', async () => {
        const { deps, postMessage } = makeDeps();
        const run = jest.fn(async () => ({ status: 'ok' as const }));
        const check: OnOpenCheck = { id: 'ai-verify', mode: 'background', run };

        await runOnOpenChecks(deps, [check]);        // first open
        await runOnOpenChecks(deps, [check]);        // re-requestStatus, same mount → guarded
        expect(run).toHaveBeenCalledTimes(1);

        armOnOpenChecks(deps.project.path);          // dashboard re-opened for this project
        await runOnOpenChecks(deps, [check]);

        expect(run).toHaveBeenCalledTimes(2);
        expect(outcomes(postMessage)).toHaveLength(2);
    });

    it('still dedupes a re-requestStatus after the re-arm', async () => {
        // The guard's real job survives: one run per open, not one per status request.
        const { deps } = makeDeps();
        const run = jest.fn(async () => ({ status: 'ok' as const }));
        const check: OnOpenCheck = { id: 'ai-verify', mode: 'background', run };

        await runOnOpenChecks(deps, [check]);
        armOnOpenChecks(deps.project.path);
        await runOnOpenChecks(deps, [check]);
        await runOnOpenChecks(deps, [check]);

        expect(run).toHaveBeenCalledTimes(2);
    });

    it('re-arms only the named project, leaving another project guarded', async () => {
        // Switching projects must not silently re-run every other project's checks.
        // makeDeps shares ONE module-level project object, so a second project needs
        // its own — mutating the shared one changes both and the test proves nothing.
        const { deps: a } = makeDeps();
        const b = { ...a, project: { path: '/projects/other' } as Project, postMessage: jest.fn() };
        const runA = jest.fn(async () => ({ status: 'ok' as const }));
        const runB = jest.fn(async () => ({ status: 'ok' as const }));

        await runOnOpenChecks(a, [{ id: 'ai-verify', mode: 'background', run: runA }]);
        await runOnOpenChecks(b, [{ id: 'ai-verify', mode: 'background', run: runB }]);

        armOnOpenChecks(a.project.path);
        await runOnOpenChecks(a, [{ id: 'ai-verify', mode: 'background', run: runA }]);
        await runOnOpenChecks(b, [{ id: 'ai-verify', mode: 'background', run: runB }]);

        expect(runA).toHaveBeenCalledTimes(2);
        expect(runB).toHaveBeenCalledTimes(1);
    });
});
