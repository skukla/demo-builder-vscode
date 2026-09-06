/**
 * ensureFnmNodeVersion — the add-door node check (2026-08-27).
 *
 * Always runs `fnm install <major>` (fast no-op when satisfied) because the
 * live failure was precisely a PRESENT-but-stale patch: v24.12.0 installed,
 * a dependency floor of ^24.15.0 refusing it.
 */

jest.mock('@/core/shell/environmentSetup', () => ({
    EnvironmentSetup: jest.fn().mockImplementation(() => ({
        findFnmPath: () => mockFnmPath,
    })),
}));
let mockFnmPath: string | null = '/opt/homebrew/bin/fnm';

import { ensureFnmNodeVersion } from '@/core/shell/ensureNodeVersion';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../helpers/commandExecutorFake';

const logger = createMockLogger() as unknown as Logger;

function executorReturning(code: number, stderr = ''): CommandExecutor {
    return createMockCommandExecutor({ execute: jest.fn().mockResolvedValue({ code, stderr }) });
}

/**
 * An executor whose result is PARTIAL — the shape a killed or never-spawned
 * process actually produces (measured live 2026-08-27: "exit undefined").
 * `CommandResult` declares every field, so this is the only way to drive the
 * optional reads the module makes.
 */
function executorResolving(result: Record<string, unknown>): CommandExecutor {
    return createMockCommandExecutor({ execute: jest.fn().mockResolvedValue(result) });
}

/** The options object the single `execute` call received. */
const optionsOf = (executor: CommandExecutor) => (executor.execute as jest.Mock).mock.calls[0][1];

describe('ensureFnmNodeVersion', () => {
    beforeEach(() => {
        mockFnmPath = '/opt/homebrew/bin/fnm';
    });

    it('runs fnm install for the MAJOR through the DISCOVERED fnm path', async () => {
        // The extension host's PATH does not carry fnm (measured live: a bare
        // `fnm install` spawned nothing and came back "exit undefined").
        const executor = executorReturning(0);

        const error = await ensureFnmNodeVersion(executor, '24', logger);

        expect(error).toBeUndefined();
        expect((executor.execute as jest.Mock).mock.calls[0][0]).toBe(
            '/opt/homebrew/bin/fnm install 24'
        );
    });

    it('returns an actionable error when fnm is not installed at all', async () => {
        mockFnmPath = null;
        const executor = executorReturning(0);

        const error = await ensureFnmNodeVersion(executor, '24', logger);

        expect(error).toContain('fnm was not found');
        expect(executor.execute).not.toHaveBeenCalled();
    });

    it('returns an actionable error when fnm install fails', async () => {
        const executor = executorReturning(1, 'error: no fnm here');

        const error = await ensureFnmNodeVersion(executor, '24', logger);

        expect(error).toContain('Node 24 is required');
        expect(error).toContain('no fnm here');
        expect(error).toContain('fnm install 24');
    });

    it('rejects a non-major version string without running anything', async () => {
        const executor = executorReturning(0);

        const error = await ensureFnmNodeVersion(executor, '24.1.0; rm -rf /', logger);

        expect(error).toContain('Invalid Node version');
        expect(executor.execute).not.toHaveBeenCalled();
    });

    // The version has to be a major and NOTHING else — it is interpolated into a
    // shell command line. Anchoring only the end would admit a leading payload.
    it('rejects a version that merely ENDS in digits', async () => {
        const executor = executorReturning(0);

        const error = await ensureFnmNodeVersion(executor, 'v24', logger);

        expect(error).toContain('Invalid Node version');
        expect(executor.execute).not.toHaveBeenCalled();
    });

    // Each of these was measured live: without a shell the whole string is handed
    // over as one binary name and nothing runs, and without the enhanced PATH fnm's
    // own node shims are invisible to the subprocess.
    it('runs the install with a long timeout, an enhanced PATH and a shell', async () => {
        const executor = executorReturning(0);

        await ensureFnmNodeVersion(executor, '24', logger);

        expect(optionsOf(executor)).toEqual({
            timeout: TIMEOUTS.LONG,
            enhancePath: true,
            shell: DEFAULT_SHELL,
        });
    });

    describe('the failure detail', () => {
        it('is the LAST THREE stderr lines, joined by spaces', async () => {
            const executor = executorReturning(
                1,
                '  first line\nsecond line\nthird line\nfourth line  '
            );

            const error = await ensureFnmNodeVersion(executor, '24', logger);

            expect(error).toContain('second line third line fourth line');
            expect(error).not.toContain('first line');
        });

        it('falls back to the TAIL of stdout when stderr is empty', async () => {
            const stdout = `${'x'.repeat(150)}${'y'.repeat(200)}`;
            const executor = executorResolving({ code: 1, stderr: '', stdout });

            const error = await ensureFnmNodeVersion(executor, '24', logger);

            expect(error).toContain('y'.repeat(200));
            expect(error).not.toContain('x');
        });

        it('says the command never ran when there is no exit code and no output', async () => {
            // Neither stream present, and no exit code: an fnm that was never spawned.
            const executor = executorResolving({ code: null });

            const error = await ensureFnmNodeVersion(executor, '24', logger);

            expect(error).toContain('exit code unknown (command did not run)');
        });
    });
});
