/**
 * The methods callers reach for by name: existence probes, batches, the queue
 * and the file watcher.
 *
 * The batch methods are the interesting ones. `executeSequence` and
 * `executeParallel` do not just forward — each one DECIDES, per command, whether
 * it is an Adobe CLI invocation and therefore needs the telemetry opt-out, the
 * enhanced PATH and the auto Node version. Nothing covered those decisions, and
 * they are the same three that make `aio` work at all from a GUI-launched VS
 * Code, written out a second time.
 *
 * The real `CommandSequencer` is used rather than a stub, because a stubbed one
 * never calls the callback those decisions live in.
 */

import { CommandExecutor } from '@/core/shell/commandExecutor';
import { CommandSequencer } from '@/core/shell/commandSequencer';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createFakeCommandExecutorDeps } from '../../helpers/commandExecutorDepsFake';
import { createMockExecaSubprocess, simulateSubprocessComplete } from './commandExecutor.testUtils';

jest.mock('execa');
import execa from 'execa';

const mockExeca = execa as jest.MockedFunction<typeof execa>;

function build() {
    const deps = createFakeCommandExecutorDeps({ commandSequencer: new CommandSequencer() });
    return { deps, executor: new CommandExecutor(deps) };
}

/** Every command execa was asked to run, with the options it was handed. */
function execaCalls(): Array<{ command: string; options: Record<string, unknown> }> {
    return mockExeca.mock.calls.map((c) => ({
        command: c[0] as string,
        options: (c[1] ?? {}) as Record<string, unknown>,
    }));
}

beforeEach(() => {
    jest.clearAllMocks();
    // Every subprocess completes cleanly on the next tick, so a batch can run
    // several without the test choreographing each one.
    mockExeca.mockImplementation(() => {
        const subprocess = createMockExecaSubprocess();
        setImmediate(() => simulateSubprocessComplete(subprocess, 'ok', '', 0));
        return subprocess;
    });
});

describe('commandExists', () => {
    it('probes a Node tool against the CURRENT node version', async () => {
        // `which node` under a pinned fnm version answers about that version's
        // shim, not about the node the extension is actually running with.
        const { executor } = build();

        await executor.commandExists('node');

        expect(execaCalls()[0].command).toBe('eval "$(fnm env)" && which node');
    });

    it('probes npm and npx the same way', async () => {
        const { executor } = build();

        await executor.commandExists('npm');
        await executor.commandExists('npx');

        expect(execaCalls().map((c) => c.command)).toEqual([
            'eval "$(fnm env)" && which npm',
            'eval "$(fnm env)" && which npx',
        ]);
    });

    it('probes any other tool on the ENHANCED path instead', async () => {
        const { deps, executor } = build();

        await executor.commandExists('git');

        expect(execaCalls()[0].command).toBe('which git');
        expect(deps.environmentSetup.findNpmGlobalPaths).toHaveBeenCalled();
    });

    it('reports the tool as present when `which` printed a path', async () => {
        const { executor } = build();

        await expect(executor.commandExists('git')).resolves.toBe(true);
    });

    it('reports the tool as ABSENT when `which` printed only whitespace', async () => {
        // A shell that finds nothing can still print a newline. Measuring the
        // untrimmed length calls that a hit.
        mockExeca.mockImplementation(() => {
            const subprocess = createMockExecaSubprocess();
            setImmediate(() => simulateSubprocessComplete(subprocess, '  \n', '', 0));
            return subprocess;
        });
        const { executor } = build();

        await expect(executor.commandExists('git')).resolves.toBe(false);
    });

    it('reports a NODE tool as present or absent by the same trimmed answer', async () => {
        // The Node branch has its own copy of the length test, so the
        // whitespace case has to be asked of it separately.
        mockExeca.mockImplementation(() => {
            const subprocess = createMockExecaSubprocess();
            setImmediate(() => simulateSubprocessComplete(subprocess, '  \n', '', 0));
            return subprocess;
        });
        const { executor } = build();

        await expect(executor.commandExists('node')).resolves.toBe(false);
    });

    it('reports a node tool as present when `which` printed its path', async () => {
        mockExeca.mockImplementation(() => {
            const subprocess = createMockExecaSubprocess();
            setImmediate(() =>
                simulateSubprocessComplete(subprocess, '/usr/local/bin/node\n', '', 0),
            );
            return subprocess;
        });
        const { executor } = build();

        await expect(executor.commandExists('node')).resolves.toBe(true);
    });

    it('reports the tool as absent when the probe throws', async () => {
        mockExeca.mockImplementation(() => {
            const subprocess = createMockExecaSubprocess();
            setImmediate(() => subprocess._reject(new Error('spawn EACCES')));
            return subprocess;
        });
        const { executor } = build();

        await expect(executor.commandExists('git')).resolves.toBe(false);
    });

    it('refuses a name carrying shell metacharacters, without running anything', async () => {
        const { executor } = build();

        await expect(executor.commandExists('git; rm -rf /')).resolves.toBe(false);
        expect(mockExeca).not.toHaveBeenCalled();
    });
});

