/**
 * CommandQueue
 *
 * Sequential command execution queue with resource locking support.
 */

import type { CommandResult, CommandRequest } from './types';

export interface CommandQueueOptions {
    executeCommand: (command: string, options?: any) => Promise<CommandResult>;
    executeExclusive: <T>(resource: string, operation: () => Promise<T>) => Promise<T>;
}

/**
 * Queue for sequential command execution
 */
export class CommandQueue {
    private queue: CommandRequest[] = [];
    private isProcessing = false;
    private options: CommandQueueOptions;

    constructor(options: CommandQueueOptions) {
        this.options = options;
    }

    /**
     * Queue a command for execution
     * @param command - Command string to execute
     * @param commandOptions - Options for command execution
     * @param resourceLock - Optional resource to lock during execution
     * @returns Promise that resolves when command completes
     */
    queueCommand(
        command: string,
        commandOptions?: any,
        resourceLock?: string,
    ): Promise<CommandResult> {
        return new Promise((resolve, reject) => {
            this.queue.push({
                command,
                options: commandOptions,
                resolve,
                reject,
                resourceLock,
            });

            this.processQueue();
        });
    }

    /**
     * Process the command queue
     * Continues processing until queue is empty, handling commands added during processing
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        // Keep processing until queue is empty
        while (this.queue.length > 0) {
            // Process all currently queued commands
            const commands = [...this.queue];
            this.queue = [];

            for (const request of commands) {
                try {
                    let result: CommandResult;

                    if (request.resourceLock) {
                        result = await this.options.executeExclusive(request.resourceLock, () =>
                            this.options.executeCommand(request.command, request.options),
                        );
                    } else {
                        result = await this.options.executeCommand(request.command, request.options);
                    }

                    request.resolve(result);
                } catch (error) {
                    request.reject(error as Error);
                }
            }
        }

        this.isProcessing = false;
    }

    /**
     * Clear the queue and reject all pending commands
     * @param reason - Reason for clearing the queue
     */
    clear(reason: string = 'Queue cleared'): void {
        this.queue.forEach(req => {
            req.reject(new Error(reason));
        });
        this.queue = [];
    }

    /**
     * Get the number of pending commands
     */
    get pendingCount(): number {
        return this.queue.length;
    }

    /**
     * Check if the queue is currently processing
     */
    get processing(): boolean {
        return this.isProcessing;
    }
}
