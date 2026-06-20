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
    type OnOpenCheck,
    type CheckOutcome,
} from '@/features/dashboard/services/onOpenChecks';
import { CHECK_RESULT_MESSAGE } from '@/types/messages';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

const mockLogger: Logger = {
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
        run: async () => ({ checkId: 'org-context', status: 'ok', data: { org: 'X' } }),
    };

    await runOnOpenChecks(deps, [check]);

    const posted = outcomes(postMessage);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ checkId: 'org-context', status: 'ok', data: { org: 'X' } });
});

it('stamps checkId on the outcome even if the check omits it', async () => {
    const { deps, postMessage } = makeDeps();
    const check: OnOpenCheck = {
        id: 'mesh-verify',
        mode: 'background',
        run: async () => ({ checkId: '', status: 'ok' }),
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
        run: async () => ({ checkId: 'ai-verify', status: 'ok' }),
    };

    await expect(runOnOpenChecks(deps, [thrower, healthy])).resolves.toBeUndefined();

    const posted = outcomes(postMessage);
    const err = posted.find((o) => o.checkId === 'org-context');
    expect(err).toMatchObject({ status: 'error', message: 'boom' });
    expect(posted.find((o) => o.checkId === 'ai-verify')).toMatchObject({ status: 'ok' });
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('org-context'));
});

it('supports an intermediate pending post then the resolved outcome', async () => {
    const { deps, postMessage } = makeDeps();
    const check: OnOpenCheck = {
        id: 'org-context',
        mode: 'background',
        run: async (ctx) => {
            ctx.post({ checkId: 'org-context', status: 'pending' });
            return { checkId: 'org-context', status: 'warning', message: 'mismatch' };
        },
    };

    await runOnOpenChecks(deps, [check]);

    const posted = outcomes(postMessage);
    expect(posted.map((o) => o.status)).toEqual(['pending', 'warning']);
});

it('re-entrancy: a check runs at most once per session for the same project', async () => {
    const { deps, postMessage } = makeDeps();
    const run = jest.fn(async () => ({ checkId: 'org-context', status: 'ok' as const }));
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
    const run = jest.fn(async () => ({ checkId: 'org-context', status: 'ok' as const }));
    const check: OnOpenCheck = { id: 'org-context', mode: 'background', reRunnable: true, run };

    await runOnOpenChecks(deps, [check]);
    await runOnOpenChecks(deps, [check]); // re-check after a switch / re-auth

    expect(run).toHaveBeenCalledTimes(2);
    expect(outcomes(postMessage)).toHaveLength(2);
});

it('runs multiple checks concurrently and posts each', async () => {
    const { deps, postMessage } = makeDeps();
    const mk = (id: string): OnOpenCheck => ({
        id, mode: 'background', run: async () => ({ checkId: id, status: 'ok' }),
    });

    await runOnOpenChecks(deps, [mk('org-context'), mk('mesh-verify'), mk('ai-verify')]);

    const ids = outcomes(postMessage).map((o) => o.checkId).sort();
    expect(ids).toEqual(['ai-verify', 'mesh-verify', 'org-context']);
});
