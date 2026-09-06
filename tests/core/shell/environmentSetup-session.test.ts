/**
 * EnvironmentSetup — the session decisions
 *
 * Reading components.json, switching Node once per session, the telemetry
 * re-entrancy guard, and the command prefix. The configuration suite proves the
 * happy paths; these pin what is decided along the way — which collaborator is
 * NOT called, what happens after a failure, and which values reach executeCommand.
 */
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { CommandResult, ExecuteOptions } from '@/core/shell/types';
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { createEnvironmentSetup, resetAllMocks } from './environmentSetup.testUtils';

jest.mock('fs');
jest.mock('os', () => ({
    homedir: jest.fn(() => '/mock/home'),
    platform: jest.fn(() => process.platform),
}));
jest.mock('child_process', () => ({
    execSync: jest.fn(),
}));

const HOME = '/mock/home';
const EXTENSION_PATH = '/path/to/extension';
const COMPONENTS_PATH = path.join(
    EXTENSION_PATH,
    'src',
    'features',
    'components',
    'config',
    'components.json',
);

const mockedExists = fsSync.existsSync as jest.Mock;
const mockedRead = fsSync.readFileSync as jest.Mock;

type Execute = (command: string, options?: ExecuteOptions) => Promise<CommandResult>;

const ok = (stdout = ''): CommandResult =>
    ({ code: 0, stdout, stderr: '', success: true }) as unknown as CommandResult;

/** The commands handed to executeCommand, in order. */
const commandsRun = (fn: jest.Mock): string[] => fn.mock.calls.map((c) => c[0] as string);

/** Put a components.json on disk carrying `data`. */
function installComponentsJson(data: unknown): void {
    (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
        extensionPath: EXTENSION_PATH,
    });
    mockedExists.mockImplementation((p: string) => p === COMPONENTS_PATH);
    mockedRead.mockReturnValue(JSON.stringify(data));
}

const WITH_NODE_20 = { infrastructure: { 'adobe-cli': { nodeVersion: '20' } } };

/**
 * A current version that does NOT satisfy Node 20. It must not contain "20"
 * anywhere: the check is a substring test, so "v18.20.0" reads as a match and
 * makes a switch test pass without a switch ever happening.
 */
const OTHER_VERSION = 'v18.19.1';

/** The two statics EnvironmentSetup memoises telemetry state in. */
const statics = () =>
    EnvironmentSetup as unknown as { telemetryConfigured: boolean; checkingTelemetry: boolean };

