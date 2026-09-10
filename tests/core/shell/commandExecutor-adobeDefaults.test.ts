/**
 * The defaults an `aio` command gets for free, and the two awaits before it runs.
 *
 * A command starting `aio ` or `aio-` is recognised as Adobe CLI and given a
 * shell, a telemetry setting, a Node-version setting and a retry strategy it did
 * not ask for. Two of those defaults are the reason the CLI works at all from a
 * GUI-launched VS Code, and each is only visible in what execa is handed — so
 * that is what these assert, never the mocked subprocess's answer.
 *
 * The two AWAITS matter as much as the values: `ensureAdobeCLINodeVersion` and
 * `ensureAdobeCLIConfigured` have to finish BEFORE the command starts, or the
 * command runs against the environment they were about to fix.
 */

import { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { createFakeCommandExecutorDeps } from '../../helpers/commandExecutorDepsFake';
import {
    createMockExecaSubprocess,
    runThroughExeca,
    simulateSubprocessComplete,
} from './commandExecutor.testUtils';

jest.mock('execa');
import execa from 'execa';

const mockExeca = execa as jest.MockedFunction<typeof execa>;

/** A fresh executor and the machinery it was handed, so calls can be read back. */
function build() {
    const deps = createFakeCommandExecutorDeps();
    return { deps, executor: new CommandExecutor(deps) };
}

/** Let every already-queued microtask and immediate run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('the shell an aio command runs in', () => {
    it('defaults to the platform shell', async () => {
        // `aio` is a Node shebang script on the PATH, not an ELF binary execa can
        // spawn directly.
        const { executor } = build();

        const { execaOptions } = await runThroughExeca(executor, mockExeca, 'aio console where', {
            configureTelemetry: false,
        });

        expect(execaOptions.shell).toBe(DEFAULT_SHELL);
    });

    it('keeps a shell the caller chose', async () => {
        const { executor } = build();

        const { execaOptions } = await runThroughExeca(executor, mockExeca, 'aio console where', {
            shell: '/bin/sh',
            configureTelemetry: false,
        });

        expect(execaOptions.shell).toBe('/bin/sh');
    });

    it('recognises the hyphenated `aio-` form as Adobe CLI too', async () => {
        // `aio-cli` is how the CLI is invoked when the plugin binary is called
        // directly; it gets the same defaults or it gets none of them.
        const { executor } = build();

        const { execaOptions } = await runThroughExeca(executor, mockExeca, 'aio-cli plugins', {
            configureTelemetry: false,
        });

        expect(execaOptions.shell).toBe(DEFAULT_SHELL);
    });
});

describe('the Adobe CLI Node version', () => {
    it('is ensured before an ordinary aio command', async () => {
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'aio console where', {
            configureTelemetry: false,
        });

        expect(deps.environmentSetup.ensureAdobeCLINodeVersion).toHaveBeenCalled();
    });

    it('is NOT ensured for a bare version probe', async () => {
        // `aio -v` exists to be cheap. Ensuring the Node version first would run
        // another aio invocation to answer a question about aio.
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'aio -v', { configureTelemetry: false });

        expect(deps.environmentSetup.ensureAdobeCLINodeVersion).not.toHaveBeenCalled();
    });

    it('is AWAITED — the command does not start until it finishes', async () => {
        const { deps, executor } = build();
        let release!: () => void;
        (deps.environmentSetup.ensureAdobeCLINodeVersion as jest.Mock).mockReturnValue(
            new Promise<void>((resolve) => {
                release = resolve;
            }),
        );
        const subprocess = createMockExecaSubprocess();
        mockExeca.mockReturnValue(subprocess);

        const promise = executor.execute('aio console where', { configureTelemetry: false });
        await settle();
        expect(mockExeca).not.toHaveBeenCalled();

        release();
        await settle();
        simulateSubprocessComplete(subprocess, 'ok', '', 0);
        await promise;

        expect(mockExeca).toHaveBeenCalled();
    });
});

describe('telemetry configuration', () => {
    it('is NOT run for an aio command that did not ask for it', async () => {
        // The default is false, so the opt-out write does not happen on every
        // aio command in a session.
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'aio console where');

        expect(deps.environmentSetup.ensureAdobeCLIConfigured).not.toHaveBeenCalled();
    });

    it('is run when the caller asks for it', async () => {
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'aio console where', {
            configureTelemetry: true,
        });

        expect(deps.environmentSetup.ensureAdobeCLIConfigured).toHaveBeenCalled();
    });

    it('is run for a NON-aio command that asks for it', async () => {
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'npm install', { configureTelemetry: true });

        expect(deps.environmentSetup.ensureAdobeCLIConfigured).toHaveBeenCalled();
    });

    it('is skipped for `aio --version` even when asked for', async () => {
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'aio --version', { configureTelemetry: true });

        expect(deps.environmentSetup.ensureAdobeCLIConfigured).not.toHaveBeenCalled();
    });

    it('is skipped for the short `-v` probe too', async () => {
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'aio -v', { configureTelemetry: true });

        expect(deps.environmentSetup.ensureAdobeCLIConfigured).not.toHaveBeenCalled();
    });

    it('is AWAITED — the command does not start until it finishes', async () => {
        const { deps, executor } = build();
        let release!: () => void;
        (deps.environmentSetup.ensureAdobeCLIConfigured as jest.Mock).mockReturnValue(
            new Promise<void>((resolve) => {
                release = resolve;
            }),
        );
        const subprocess = createMockExecaSubprocess();
        mockExeca.mockReturnValue(subprocess);

        const promise = executor.execute('aio console where', { configureTelemetry: true });
        await settle();
        expect(mockExeca).not.toHaveBeenCalled();

        release();
        await settle();
        simulateSubprocessComplete(subprocess, 'ok', '', 0);
        await promise;

        expect(mockExeca).toHaveBeenCalled();
    });
});

describe('the retry strategy', () => {
    it('is the Adobe CLI one for an aio command', async () => {
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'aio console where', {
            configureTelemetry: false,
        });

        expect(deps.retryManager.getStrategy).toHaveBeenCalledWith('adobe-cli');
        expect(deps.retryManager.executeWithRetry).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ maxAttempts: 2 }),
            expect.any(String),
        );
    });

    it('is whatever the caller passed, when they passed one', async () => {
        const { deps, executor } = build();
        const strategy = { maxAttempts: 7, initialDelay: 1, maxDelay: 2, backoffFactor: 1 };

        await runThroughExeca(executor, mockExeca, 'aio console where', {
            configureTelemetry: false,
            retryStrategy: strategy,
        });

        expect(deps.retryManager.executeWithRetry).toHaveBeenCalledWith(
            expect.any(Function),
            strategy,
            expect.any(String),
        );
    });

    it('is the DEFAULT one for a command that is not Adobe CLI', async () => {
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'git status');

        expect(deps.retryManager.getStrategy).not.toHaveBeenCalled();
        expect(deps.retryManager.executeWithRetry).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ maxAttempts: 1 }),
            expect.any(String),
        );
    });

    it('names the command to the retry manager, truncated', async () => {
        // The label reaches the retry manager's own reporting; an untruncated
        // one carries the whole command line, arguments included.
        const { deps, executor } = build();
        const long = `git ${'x'.repeat(120)}`;

        await runThroughExeca(executor, mockExeca, long);

        expect(deps.retryManager.executeWithRetry).toHaveBeenCalledWith(
            expect.any(Function),
            expect.anything(),
            long.substring(0, 50),
        );
    });
});

describe('the Adobe CLI result cache', () => {
    it('serves a second `aio --version` without running it again', async () => {
        const { executor } = build();

        await runThroughExeca(executor, mockExeca, 'aio --version', {}, { stdout: '11.1.2' });
        const second = await executor.execute('aio --version');

        expect(mockExeca).toHaveBeenCalledTimes(1);
        expect(second.stdout).toBe('11.1.2');
    });

    it('does NOT cache a FAILED probe', async () => {
        // Caching a failure means the rest of the session believes the CLI is
        // broken because it was broken once.
        const { executor } = build();

        await runThroughExeca(executor, mockExeca, 'aio --version', {}, { exitCode: 1 });
        await runThroughExeca(executor, mockExeca, 'aio --version', {}, { exitCode: 0 });

        expect(mockExeca).toHaveBeenCalledTimes(2);
    });
});
