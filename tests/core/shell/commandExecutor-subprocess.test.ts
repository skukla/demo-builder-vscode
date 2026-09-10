/**
 * What execa is handed, and what comes back out of the subprocess.
 *
 * This is the layer where the executor stops deciding and starts running: the
 * shell flag, the timeout, the two stream listeners, the telemetry auto-answer,
 * and the four different failures a finished child can represent. Each of those
 * failures is reported as a DIFFERENT error, and the caller acts on which one it
 * got — a cancelled command is expected, a killed one is not.
 *
 * The subprocess is a mock, so nothing here asserts on its answer. What is
 * asserted is the arguments execa received and the error the executor raises.
 */

import { CommandExecutor } from '@/core/shell/commandExecutor';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createFakeCommandExecutorDeps } from '../../helpers/commandExecutorDepsFake';
import {
    createMockExecaSubprocess,
    runThroughExeca,
    simulateSubprocessComplete,
    type MockExecaResult,
} from './commandExecutor.testUtils';

jest.mock('execa');
import execa from 'execa';

const mockExeca = execa as jest.MockedFunction<typeof execa>;
const TELEMETRY_PROMPT =
    'Would you like to allow @adobe/aio-cli to collect anonymous usage data?';

function build() {
    const deps = createFakeCommandExecutorDeps();
    return { deps, executor: new CommandExecutor(deps) };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Start a streaming command and finish it with `finish(subprocess)`. */
async function streamThrough(
    executor: CommandExecutor,
    finish: (subprocess: ReturnType<typeof createMockExecaSubprocess>) => void,
    absent: Array<'stdout' | 'stderr' | 'stdin'> = [],
) {
    const subprocess = createMockExecaSubprocess(absent);
    mockExeca.mockReturnValue(subprocess);
    const promise = executor.execute('some-command', {
        streaming: true,
        onOutput: () => undefined,
    });
    await settle();
    finish(subprocess);
    return promise;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('the options execa receives', () => {
    it('says shell:false when the caller named no shell', async () => {
        // Strictly false, not undefined: execa reads `shell: undefined` as
        // "use my default", which is not the same decision.
        const { executor } = build();

        const { execaOptions } = await runThroughExeca(executor, mockExeca, 'git status');

        expect(execaOptions.shell).toBe(false);
    });

    it('passes through the shell the caller named', async () => {
        const { executor } = build();

        const { execaOptions } = await runThroughExeca(executor, mockExeca, 'git status', {
            shell: '/bin/sh',
        });

        expect(execaOptions.shell).toBe('/bin/sh');
    });

    it('applies the normal timeout when the caller named none', async () => {
        const { executor } = build();

        const { execaOptions } = await runThroughExeca(executor, mockExeca, 'git status');

        expect(execaOptions.timeout).toBe(TIMEOUTS.NORMAL);
    });

    it('applies the timeout the caller named', async () => {
        const { executor } = build();

        const { execaOptions } = await runThroughExeca(executor, mockExeca, 'git status', {
            timeout: 45_000,
        });

        expect(execaOptions.timeout).toBe(45_000);
    });
});

describe('what the finished command reports', () => {
    it('returns the collected streams and the exit code', async () => {
        const { executor } = build();

        const { result } = await runThroughExeca(
            executor,
            mockExeca,
            'git status',
            {},
            { stdout: 'on branch main\n', stderr: 'a warning\n', exitCode: 3 },
        );

        expect(result.stdout).toBe('on branch main\n');
        expect(result.stderr).toBe('a warning\n');
        expect(result.code).toBe(3);
    });

    it('measures the elapsed time rather than adding the two clocks', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        const { executor } = build();

        const { result } = await runThroughExeca(executor, mockExeca, 'git status');

        expect(result.duration).toBe(0);
    });

    it('raises a timeout error when the child reports it timed out', async () => {
        // With `reject: false` execa RESOLVES on a timeout, so the flag on the
        // result is the only signal; a caller that saw a clean resolution would
        // treat a truncated run as a successful one.
        const { executor } = build();

        const promise = streamThrough(executor, (subprocess) =>
            subprocess._resolve({ exitCode: 0, timedOut: true } as MockExecaResult),
        );

        await expect(promise).rejects.toThrow(/Command timed out after \d+ms/);
    });
});

describe('the streams the child may not have', () => {
    it('completes when the child exposes no stdout or stderr', async () => {
        // execa hands back null for a stream it was not asked to pipe.
        const { executor } = build();

        const promise = streamThrough(
            executor,
            (subprocess) => subprocess._resolve({ exitCode: 0 }),
            ['stdout', 'stderr'],
        );

        await expect(promise).resolves.toMatchObject({ code: 0 });
    });

    it('completes when the telemetry prompt arrives and there is no stdin', async () => {
        const { executor } = build();

        const promise = streamThrough(
            executor,
            (subprocess) => {
                subprocess.stdout.emit('data', Buffer.from(TELEMETRY_PROMPT));
                subprocess._resolve({ exitCode: 0 });
            },
            ['stdin'],
        );

        await expect(promise).resolves.toMatchObject({ code: 0 });
    });
});

describe('the aio telemetry prompt', () => {
    it('is answered "n" and the pipe closed', async () => {
        const { executor } = build();
        let seen!: ReturnType<typeof createMockExecaSubprocess>;

        await streamThrough(executor, (subprocess) => {
            seen = subprocess;
            subprocess.stdout.emit('data', Buffer.from(`${TELEMETRY_PROMPT} (y/N)`));
            subprocess._resolve({ exitCode: 0 });
        });

        expect(seen.stdin.write).toHaveBeenCalledWith('n\n');
        expect(seen.stdin.end).toHaveBeenCalled();
    });

    it('is not answered for ordinary output', async () => {
        // Writing to stdin of a command that is not asking a question closes a
        // pipe the child may still be reading.
        const { executor } = build();
        let seen!: ReturnType<typeof createMockExecaSubprocess>;

        await streamThrough(executor, (subprocess) => {
            seen = subprocess;
            subprocess.stdout.emit('data', Buffer.from('building...\n'));
            subprocess._resolve({ exitCode: 0 });
        });

        expect(seen.stdin.write).not.toHaveBeenCalled();
    });
});

describe('how a failed child is reported', () => {
    it('reports a cancellation as a cancellation', async () => {
        const { executor } = build();

        const promise = streamThrough(executor, (subprocess) =>
            subprocess._reject(
                Object.assign(new Error('Command failed'), { isCanceled: true }),
            ),
        );

        await expect(promise).rejects.toThrow('Command was canceled');
    });

    it('reports a kill as a kill', async () => {
        const { executor } = build();

        const promise = streamThrough(executor, (subprocess) =>
            subprocess._reject(Object.assign(new Error('Command failed'), { killed: true })),
        );

        await expect(promise).rejects.toThrow('Command was killed');
    });

    it('rethrows any other failure unchanged', async () => {
        // Relabelling an unknown failure as "canceled" or "killed" tells the
        // caller a story about a cause nobody established.
        const { executor } = build();

        const promise = streamThrough(executor, (subprocess) =>
            subprocess._reject(new Error('spawn EACCES')),
        );

        await expect(promise).rejects.toThrow('spawn EACCES');
    });
});

describe('choosing between streaming and retrying', () => {
    it('streams — bypassing retry — only when BOTH streaming and onOutput are given', async () => {
        const { deps, executor } = build();

        await streamThrough(executor, (subprocess) =>
            simulateSubprocessComplete(subprocess, 'ok', '', 0),
        );

        expect(deps.retryManager.executeWithRetry).not.toHaveBeenCalled();
    });

    it('goes through retry when streaming was asked for without an output sink', async () => {
        // The streaming path calls onOutput unconditionally; entering it without
        // one is a TypeError on the first byte of output.
        const { deps, executor } = build();

        const { result } = await runThroughExeca(
            executor,
            mockExeca,
            'git status',
            { streaming: true },
            { stdout: 'ok' },
        );

        expect(deps.retryManager.executeWithRetry).toHaveBeenCalled();
        expect(result.stdout).toBe('ok');
    });

    it('goes through retry when an output sink was given without streaming', async () => {
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'git status', {
            onOutput: () => undefined,
        });

        expect(deps.retryManager.executeWithRetry).toHaveBeenCalled();
    });
});

describe('exclusive execution', () => {
    it('takes the named lock and returns what ran inside it', async () => {
        const { deps, executor } = build();

        const { result } = await runThroughExeca(
            executor,
            mockExeca,
            'git status',
            { exclusive: 'repo' },
            { stdout: 'done' },
        );

        expect(deps.resourceLocker.executeExclusive).toHaveBeenCalledWith(
            'repo',
            expect.any(Function),
        );
        expect(result.stdout).toBe('done');
    });

    it('takes no lock for a command that named no resource', async () => {
        const { deps, executor } = build();

        await runThroughExeca(executor, mockExeca, 'git status');

        expect(deps.resourceLocker.executeExclusive).not.toHaveBeenCalled();
    });
});
