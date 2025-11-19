import { CommandSequencer } from '@/core/shell/commandSequencer';
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { FileWatcher } from '@/core/shell/fileWatcher';
import { PollingService } from '@/core/shell/pollingService';
import { ResourceLocker } from '@/core/shell/resourceLocker';
import { RetryStrategyManager } from '@/core/shell/retryStrategyManager';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Creates a mock child process with all required EventEmitter capabilities
 */
export function createMockChildProcess(): ChildProcess {
    const mockChild = new EventEmitter() as any;
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.stdin = { write: jest.fn(), end: jest.fn() };
    mockChild.pid = 12345;
    // Use defineProperty for readonly properties
    Object.defineProperty(mockChild, 'killed', { value: false, writable: true });
    Object.defineProperty(mockChild, 'exitCode', { value: null, writable: true });
    mockChild.kill = jest.fn();
    return mockChild as ChildProcess;
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
