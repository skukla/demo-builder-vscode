/**
 * The enhanced PATH — when the child process gets one, and what is in it.
 *
 * VS Code launched from the Dock inherits launchd's PATH, which has no
 * `/usr/local/bin` and none of npm's global bin directories. Every globally
 * installed tool is invisible to a child process started from that PATH, so the
 * executor prepends what `EnvironmentSetup` found. Getting the condition wrong
 * in either direction is a real failure: too narrow and `aio` is "not
 * installed", too wide and a caller who asked for a clean environment does not
 * get one.
 *
 * The assertions are on the env object execa RECEIVES. The subprocess is a mock
 * and its answer says nothing about what it was handed.
 */

import { CommandExecutor } from '@/core/shell/commandExecutor';
import { createFakeCommandExecutorDeps } from '../../helpers/commandExecutorDepsFake';
import { runThroughExeca } from './commandExecutor.testUtils';

jest.mock('execa');
import execa from 'execa';

const mockExeca = execa as jest.MockedFunction<typeof execa>;
const NPM_BIN = '/usr/local/lib/node_modules/.bin';

/** An executor whose environment reports the given npm global bin directories. */
function executorWith(extraPaths: string[] = [NPM_BIN]) {
    const deps = createFakeCommandExecutorDeps();
    (deps.environmentSetup.findNpmGlobalPaths as jest.Mock).mockReturnValue(extraPaths);
    return new CommandExecutor(deps);
}

let originalPath: string | undefined;

beforeEach(() => {
    jest.clearAllMocks();
    originalPath = process.env.PATH;
});

afterEach(() => {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
});

describe('when the PATH is enhanced', () => {
    it('prepends the npm global bin directories for an aio command', async () => {
        process.env.PATH = '/usr/bin';

        const { execaOptions } = await runThroughExeca(
            executorWith(),
            mockExeca,
            'aio console where',
            { configureTelemetry: false },
        );

        expect((execaOptions.env as NodeJS.ProcessEnv).PATH).toBe(`${NPM_BIN}:/usr/bin`);
    });

    it('prepends them for any command that asks, aio or not', async () => {
        process.env.PATH = '/usr/bin';

        const { execaOptions } = await runThroughExeca(executorWith(), mockExeca, 'git status', {
            enhancePath: true,
        });

        expect((execaOptions.env as NodeJS.ProcessEnv).PATH).toBe(`${NPM_BIN}:/usr/bin`);
    });

    it('joins several directories with the path separator, in order', async () => {
        process.env.PATH = '/usr/bin';

        const { execaOptions } = await runThroughExeca(
            executorWith(['/opt/one/bin', '/opt/two/bin']),
            mockExeca,
            'git status',
            { enhancePath: true },
        );

        expect((execaOptions.env as NodeJS.ProcessEnv).PATH).toBe(
            '/opt/one/bin:/opt/two/bin:/usr/bin',
        );
    });

    it('ends the PATH cleanly when the process has none of its own', async () => {
        // `${paths}:${process.env.PATH}` with no PATH interpolates the string
        // "undefined" as a directory, which every lookup then walks.
        delete process.env.PATH;

        const { execaOptions } = await runThroughExeca(executorWith(), mockExeca, 'git status', {
            enhancePath: true,
        });

        expect((execaOptions.env as NodeJS.ProcessEnv).PATH).toBe(`${NPM_BIN}:`);
    });

    it('carries the rest of the process environment across', async () => {
        const { execaOptions } = await runThroughExeca(executorWith(), mockExeca, 'git status', {
            enhancePath: true,
        });

        expect((execaOptions.env as NodeJS.ProcessEnv).HOME).toBe(process.env.HOME);
    });
});

describe('when the PATH is left alone', () => {
    it('sends no env at all for a plain command that did not ask', async () => {
        const { execaOptions } = await runThroughExeca(executorWith(), mockExeca, 'git status');

        expect(execaOptions.env).toBeUndefined();
    });

    it('honours enhancePath:false on an aio command', async () => {
        // The aio default is to enhance; an explicit false has to win, or a
        // caller cannot run a command against the environment it chose.
        const { execaOptions } = await runThroughExeca(
            executorWith(),
            mockExeca,
            'aio console where',
            { enhancePath: false, configureTelemetry: false },
        );

        expect(execaOptions.env).toBeUndefined();
    });

    it('sends no env when the environment found no npm global directories', async () => {
        // Prepending an empty list produces a leading ":" — an empty entry that
        // POSIX shells read as the current directory.
        const { execaOptions } = await runThroughExeca(executorWith([]), mockExeca, 'git status', {
            enhancePath: true,
        });

        expect(execaOptions.env).toBeUndefined();
    });
});
