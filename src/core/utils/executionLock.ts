import { Mutex, MutexInterface, withTimeout } from 'async-mutex';

/**
 * Standardized execution lock for VS Code commands.
 *
 * Features:
 * - Prevents duplicate concurrent execution
 * - Optional timeout support
 * - Lock state visibility for debugging
 * - Automatic release on error
 *
 * @example
 * ```typescript
 * class MyCommand extends BaseCommand {
 *     private static lock = new ExecutionLock('MyCommand');
 *
 *     async execute(): Promise<void> {
 *         if (MyCommand.lock.isLocked()) {
 *             this.logger.debug('Already executing');
 *             return;
 *         }
 *
 *         await MyCommand.lock.run(async () => {
 *             // Protected work
 *         });
 *     }
 * }
 * ```
 */
export class ExecutionLock {
    private mutex: MutexInterface;
    private readonly name: string;

    constructor(name: string, options?: { timeoutMs?: number }) {
        this.name = name;

        const baseMutex = new Mutex();
        this.mutex = options?.timeoutMs
            ? withTimeout(baseMutex, options.timeoutMs)
            : baseMutex;
    }

    /**
     * Check if the lock is currently held.
     * Use this to decide whether to skip or queue.
     */
    isLocked(): boolean {
        return this.mutex.isLocked();
    }

    /**
     * Run an operation with exclusive access.
     * The lock is automatically released when the operation completes or throws.
     */
    async run<T>(operation: () => Promise<T>): Promise<T> {
        return this.mutex.runExclusive(operation);
    }

    /**
     * Acquire the lock manually. Returns a release function.
     * Use when you need more control than run() provides.
     *
     * @example
     * ```typescript
     * const release = await lock.acquire();
     * try {
     *     await step1();
     *     await step2();
     * } finally {
     *     release();
     * }
     * ```
     */
    async acquire(): Promise<() => void> {
        return this.mutex.acquire();
    }

    /**
     * Get the lock name for debugging.
     */
    getName(): string {
        return this.name;
    }
}
