/**
 * Which command string actually reaches execa once fnm is in the picture.
 *
 * `useNodeVersion` decides whether the command runs as typed, wrapped in
 * `fnm exec --using=<version>`, or wrapped in `eval "$(fnm env)" &&` — and each
 * wrapper needs a shell, because execa's default shell:false would hand the
 * whole string to the kernel as a binary name. `fnm exec` keeps the caller's
 * shell, else the platform's; the `eval` form uses zsh.
 *
 * Everything here asserts the ARGUMENTS execa receives. The subprocess is a
 * mock and answers the same whatever it is handed, so a test that read the
 * result could not tell a wrapped command from an unwrapped one.
 */

import { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { demoBuilderFnmDir } from '@/core/shell/nodeStore';
import { createFakeCommandExecutorDeps } from '../../helpers/commandExecutorDepsFake';
import { runThroughExeca } from './commandExecutor.testUtils';

jest.mock('execa');
import execa from 'execa';

const mockExeca = execa as jest.MockedFunction<typeof execa>;
const FNM = '/usr/local/bin/fnm';

/** An executor whose environment reports the named fnm path. */
function executorWith({ fnmPath = FNM as string | null } = {}) {
    const deps = createFakeCommandExecutorDeps();
    (deps.environmentSetup.findFnmPath as jest.Mock).mockReturnValue(fnmPath);
    return new CommandExecutor(deps);
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('an explicit Node version', () => {
    it('wraps the command in `fnm exec --using=<version>` and runs it in the platform shell', async () => {
        const { execaCommand, execaOptions } = await runThroughExeca(
            executorWith(),
            mockExeca,
            'npm install',
            { useNodeVersion: '20' },
        );

        expect(execaCommand).toBe(`${FNM} exec --using=20 npm install`);
        expect(execaOptions.shell).toBe(DEFAULT_SHELL);
    });

    it('keeps a shell the caller named', async () => {
        const { execaOptions } = await runThroughExeca(executorWith(), mockExeca, 'npm install', {
            useNodeVersion: '20',
            shell: '/bin/sh',
        });

        expect(execaOptions.shell).toBe('/bin/sh');
    });

    it("points fnm at Demo Builder's own store, keeping the rest of the environment (PR-1a)", async () => {
        const { execaOptions } = await runThroughExeca(executorWith(), mockExeca, 'npm install', {
            useNodeVersion: '24',
        });

        const env = execaOptions.env as NodeJS.ProcessEnv;
        expect(env.FNM_DIR).toBe(demoBuilderFnmDir());
        // An env without PATH runs nothing.
        expect(env.PATH).toBe(process.env.PATH);
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

describe('a version that is not a Node version', () => {
    it("refuses 'auto', which was removed (PR-1a)", async () => {
        await expect(
            executorWith().execute('npm install', { useNodeVersion: 'auto' }),
        ).rejects.toThrow('Invalid Node.js version format');
        expect(mockExeca).not.toHaveBeenCalled();
    });
});
