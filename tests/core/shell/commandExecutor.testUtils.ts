import type { ExecOptions } from 'child_process';
import type execa from 'execa';
import type { ExecaChildProcess } from 'execa';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { CommandResult, ExecuteOptions } from '@/core/shell/types';
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { ResourceLocker } from '@/core/shell/resourceLocker';
import { RetryStrategyManager } from '@/core/shell/retryStrategyManager';
import { EventEmitter } from 'events';
import { createFakeCommandExecutorDeps } from '../../helpers/commandExecutorDepsFake';

/**
 * Mock execa subprocess that simulates ExecaChildProcess behavior.
 * This replaces the old createMockChildProcess that mocked child_process.spawn.
 */
export interface MockExecaSubprocess extends EventEmitter {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: jest.Mock; end: jest.Mock };
    pid: number;
    kill: jest.Mock;
    exitCode: number | null;
    killed: boolean;
    // Promise-like behavior for await (full thenable protocol)
    then: (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) => Promise<any>;
    catch: (onrejected?: (reason: any) => any) => Promise<any>;
    finally: (onfinally?: () => void) => Promise<any>;
    // Control methods for tests
    _resolve: (result: MockExecaResult) => void;
    _reject: (error: Error) => void;
}

export interface MockExecaResult {
    exitCode: number | null;
    stdout?: string;
    stderr?: string;
    timedOut?: boolean;
    isCanceled?: boolean;
    killed?: boolean;
}

/**
 * Creates a mock execa subprocess with Promise-like behavior.
 * Use emit('data', Buffer.from('text')) on stdout/stderr to simulate output.
 * Use _resolve() or _reject() to complete the subprocess.
 */
/**
 * The mock subprocess, typed so `mockExeca.mockReturnValue(...)` accepts it.
 *
 * `MockExecaSubprocess` is an EventEmitter carrying the eight members
 * `CommandExecutor` actually touches; `ExecaChildProcess` is a much larger type no
 * object literal can satisfy. Every call site therefore wrote
 * `mockReturnValue(subprocess)` — 49 of them across 8 suites, each switching
 * off checking of the whole statement to get past one assignment.
 *
 * The intersection puts that cast HERE, once, and names what it is pretending to be.
 * Call sites need no cast at all: they still reach `.stdout.emit(...)` through the
 * mock half, and `mockReturnValue` accepts the execa half.
 */
export function createMockExecaSubprocess(
    absent: Array<'stdout' | 'stderr' | 'stdin'> = [],
): MockExecaSubprocess & ExecaChildProcess {
    const emitter = new EventEmitter();

    let resolvePromise: (result: MockExecaResult) => void;
    let rejectPromise: (error: Error) => void;

    const completionPromise = new Promise<MockExecaResult>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });
    // Mark the ROOT promise as handled. `then`/`catch`/`finally` below each derive a
    // fresh chain from it, so the SUT still sees every rejection; this only stops Node
    // reporting an unhandled one when the code under test never attaches a handler at
    // all. That is not hypothetical under mutation: emptying the try/await in
    // `executeStreamingInternal` leaves `_reject` with no listener, Node 20 exits the
    // process, and Stryker loses the whole worker — six crashed workers in the first
    // minute of a focused run on 2026-09-05, each one restarting the runner.
    completionPromise.catch(() => undefined);

    const mockSubprocess = emitter as MockExecaSubprocess;
    mockSubprocess.stdout = new EventEmitter();
    mockSubprocess.stderr = new EventEmitter();
    mockSubprocess.stdin = { write: jest.fn(), end: jest.fn() };
    mockSubprocess.pid = 12345;
    mockSubprocess.kill = jest.fn();
    mockSubprocess.exitCode = null;
    mockSubprocess.killed = false;

    // Promise-like interface for await (must implement full thenable protocol)
    mockSubprocess.then = (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) =>
        completionPromise.then(onfulfilled, onrejected);
    mockSubprocess.catch = (onrejected?: (reason: any) => any) =>
        completionPromise.catch(onrejected);
    // Note: .finally() must not create orphan rejection chains. The CommandExecutor calls
    // subprocess.finally() without awaiting the result, so we need to internally catch
    // rejections on the chain to prevent unhandled rejection errors.
    mockSubprocess.finally = (onfinally) => {
        const chain = completionPromise.finally(onfinally);
        chain.catch(() => {}); // Prevent orphan unhandled rejection
        return chain;
    };

    // execa hands back `null` for a stream it was not asked to pipe, and the
    // executor's `subprocess.stdout?.on(...)` chains are what keep that from
    // throwing. The interface above types all three as present because 49 call
    // sites reach straight through them; this is the one place that models the
    // other shape, so a test can ask for it by name instead of casting.
    for (const stream of absent) {
        (mockSubprocess as unknown as Record<string, undefined>)[stream] = undefined;
    }

    // Control methods for tests
    mockSubprocess._resolve = (result: MockExecaResult) => {
        mockSubprocess.exitCode = result.exitCode;
        resolvePromise!(result);
    };
    mockSubprocess._reject = (error: Error) => rejectPromise!(error);

    return mockSubprocess as MockExecaSubprocess & ExecaChildProcess;
}

