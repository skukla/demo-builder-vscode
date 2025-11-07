import { getLogger, DebugLogger } from './debugLogger';

/**
 * Logger class that wraps the DebugLogger for backward compatibility
 * All logging goes through the unified DebugLogger system
 */
export class Logger {
    private name: string;
    private debugLogger: DebugLogger | undefined;

    constructor(name: string) {
        this.name = name;
        // Use the singleton DebugLogger instance
        try {
            this.debugLogger = getLogger();
        } catch {
            // DebugLogger might not be initialized yet during some tests
            // In that case, methods will be no-ops
        }
    }

    public setOutputChannel(_channel: unknown): void {
        // No-op for backward compatibility
        // DebugLogger manages its own channels
    }

    public error(message: string, error?: Error): void {
        if (!this.debugLogger) return;

        // Log to main channel
        this.debugLogger.error(message, error);
    }

    public warn(message: string, ...args: unknown[]): void {
        if (!this.debugLogger) return;

        // Log to main channel
        this.debugLogger.warn(message);

        // Log additional args to debug channel if present
        if (args.length > 0) {
            this.debugLogger.debug(`Warning details for: ${message}`, args);
        }
    }

    public info(message: string, ...args: unknown[]): void {
        if (!this.debugLogger) return;

        // Log to main channel
        this.debugLogger.info(message);

        // Log additional args to debug channel if present
        if (args.length > 0) {
            this.debugLogger.debug(`Info details for: ${message}`, args);
        }
    }

    public debug(message: string, ...args: unknown[]): void {
        if (!this.debugLogger) return;

        // Debug messages go to debug channel
        this.debugLogger.debug(message, args.length > 0 ? args : undefined);
    }
}