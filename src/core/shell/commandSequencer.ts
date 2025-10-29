import { getLogger } from '@/shared/logging';
import type { CommandResult, CommandConfig } from './types';

/**
 * Manages sequential and parallel command execution
 * Provides orchestration for complex multi-command operations
 */
export class CommandSequencer {
    private logger = getLogger();

    /**
     * Execute multiple commands in sequence with proper error handling
     */
    async executeSequence(
        commands: CommandConfig[],
        executeCommand: (command: string, config: CommandConfig) => Promise<CommandResult>,
        stopOnError = true,
    ): Promise<CommandResult[]> {
        const results: CommandResult[] = [];

        for (const config of commands) {
            try {
                const result = await executeCommand(config.command, config);
                results.push(result);
            } catch (error) {
                if (stopOnError) {
                    throw error;
                }

                results.push({
                    stdout: '',
                    stderr: error instanceof Error ? error.message : 'Unknown error',
                    code: 1,
                    duration: 0,
                });
            }
        }

        return results;
    }

    /**
     * Execute multiple commands in parallel
     */
    async executeParallel(
        commands: CommandConfig[],
        executeCommand: (command: string, config: CommandConfig) => Promise<CommandResult>,
    ): Promise<CommandResult[]> {
        const startTime = Date.now();
        this.logger.debug(`[Command Sequencer] Executing ${commands.length} commands in parallel`);

        // Log all commands being executed
        commands.forEach((cmd, index) => {
            this.logger.debug(`[Command Sequencer]   [${index + 1}] ${cmd.name || cmd.command}`);
        });

        // Execute all commands simultaneously
        const promises = commands.map(async (config) => {
            const cmdStartTime = Date.now();
            try {
                const result = await executeCommand(config.command, config);
                const duration = Date.now() - cmdStartTime;

                // Log timing for each command
                this.logger.debug(`[Command Sequencer] Completed: ${config.name || config.command} (${duration}ms)`);

                // Warn if command is slow
                if (duration > 3000) {
                    this.logger.debug(`[Command Sequencer] WARNING: Slow command detected - ${config.name || config.command} took ${duration}ms`);
                }

                return result;
            } catch (error) {
                const duration = Date.now() - cmdStartTime;
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.debug(`[Command Sequencer] Failed: ${config.name || config.command} (${duration}ms) - ${errorMessage}`);

                // Return error result instead of throwing
                // This allows other commands to complete even if one fails
                const err = error as NodeJS.ErrnoException;
                return {
                    stdout: '',
                    stderr: (error instanceof Error ? error.message : String(error)) || `Command failed: ${config.command}`,
                    code: err.code ? (typeof err.code === 'number' ? err.code : 1) : 1,
                    duration,
                } as CommandResult;
            }
        });

        // Wait for all to complete
        const results = await Promise.all(promises);

        const totalDuration = Date.now() - startTime;
        this.logger.debug(`[Command Sequencer] All parallel commands completed in ${totalDuration}ms`);

        return results;
    }

    /**
     * Execute commands in batches with concurrency limit
     */
    async executeInBatches(
        commands: CommandConfig[],
        executeCommand: (command: string, config: CommandConfig) => Promise<CommandResult>,
        batchSize = 3,
    ): Promise<CommandResult[]> {
        const results: CommandResult[] = [];

        for (let i = 0; i < commands.length; i += batchSize) {
            const batch = commands.slice(i, i + batchSize);
            this.logger.debug(`[Command Sequencer] Executing batch ${Math.floor(i / batchSize) + 1} (${batch.length} commands)`);

            const batchResults = await this.executeParallel(batch, executeCommand);
            results.push(...batchResults);
        }

        return results;
    }
}
