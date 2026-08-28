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
export function createMockExecaSubprocess(): MockExecaSubprocess {
    const emitter = new EventEmitter();

    let resolvePromise: (result: MockExecaResult) => void;
    let rejectPromise: (error: Error) => void;

    const completionPromise = new Promise<MockExecaResult>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

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

    // Control methods for tests
    mockSubprocess._resolve = (result: MockExecaResult) => {
        mockSubprocess.exitCode = result.exitCode;
        resolvePromise!(result);
    };
    mockSubprocess._reject = (error: Error) => rejectPromise!(error);

    return mockSubprocess;
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