describe('EnvironmentSetup — session decisions', () => {
    let environmentSetup: EnvironmentSetup;

    beforeEach(() => {
        resetAllMocks();
        (os.homedir as jest.Mock).mockReturnValue(HOME);
        environmentSetup = createEnvironmentSetup(HOME);
    });

    describe('reading the infrastructure Node version', () => {
        it('does not touch the filesystem when the extension is not registered', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

            await expect(environmentSetup.getInfrastructureNodeVersion('adobe-cli')).resolves
                .toBeNull();
            expect(mockedExists).not.toHaveBeenCalled();
        });

        it('does not read a components.json that is not there', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
                extensionPath: EXTENSION_PATH,
            });
            mockedExists.mockReturnValue(false);

            await expect(environmentSetup.getInfrastructureNodeVersion('adobe-cli')).resolves
                .toBeNull();
            expect(mockedRead).not.toHaveBeenCalled();
        });

        it('answers null, not undefined, when the file cannot be parsed', async () => {
            installComponentsJson(WITH_NODE_20);
            mockedRead.mockReturnValue('{ not json');

            await expect(environmentSetup.getInfrastructureNodeVersion('adobe-cli')).resolves
                .toBeNull();
        });

        it('reads the version as a string even when the file holds a number', async () => {
            installComponentsJson({ infrastructure: { 'adobe-cli': { nodeVersion: 20 } } });

            await expect(environmentSetup.getInfrastructureNodeVersion('adobe-cli')).resolves
                .toBe('20');
        });
    });

    describe('setting the session Node version', () => {
        function setup(execute: Execute) {
            const fn = jest.fn(execute);
            return { fn, run: () => environmentSetup.ensureAdobeCLINodeVersion(fn) };
        }

        beforeEach(() => {
            installComponentsJson(WITH_NODE_20);
        });

        it('switches with the normal timeout when fnm reports a different version', async () => {
            const { fn, run } = setup(async (command) =>
                ok(command === 'fnm current' ? OTHER_VERSION : ''),
            );

            await run();

            expect(fn).toHaveBeenCalledWith('fnm use 20 --silent-if-unchanged', {
                timeout: 30000,
            });
            expect(environmentSetup.getSessionNodeVersion()).toBe('20');
            expect(environmentSetup.isSessionNodeVersionSet()).toBe(true);
        });

        it('leaves the Node version alone when fnm is already on it', async () => {
            const { fn, run } = setup(async (command) =>
                ok(command === 'fnm current' ? 'v20.11.0' : ''),
            );

            await run();

            expect(commandsRun(fn)).toEqual(['fnm --version', 'fnm current']);
        });

        it('switches when fnm cannot say which version it is on', async () => {
            const { fn, run } = setup(async (command) => {
                if (command === 'fnm current') throw new Error('not initialised');
                return ok();
            });

            await run();

            expect(commandsRun(fn)).toContain('fnm use 20 --silent-if-unchanged');
        });

        it('asks fnm through the default shell, so a Dock-launched host still finds it', async () => {
            const { fn, run } = setup(async () => ok('v20.11.0'));

            await run();

            expect(fn).toHaveBeenCalledWith('fnm --version', {
                timeout: 5000,
                shell: DEFAULT_SHELL,
            });
            expect(fn).toHaveBeenCalledWith('fnm current', {
                timeout: 5000,
                shell: DEFAULT_SHELL,
            });
        });

        it('asks fnm nothing further once fnm itself is missing', async () => {
            const { fn, run } = setup(async (command) => {
                if (command === 'fnm --version') throw new Error('command not found');
                return ok();
            });

            await run();

            expect(commandsRun(fn)).toEqual(['fnm --version']);
            expect(environmentSetup.isSessionNodeVersionSet()).toBe(true);
        });

        it('marks the session done when no Adobe CLI Node version can be found', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
            mockedExists.mockReturnValue(false);
            const { fn, run } = setup(async () => ok());

            await run();

            expect(fn).not.toHaveBeenCalled();
            expect(environmentSetup.isSessionNodeVersionSet()).toBe(true);
        });

        it('marks the session done even when the switch itself fails', async () => {
            const { run } = setup(async (command) => {
                if (command.startsWith('fnm use')) throw new Error('no such version');
                return ok(OTHER_VERSION);
            });

            await run();

            expect(environmentSetup.isSessionNodeVersionSet()).toBe(true);
        });

        it('does the work once per session, however often it is asked', async () => {
            const { fn, run } = setup(async () => ok(OTHER_VERSION));

            await run();
            const first = commandsRun(fn).length;
            await run();

            expect(commandsRun(fn)).toHaveLength(first);
        });

        it('releases the lock when setup finishes, so a later run is not blocked', async () => {
            const { fn, run } = setup(async () => ok(OTHER_VERSION));
            await run();

            // Only the "already set" flag is cleared: a stale lock would otherwise be
            // indistinguishable from a released one, since resetSession clears both.
            (environmentSetup as unknown as { isAdobeCLINodeVersionSet: boolean })
                .isAdobeCLINodeVersionSet = false;
            fn.mockClear();
            await run();

            expect(commandsRun(fn)).toContain('fnm --version');
        });

        it('forgets the session on reset', () => {
            const state = environmentSetup as unknown as {
                isAdobeCLINodeVersionSet: boolean;
                sessionNodeVersion: string | null;
            };
            state.isAdobeCLINodeVersionSet = true;
            state.sessionNodeVersion = '20';

            environmentSetup.resetSession();

            expect(environmentSetup.isSessionNodeVersionSet()).toBe(false);
            expect(environmentSetup.getSessionNodeVersion()).toBeNull();
        });
    });

    describe('opting out of Adobe CLI telemetry', () => {
        it('sends the opt-out without asking for telemetry on the way', async () => {
            const fn = jest.fn(async () => ok());

            await environmentSetup.ensureAdobeCLIConfigured(fn);

            expect(fn).toHaveBeenCalledWith('aio config set aio-cli-telemetry.optOut true', {
                configureTelemetry: false,
                encoding: 'utf8',
                timeout: 5000,
            });
        });

        it('does not try again after a non-zero exit', async () => {
            const fn = jest.fn(async () => ({ code: 1, stdout: '', stderr: 'boom' }) as
                unknown as CommandResult);

            await environmentSetup.ensureAdobeCLIConfigured(fn);
            await environmentSetup.ensureAdobeCLIConfigured(fn);

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('does not try again after the command throws', async () => {
            const fn = jest.fn(async () => {
                throw new Error('aio missing');
            });

            await environmentSetup.ensureAdobeCLIConfigured(fn);
            await environmentSetup.ensureAdobeCLIConfigured(fn);

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('refuses to re-enter while a configure is still in flight', async () => {
            // Bounded on purpose: without the flag a broken guard recurses until the
            // stack gives out, and a worker that dies is not a test that failed.
            let reentered = false;
            const fn: jest.Mock = jest.fn(async () => {
                if (!reentered) {
                    reentered = true;
                    await environmentSetup.ensureAdobeCLIConfigured(fn as unknown as Execute);
                }
                return ok();
            });

            await environmentSetup.ensureAdobeCLIConfigured(fn as unknown as Execute);

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('starts a fresh extension host with telemetry not yet configured', async () => {
            await jest.isolateModulesAsync(async () => {
                const fresh = require('@/core/shell/environmentSetup') as {
                    EnvironmentSetup: typeof EnvironmentSetup;
                };
                const fn = jest.fn(async () => ok());

                await new fresh.EnvironmentSetup().ensureAdobeCLIConfigured(fn);

                expect(fn).toHaveBeenCalledTimes(1);
            });
        });

        it('clears the in-flight guard when it is done', async () => {
            const fn = jest.fn(async () => ok());
            await environmentSetup.ensureAdobeCLIConfigured(fn);
            expect(statics().checkingTelemetry).toBe(false);

            statics().telemetryConfigured = false;
            await environmentSetup.ensureAdobeCLIConfigured(fn);

            expect(fn).toHaveBeenCalledTimes(2);
        });
    });

    describe('building the command prefix', () => {
        const build = (
            useNodeVersion?: string | 'auto' | null,
            currentFnmVersion?: string | null,
        ) => environmentSetup.buildCommandWithEnvironment('aio app deploy', {
            useNodeVersion,
            currentFnmVersion,
        });

        it('prefixes a specific version with fnm use', () => {
            expect(build('20')).toBe('fnm use 20 --silent-if-unchanged && aio app deploy');
        });

        it('evaluates fnm env for the current version', () => {
            expect(build('current')).toBe('eval "$(fnm env)" && aio app deploy');
        });

        it('adds nothing when fnm already reports that version', () => {
            expect(build('20', 'v20.11.0')).toBe('aio app deploy');
        });

        it('adds nothing for auto', () => {
            expect(build('auto')).toBe('aio app deploy');
        });

        it('adds nothing for an empty version', () => {
            expect(build('')).toBe('aio app deploy');
        });

        it('adds nothing when no version was asked for', () => {
            expect(build()).toBe('aio app deploy');
            expect(build(null)).toBe('aio app deploy');
        });
    });
});
