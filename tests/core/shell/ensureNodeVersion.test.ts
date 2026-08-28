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
import type { CommandExecutor } from '@/core/shell';
import type { Logger } from '@/types/logger';

const logger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as unknown as Logger;

function executorReturning(code: number, stderr = ''): CommandExecutor {
    return { execute: jest.fn().mockResolvedValue({ code, stderr }) } as unknown as CommandExecutor;
}

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
            '/opt/homebrew/bin/fnm install 24',
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
});