/**
 * Simulates subprocess completion with output.
 * Emits stdout/stderr data events before resolving the subprocess promise.
 *
 * @param mockSubprocess - The mock subprocess to complete
 * @param stdout - Standard output to emit (empty string skips emission)
 * @param stderr - Standard error to emit (empty string skips emission)
 * @param exitCode - Exit code to resolve with
 */
export function simulateSubprocessComplete(
    mockSubprocess: MockExecaSubprocess,
    stdout: string,
    stderr: string,
    exitCode: number
): void {
    if (stdout) {
        mockSubprocess.stdout.emit('data', Buffer.from(stdout));
    }
    if (stderr) {
        mockSubprocess.stderr.emit('data', Buffer.from(stderr));
    }
    mockSubprocess._resolve({ exitCode });
}

/**
 * Run ONE command to completion through the mocked execa, and hand back what
 * execa was CALLED with.
 *
 * The arguments are where nearly every decision this class makes ends up — the
 * fnm wrapper around the command string, the shell, the enhanced PATH, the
 * timeout. A mock answers the same whatever it is handed, so a test reading only
 * the returned CommandResult cannot tell a correct call from a malformed one.
 *
 * It waits for execa to be called before completing the subprocess, because the
 * Adobe-CLI paths await two collaborators first: completing on the next tick
 * would emit stdout before the listener that collects it exists.
 */
export async function runThroughExeca(
    executor: CommandExecutor,
    mockExeca: jest.MockedFunction<typeof execa>,
    command: string,
    options: ExecuteOptions = {},
    completion: { stdout?: string; stderr?: string; exitCode?: number } = {},
): Promise<{
    result: CommandResult;
    subprocess: MockExecaSubprocess & ExecaChildProcess;
    execaCommand: string;
    execaOptions: ExecOptions;
}> {
    const subprocess = createMockExecaSubprocess();
    mockExeca.mockReturnValue(subprocess);

    const before = mockExeca.mock.calls.length;
    const promise = executor.execute(command, options);
    for (let i = 0; i < 50 && mockExeca.mock.calls.length === before; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    simulateSubprocessComplete(
        subprocess,
        completion.stdout ?? '',
        completion.stderr ?? '',
        completion.exitCode ?? 0,
    );

    const result = await promise;
    const call = mockExeca.mock.calls[mockExeca.mock.calls.length - 1];
    return {
        result,
        subprocess,
        execaCommand: call[0] as string,
        execaOptions: call[1] as ExecOptions,
    };
}

/**
 * Setup standard mock implementations for CommandExecutor dependencies.
 * Returns mocks that can be inspected in tests.
 */
/**
 * The CommandExecutor's machinery, as ONE fake object to hand to its constructor.
 *
 * CONVERTED 2026-08-28 (ADR-015). This used to intercept six modules and replace
 * their CLASS constructors, because CommandExecutor built its own collaborators
 * and a test had no other way past them. Every executor suite carried the same
 * six `jest.mock(...)` lines to make that work; they are gone.
 *
 * The behaviours are unchanged and now live in
 * `tests/helpers/commandExecutorDepsFake.ts` — notably the two pass-throughs
 * (resourceLocker.executeExclusive and retryManager.executeWithRetry), without
 * which every command silently does nothing.
 *
 * Pass `deps` to the constructor; read the accessors to assert on calls.
 */
export function setupMockDependencies() {
    const deps = createFakeCommandExecutorDeps();
    return {
        deps,
        mockResourceLocker: () => deps.resourceLocker as unknown as jest.Mocked<ResourceLocker>,
        mockRetryManager: () => deps.retryManager as unknown as jest.Mocked<RetryStrategyManager>,
        mockEnvironmentSetup: () => deps.environmentSetup as unknown as jest.Mocked<EnvironmentSetup>,
    };
}
