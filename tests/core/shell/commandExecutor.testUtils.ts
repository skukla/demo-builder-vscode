import { CommandSequencer } from '@/core/shell/commandSequencer';
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { FileWatcher } from '@/core/shell/fileWatcher';
import { PollingService } from '@/core/shell/pollingService';
import { ResourceLocker } from '@/core/shell/resourceLocker';
import { RetryStrategyManager } from '@/core/shell/retryStrategyManager';
import { EventEmitter } from 'events';

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
export function setupMockDependencies() {
    let mockResourceLocker: jest.Mocked<ResourceLocker>;
    let mockRetryManager: jest.Mocked<RetryStrategyManager>;
    let mockEnvironmentSetup: jest.Mocked<EnvironmentSetup>;

    // Mock resource locker constructor
    (ResourceLocker as jest.MockedClass<typeof ResourceLocker>).mockImplementation(() => {
        const mock = {
            executeExclusive: jest.fn(<T>(resource: string, operation: () => Promise<T>) => operation()) as any,
            clearAllLocks: jest.fn()
        } as any;
        mockResourceLocker = mock;
        return mock;
    });

    // Mock retry manager constructor
    (RetryStrategyManager as jest.MockedClass<typeof RetryStrategyManager>).mockImplementation(() => {
        const mock = {
            executeWithRetry: jest.fn((executeFn: () => Promise<any>) => executeFn()) as any,
            getDefaultStrategy: jest.fn(() => ({
                maxAttempts: 1,
                initialDelay: 1000,
                maxDelay: 5000,
                backoffFactor: 2
            })),
            getStrategy: jest.fn((_name: string) => ({
                maxAttempts: 2,
                initialDelay: 1000,
                maxDelay: 5000,
                backoffFactor: 1.5
            }))
        } as any;
        mockRetryManager = mock;
        return mock;
    });

    // Mock environment setup constructor
    (EnvironmentSetup as jest.MockedClass<typeof EnvironmentSetup>).mockImplementation(() => {
        const mock = {
            findAdobeCLINodeVersion: jest.fn().mockResolvedValue('18'),
            findFnmPath: jest.fn().mockReturnValue('/usr/local/bin/fnm'),
            findNpmGlobalPaths: jest.fn().mockReturnValue(['/usr/local/lib/node_modules/.bin']),
            ensureAdobeCLIConfigured: jest.fn().mockResolvedValue(undefined),
            ensureAdobeCLINodeVersion: jest.fn().mockResolvedValue(undefined),
            resetSession: jest.fn()
        } as any;
        mockEnvironmentSetup = mock;
        return mock;
    });

    // Mock other constructors with minimal implementation
    (FileWatcher as jest.MockedClass<typeof FileWatcher>).mockImplementation(() => ({
        disposeAll: jest.fn(),
        waitForFileSystem: jest.fn()
    } as any));

    (CommandSequencer as jest.MockedClass<typeof CommandSequencer>).mockImplementation(() => ({
        executeSequence: jest.fn(),
        executeParallel: jest.fn()
    } as any));

    (PollingService as jest.MockedClass<typeof PollingService>).mockImplementation(() => ({
        pollUntilCondition: jest.fn()
    } as any));

    return {
        mockResourceLocker: () => mockResourceLocker,
        mockRetryManager: () => mockRetryManager,
        mockEnvironmentSetup: () => mockEnvironmentSetup
    };
}
