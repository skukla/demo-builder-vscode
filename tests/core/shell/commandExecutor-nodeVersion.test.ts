/**
 * Which command string actually reaches execa once fnm is in the picture.
 *
 * `useNodeVersion` decides whether the command runs as typed, wrapped in
 * `fnm exec --using=<version>`, or wrapped in `eval "$(fnm env)" &&` — and each
 * wrapper also forces the shell to /bin/zsh, because `eval` and `$(...)` are
 * shell syntax that execa's default shell:false would hand to the kernel as
 * part of a binary name.
 *
 * Everything here asserts the ARGUMENTS execa receives. The subprocess is a
 * mock and answers the same whatever it is handed, so a test that read the
 * result could not tell a wrapped command from an unwrapped one.
 */

import { CommandExecutor } from '@/core/shell/commandExecutor';
import { createFakeCommandExecutorDeps } from '../../helpers/commandExecutorDepsFake';
import { runThroughExeca } from './commandExecutor.testUtils';

jest.mock('execa');
import execa from 'execa';

const mockExeca = execa as jest.MockedFunction<typeof execa>;
const FNM = '/usr/local/bin/fnm';

/** An executor whose environment reports the named fnm path and auto version. */
function executorWith({
    fnmPath = FNM as string | null,
    autoVersion = '18' as string | null,
} = {}) {
    const deps = createFakeCommandExecutorDeps();
    (deps.environmentSetup.findFnmPath as jest.Mock).mockReturnValue(fnmPath);
    (deps.environmentSetup.findAdobeCLINodeVersion as jest.Mock).mockResolvedValue(autoVersion);
    return new CommandExecutor(deps);
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('an explicit Node version', () => {
    it('wraps the command in `fnm exec --using=<version>` and switches to zsh', async () => {
        const { execaCommand, execaOptions } = await runThroughExeca(
            executorWith(),
            mockExeca,
            'npm install',
            { useNodeVersion: '20' },
        );

        expect(execaCommand).toBe(`${FNM} exec --using=20 npm install`);
        expect(execaOptions.shell).toBe('/bin/zsh');
    });

    it('runs the command AS TYPED when fnm cannot be found', async () => {
        // Wrapping with a null path would run `null exec --using=20 npm install`.
        const { execaCommand } = await runThroughExeca(
            executorWith({ fnmPath: null }),
            mockExeca,
            'npm install',
            { useNodeVersion: '20' },
        );

        expect(execaCommand).toBe('npm install');
    });

    it('uses `eval "$(fnm env)"` for the CURRENT version rather than a --using pin', async () => {
        const { execaCommand, execaOptions } = await runThroughExeca(
            executorWith(),
            mockExeca,
            'npm install',
            { useNodeVersion: 'current' },
        );

        expect(execaCommand).toBe('eval "$(fnm env)" && npm install');
        expect(execaOptions.shell).toBe('/bin/zsh');
    });

    it('still uses the eval form for CURRENT when fnm is not on the PATH', async () => {
        // The eval branch asks fnm for its own environment, so it does not need
        // the binary's location the way `fnm exec` does.
        const { execaCommand } = await runThroughExeca(
            executorWith({ fnmPath: null }),
            mockExeca,
            'npm install',
            { useNodeVersion: 'current' },
        );

        expect(execaCommand).toBe('eval "$(fnm env)" && npm install');
    });
});

describe('no Node version asked for', () => {
    it('runs the command as typed when useNodeVersion is omitted', async () => {
        const { execaCommand, execaOptions } = await runThroughExeca(
            executorWith(),
            mockExeca,
            'git status',
        );

        expect(execaCommand).toBe('git status');
        expect(execaOptions.shell).toBe(false);
    });

    it('runs the command as typed when useNodeVersion is explicitly null', async () => {
        const { execaCommand } = await runThroughExeca(executorWith(), mockExeca, 'git status', {
            useNodeVersion: null,
        });

        expect(execaCommand).toBe('git status');
    });

    it('never asks the environment where fnm lives', async () => {
        const deps = createFakeCommandExecutorDeps();
        (deps.environmentSetup.findFnmPath as jest.Mock).mockReturnValue(FNM);

        await runThroughExeca(new CommandExecutor(deps), mockExeca, 'git status');

        expect(deps.environmentSetup.findFnmPath).not.toHaveBeenCalled();
    });
});

describe('the AUTO version', () => {
    it('resolves the Adobe CLI version and wraps with it', async () => {
        const { execaCommand } = await runThroughExeca(
            executorWith({ autoVersion: '22' }),
            mockExeca,
            'aio console where',
            { useNodeVersion: 'auto', configureTelemetry: false },
        );

        expect(execaCommand).toBe(`${FNM} exec --using=22 aio console where`);
    });

    it('runs the command UNWRAPPED when no Adobe CLI version can be resolved', async () => {
        // findAdobeCLINodeVersion returns null when fnm has no install matching
        // the CLI. Wrapping anyway would run `fnm exec --using=null aio ...`.
        const { execaCommand } = await runThroughExeca(
            executorWith({ autoVersion: null }),
            mockExeca,
            'aio console where',
            { useNodeVersion: 'auto', configureTelemetry: false },
        );

        expect(execaCommand).toBe('aio console where');
    });

    it('uses the eval form when the resolved version is CURRENT', async () => {
        const { execaCommand } = await runThroughExeca(
            executorWith({ autoVersion: 'current' }),
            mockExeca,
            'aio console where',
            { useNodeVersion: 'auto', configureTelemetry: false },
        );

        expect(execaCommand).toBe('eval "$(fnm env)" && aio console where');
    });

    it('refuses a resolved version carrying shell metacharacters', async () => {
        // CWE-77: the resolved version is interpolated into a shell command, and
        // it comes from the environment rather than from the caller, so the
        // caller-side validation above it cannot have covered it.
        const executor = executorWith({ autoVersion: '20; rm -rf /' });

        await expect(
            executor.execute('aio console where', {
                useNodeVersion: 'auto',
                configureTelemetry: false,
            }),
        ).rejects.toThrow('Invalid Node.js version format');
        expect(mockExeca).not.toHaveBeenCalled();
    });
});
