import { getLogger } from '../debugLogger';
import { RateLimiter } from './rateLimiter';
import type { RetryStrategy, CommandResult } from './types';

/**
 * Manages retry strategies for failed commands
 * Provides predefined strategies and custom retry logic
 *
 * SECURITY: Rate limiting prevents resource exhaustion attacks
 */
export class RetryStrategyManager {
    private logger = getLogger();
    private strategies = new Map<string, RetryStrategy>();
    private rateLimiter = new RateLimiter(10); // 10 ops/sec default

    constructor() {
        this.setupDefaultStrategies();
    }

    /**
     * Set up default retry strategies
     */
    private setupDefaultStrategies(): void {
        // Network-related commands
        this.strategies.set('network', {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 5000,
            backoffFactor: 2,
            shouldRetry: (error) => {
                const message = error.message.toLowerCase();
                return message.includes('network') ||
                       message.includes('timeout') ||
                       message.includes('econnrefused');
            },
        });

        // File system operations
        this.strategies.set('filesystem', {
            maxAttempts: 3,
            initialDelay: 200,
            maxDelay: 1000,
            backoffFactor: 1.5,
            shouldRetry: (error) => {
                const message = error.message.toLowerCase();
                return message.includes('ebusy') ||
                       message.includes('eacces') ||
                       message.includes('locked');
            },
        });

        // Adobe CLI operations
        this.strategies.set('adobe-cli', {
            maxAttempts: 2,
            initialDelay: 1000,
            maxDelay: 5000,
            backoffFactor: 1.5,
            shouldRetry: (error, attempt) => {
                const message = error.message.toLowerCase();

                /**
                 * KNOWN WORKAROUND: Shell syntax check
                 *
                 * Adobe CLI sometimes includes shell redirection syntax in error messages
                 * (e.g., "> /dev/null", "2>&1", "--log-level"). When these appear in error
                 * messages, it indicates a command formatting issue rather than a transient
                 * failure, so retrying won't help.
                 *
                 * This check prevents unnecessary retry attempts for shell syntax errors,
                 * improving error reporting speed and clarity for developers.
                 *
                 * Acceptable as-is: This is a pragmatic workaround for Adobe CLI's error
                 * message format. Alternative solutions (parsing stderr separately, custom
                 * error types) would add significant complexity for minimal benefit.
                 */
                if (message.includes('> /dev/null') || message.includes('2>&1') ||
                    message.includes('--log-level')) {
                    return false;
                }

                return attempt === 1 && (
                    message.includes('token') ||
                    message.includes('unauthorized') ||
                    message.includes('session') ||
                    message.includes('timeout')
                );
            },
        });
    }

    /**
     * Get a retry strategy by name
     */
    getStrategy(name: string): RetryStrategy | undefined {
        return this.strategies.get(name);
    }

    /**
     * Get default retry strategy
     */
    getDefaultStrategy(): RetryStrategy {
        return {
            maxAttempts: 1,
            initialDelay: 1000,
            maxDelay: 5000,
            backoffFactor: 2,
        };
    }

    /**
     * Register a custom retry strategy
     */
    registerStrategy(name: string, strategy: RetryStrategy): void {
        this.strategies.set(name, strategy);
        this.logger.debug(`[Retry Strategy] Registered strategy: ${name}`);
    }

    /**
     * Execute command with retry logic
     */
    async executeWithRetry(
        executeFn: () => Promise<CommandResult>,
        strategy: RetryStrategy,
        commandDescription: string,
    ): Promise<CommandResult> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
            const startTime = Date.now();

            // SECURITY: Rate limit check to prevent resource exhaustion
            if (attempt > 1) {
                await this.rateLimiter.checkRateLimit(`retry:${commandDescription}`);
            }

            try {
                // Only log retry attempts (not first attempt)
                if (attempt > 1) {
                    this.logger.debug(`[Retry Strategy] Retry attempt ${attempt}/${strategy.maxAttempts}: ${commandDescription}`);
                }

                const result = await executeFn();

                const duration = Date.now() - startTime;
                // Only log if retried or took > 5 seconds
                if (attempt > 1 || duration > 5000) {
                    this.logger.debug(`[Retry Strategy] Command succeeded after ${duration}ms (attempt ${attempt}/${strategy.maxAttempts})`);
                }

                return result;
            } catch (error) {
                lastError = error as Error;
                const duration = Date.now() - startTime;

                // Enhanced error logging
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.debug(`[Retry Strategy] Command failed (attempt ${attempt}/${strategy.maxAttempts}) after ${duration}ms:`);
                this.logger.debug(`  Command: ${commandDescription}`);
                this.logger.debug(`  Error: ${errorMessage}`);

                // Don't retry on timeout errors
                const isTimeout = errorMessage.toLowerCase().includes('timed out');
                if (isTimeout) {
                    this.logger.warn('[Retry Strategy] Command timed out - not retrying');
                    throw error;
                }

                // Check if we should retry
                if (attempt < strategy.maxAttempts) {
                    if (strategy.shouldRetry && !strategy.shouldRetry(lastError, attempt)) {
                        this.logger.debug('[Retry Strategy] shouldRetry returned false - not retrying');
                        throw error;
                    }

                    // Calculate delay with exponential backoff
                    const delay = Math.min(
                        strategy.initialDelay * Math.pow(strategy.backoffFactor, attempt - 1),
                        strategy.maxDelay,
                    );

                    this.logger.debug(`[Retry Strategy] Retrying in ${delay}ms...`);
                    await this.delay(delay);
                } else {
                    this.logger.warn(`[Retry Strategy] All ${strategy.maxAttempts} attempts exhausted`);
                    throw error;
                }
            }
        }

        throw lastError || new Error('Command failed after retries');
    }

    /**
     * Delay for specified milliseconds
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