describe('executeSequence', () => {
    it('gives an aio command the three Adobe CLI settings', async () => {
        const { deps, executor } = build();

        await executor.executeSequence([{ command: 'aio console where' }]);

        // useNodeVersion:'auto' — resolved to 18 by the environment and wrapped.
        expect(execaCalls()[0].command).toBe(
            '/usr/local/bin/fnm exec --using=18 aio console where',
        );
        // enhancePath:true — the npm global bin directories are prepended.
        expect((execaCalls()[0].options.env as NodeJS.ProcessEnv).PATH).toContain(
            '/usr/local/lib/node_modules/.bin',
        );
        // configureTelemetry:true — the opt-out is written before the command.
        expect(deps.environmentSetup.ensureAdobeCLIConfigured).toHaveBeenCalled();
    });

    it('gives a non-aio command none of them', async () => {
        const { deps, executor } = build();

        await executor.executeSequence([{ command: 'npm install' }]);

        expect(execaCalls()[0].command).toBe('npm install');
        expect(execaCalls()[0].options.env).toBeUndefined();
        expect(deps.environmentSetup.ensureAdobeCLIConfigured).not.toHaveBeenCalled();
    });

    it('takes each step’s named resource lock', async () => {
        const { deps, executor } = build();

        await executor.executeSequence([{ command: 'npm install', resource: 'node_modules' }]);

        expect(deps.resourceLocker.executeExclusive).toHaveBeenCalledWith(
            'node_modules',
            expect.any(Function),
        );
    });

    it('returns one result per command, in order', async () => {
        const { executor } = build();

        const results = await executor.executeSequence([
            { command: 'echo one' },
            { command: 'echo two' },
        ]);

        expect(results).toHaveLength(2);
        expect(results[0].code).toBe(0);
        expect(execaCalls().map((c) => c.command)).toEqual(['echo one', 'echo two']);
    });
});

describe('executeParallel', () => {
    it('gives an aio command the three Adobe CLI settings', async () => {
        const { deps, executor } = build();

        await executor.executeParallel([{ command: 'aio console where' }]);

        expect(execaCalls()[0].command).toBe(
            '/usr/local/bin/fnm exec --using=18 aio console where',
        );
        expect((execaCalls()[0].options.env as NodeJS.ProcessEnv).PATH).toContain(
            '/usr/local/lib/node_modules/.bin',
        );
        expect(deps.environmentSetup.ensureAdobeCLIConfigured).toHaveBeenCalled();
    });

    it('gives a non-aio command none of them', async () => {
        const { deps, executor } = build();

        await executor.executeParallel([{ command: 'npm install' }]);

        expect(execaCalls()[0].command).toBe('npm install');
        expect(execaCalls()[0].options.env).toBeUndefined();
        expect(deps.environmentSetup.ensureAdobeCLIConfigured).not.toHaveBeenCalled();
    });

    it('takes NO resource lock — that is what makes it parallel', async () => {
        const { deps, executor } = build();

        await executor.executeParallel([{ command: 'npm install', resource: 'node_modules' }]);

        expect(deps.resourceLocker.executeExclusive).not.toHaveBeenCalled();
    });

    it('returns one result per command', async () => {
        const { executor } = build();

        const results = await executor.executeParallel([
            { command: 'echo one' },
            { command: 'echo two' },
        ]);

        expect(results).toHaveLength(2);
        expect(results[1].code).toBe(0);
    });
});

describe('queueCommand', () => {
    it('runs a queued command under the resource lock it named', async () => {
        const { deps, executor } = build();

        const result = await executor.queueCommand('npm install', {}, 'node_modules');

        expect(deps.resourceLocker.executeExclusive).toHaveBeenCalledWith(
            'node_modules',
            expect.any(Function),
        );
        expect(result.code).toBe(0);
    });
});

describe('waitForFileSystem', () => {
    it('hands the watcher the path, the condition and the default timeout', async () => {
        const { deps, executor } = build();
        const condition = jest.fn().mockResolvedValue(true);

        await executor.waitForFileSystem('/tmp/thing', condition);

        expect(deps.fileWatcher.waitForFileSystem).toHaveBeenCalledWith(
            '/tmp/thing',
            condition,
            TIMEOUTS.FILE_WATCH_TIMEOUT,
        );
    });

    it('passes the condition through as undefined when the caller gave none', async () => {
        // No test passes a DIFFERENT timeout, and none can: the default value
        // comes from a const-asserted table, so the parameter's type is the
        // literal 10000 and any other number fails to compile.
        const { deps, executor } = build();

        await executor.waitForFileSystem('/tmp/thing');

        expect(deps.fileWatcher.waitForFileSystem).toHaveBeenCalledWith(
            '/tmp/thing',
            undefined,
            TIMEOUTS.FILE_WATCH_TIMEOUT,
        );
    });
});
