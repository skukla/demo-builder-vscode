import { getLogger } from '../debugLogger';

/**
 * Manages mutual exclusion for command execution
 * Ensures only one operation accessing a resource runs at a time
 */
export class ResourceLocker {
    private locks = new Map<string, Promise<void>>();
    private logger = getLogger();

    /**
     * Execute operation with exclusive access to a resource
     * This ensures only one command accessing a resource runs at a time
     */
    async executeExclusive<T>(resource: string, operation: () => Promise<T>): Promise<T> {
        this.logger.debug(`[Resource Locker] Acquiring lock for resource: ${resource}`);

        // Get or create lock promise for this resource
        const currentLock = this.locks.get(resource) || Promise.resolve();

        // Create new lock that waits for current lock then executes operation
        let releaseLock: () => void;
        const newLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        // Chain our operation after current lock
        const resultPromise = currentLock
            .then(() => {
                this.logger.debug(`[Resource Locker] Lock acquired for resource: ${resource}`);
                return operation();
            })
            .finally(() => {
                this.logger.debug(`[Resource Locker] Releasing lock for resource: ${resource}`);
                releaseLock!();
            });

        // Update the lock for this resource
        this.locks.set(resource, newLock);

        return resultPromise;
    }

    /**
     * Check if a resource is currently locked
     */
    isLocked(resource: string): boolean {
        return this.locks.has(resource);
    }

    /**
     * Clear all locks (use with caution)
     */
    clearAllLocks(): void {
        this.locks.clear();
        this.logger.debug('[Resource Locker] Cleared all locks');
    }

    /**
     * Get count of active locks
     */
    getActiveLockCount(): number {
        return this.locks.size;
    }
}
