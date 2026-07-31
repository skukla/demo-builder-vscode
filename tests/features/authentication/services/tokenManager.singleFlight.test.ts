/**
 * TokenManager — inspectToken single-flight
 *
 * `inspectToken` spawns the whole `aio` Node CLI to read one config value
 * (`aio config get ims.contexts.cli.access_token --json`), which costs ~3.7s of
 * process start + module load. It caches the result at CACHE_TTL.MEDIUM, but a
 * cache only helps callers arriving AFTER a fetch completes: concurrent callers
 * on a cold cache each check, each miss, and each spawn their own CLI.
 *
 * There are 8 `isAuthenticated()` call sites across the dashboard/creation
 * handlers, and the sibling org-list path was observed doing exactly this
 * (2.5s + 1.4s overlapping, 2026-07-31). This is the same structure, so the
 * guard is PREVENTIVE — the token path happened to serialise in that trace.
 */

import { TokenManager } from '@/features/authentication/services/tokenManager';
import type { CommandExecutor, CommandResult } from '@/core/shell';

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

/** A valid token payload: >100 chars and an expiry comfortably in the future. */
function tokenPayload(): CommandResult {
    return {
        code: 0,
        stdout: JSON.stringify({ token: 'x'.repeat(150), expiry: Date.now() + 3_600_000 }),
        stderr: '',
    } as CommandResult;
}

describe('TokenManager — inspectToken single-flight', () => {
    let tokenManager: TokenManager;
    let execute: jest.Mock;
    let release: (value: CommandResult) => void;

    beforeEach(() => {
        execute = jest.fn(
            () =>
                new Promise<CommandResult>((resolve) => {
                    release = resolve;
                })
        );

        tokenManager = new TokenManager({
            execute,
            executeCommand: jest.fn(),
            executeWithNodeVersion: jest.fn(),
            testCommand: jest.fn(),
            getNodeVersionForComponent: jest.fn(),
            getCachedBinaryPath: jest.fn(),
            invalidateBinaryPathCache: jest.fn(),
            getCachedNodeVersion: jest.fn(),
            invalidateNodeVersionCache: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>);
    });

    // Each concurrent caller would otherwise spawn its own `aio` CLI — ~3.7s each.
    it('collapses concurrent callers into ONE aio spawn', async () => {
        const a = tokenManager.inspectToken();
        const b = tokenManager.inspectToken();
        const c = tokenManager.inspectToken();

        await Promise.resolve();
        await Promise.resolve();
        release(tokenPayload());

        const [ra, rb, rc] = await Promise.all([a, b, c]);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(ra.valid).toBe(true);
        expect(rb).toEqual(ra);
        expect(rc).toEqual(ra);
    });

    it('isTokenValid rides the same flight', async () => {
        const a = tokenManager.inspectToken();
        const b = tokenManager.isTokenValid();

        await Promise.resolve();
        await Promise.resolve();
        release(tokenPayload());

        const [inspection, valid] = await Promise.all([a, b]);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(inspection.valid).toBe(true);
        expect(valid).toBe(true);
    });

    it('releases the flight so a LATER call can inspect again', async () => {
        const first = tokenManager.inspectToken();
        await Promise.resolve();
        await Promise.resolve();
        release(tokenPayload());
        await first;

        const second = tokenManager.inspectToken();
        await Promise.resolve();
        await Promise.resolve();
        release(tokenPayload());
        await second;

        expect(execute).toHaveBeenCalledTimes(2);
    });

    // A flight left pending after a throw would wedge auth for the whole session.
    it('releases the flight after a THROWING fetch', async () => {
        execute.mockRejectedValueOnce(new Error('spawn failed'));

        // The retry loop swallows the failure and returns an invalid result.
        await tokenManager.inspectToken();

        execute.mockImplementationOnce(
            () =>
                new Promise<CommandResult>((resolve) => {
                    release = resolve;
                })
        );
        const second = tokenManager.inspectToken();
        await Promise.resolve();
        await Promise.resolve();
        release(tokenPayload());

        expect((await second).valid).toBe(true);
    });
});
