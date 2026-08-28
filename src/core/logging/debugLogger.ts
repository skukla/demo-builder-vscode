import { promises as fs } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { currentCallTag } from './callTagContext';
import type { CommandResult } from '@/core/shell/types';
import { slowCommandThreshold } from '@/core/utils/timeoutConfig';
import { sanitizeErrorForLogging } from '@/core/validation';

/**
 * Extended CommandResult with additional context for logging
 * Extends the canonical CommandResult from command-execution module
 */
export interface CommandResultWithContext extends CommandResult {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}

/**
 * DebugLogger - Dual-channel logging using VS Code's LogOutputChannel API (v1.84+)
 *
 * Architecture:
 * - "Demo Builder: User Logs" - Clean, user-friendly messages (subset)
 * - "Demo Builder: Debug Logs" - Complete technical record (superset)
 *
 * Channel Routing:
 * - info(), warn(), error() → BOTH channels (user sees clean output, support sees everything)
 * - debug(), trace(), logCommand() → Debug Logs only (technical details)
 *
 * Implementation Note:
 * Both channels are LogOutputChannel for consistent VS Code formatting (timestamps, colors).
 * Since VS Code's log level filtering defaults to Info and isn't persisted across sessions,
 * we "promote" debug/trace messages to info() calls with a [debug]/[trace] prefix.
 * This ensures all messages are always visible in the Debug channel without user intervention.
 */
/** Log level hierarchy (lower number = less verbose) */
type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
};

export class DebugLogger {
    private logsChannel: vscode.LogOutputChannel;   // User-facing messages
    private debugChannel: vscode.LogOutputChannel;  // Technical diagnostics (complete record)
    private logBuffer: string[] = []; // Track info/warn/error for export (not debug/trace)
    private static readonly MAX_BUFFER_SIZE = 10000; // Cap at 10K entries to prevent unbounded growth

    constructor(context: vscode.ExtensionContext) {
        // Both channels use LogOutputChannel for consistent VS Code formatting
        this.logsChannel = vscode.window.createOutputChannel('Demo Builder: User Logs', { log: true });
        this.debugChannel = vscode.window.createOutputChannel('Demo Builder: Debug Logs', { log: true });

        context.subscriptions.push(this.logsChannel);
        context.subscriptions.push(this.debugChannel);

        // Initialize both channels
        this.logsChannel.info('Demo Builder initialized');
        this.debugChannel.info(this.tagged('Demo Builder initialized - Debug Logs channel ready'));
    }

    /**
     * Stamp the ambient agent-call tag into a DEBUG-channel line (AI-2d).
     *
     * The tag goes inside the SUBSYSTEM bracket — `[Guards #47]` — because
     * that bracket is the eye's scanning anchor and the owner's design rule
     * is that prefixes stay human-readable. Level prefixes (`[debug]`,
     * `[trace]`) are skipped, not tagged. A line with no bracket gets a
     * minimal `[#47]` lead. Outside any agent call, every line is returned
     * byte-identical — user-caused work looks exactly as it always has,
     * which is also what makes agent-caused work visually distinct.
     *
     * User Logs NEVER pass through here — the headline stream stays clean.
     */
    private tagged(text: string): string {
        const tag = currentCallTag();
        if (tag === undefined) return text;
        const m = /^(\[(?:debug|trace)\] )?\[([^\]#]+)\]/.exec(text);
        if (m) {
            const level = m[1] ?? '';
            return `${level}[${m[2]} #${tag}]${text.slice(m[0].length)}`;
        }
        const lvl = /^(\[(?:debug|trace)\] )/.exec(text);
        if (lvl) return `${lvl[1]}[#${tag}] ${text.slice(lvl[1].length)}`;
        return `[#${tag}] ${text}`;
    }

    /**
     * Check if a message at the given level should be logged based on configuration
     * @param level The log level to check
     * @returns true if the message should be logged
     */
    private shouldLog(level: LogLevel): boolean {
        const config = vscode.workspace.getConfiguration('demoBuilder');
        const rawLevel = config.get<string>('logLevel');
        // Validate configured level is valid, default to 'debug' if not
        const configuredLevel: LogLevel = (rawLevel && rawLevel in LOG_LEVEL_PRIORITY)
            ? rawLevel as LogLevel
            : 'debug';
        return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[configuredLevel];
    }

    /**
     * Log informational message → BOTH channels
     * User Logs: Clean message for end users
     * Debug Logs: Same message (part of complete record)
     */
    public info(message: string): void {
        this.logsChannel.info(message);
        this.debugChannel.info(this.tagged(message));
        this.addToBuffer(`[INFO] ${message}`);
    }

    /**
     * Log warning message → BOTH channels
     * User Logs: Clean warning for end users
     * Debug Logs: Same warning (part of complete record)
     */
    public warn(message: string): void {
        this.logsChannel.warn(message);
        this.debugChannel.warn(this.tagged(message));
        this.addToBuffer(`[WARN] ${message}`);
    }

    /**
     * Log error message → BOTH channels
     * User Logs: Clean error message for end users
     * Debug Logs: Error message + technical details (stack trace, etc.)
     */
    public error(message: string, error?: Error): void {
        this.logsChannel.error(message);
        this.debugChannel.error(this.tagged(message));
        this.addToBuffer(`[ERROR] ${message}`);

        // SECURITY: Sanitize error message for user-facing logs
        if (error?.message) {
            const sanitizedMessage = sanitizeErrorForLogging(error);
            this.logsChannel.error(`  Error: ${sanitizedMessage}`);
            this.debugChannel.error(this.tagged(`  Error: ${sanitizedMessage}`));
            this.addToBuffer(`  Error: ${sanitizedMessage}`);
        }

        // Log verbose error details at trace level (reduces noise, available for deep debugging)
        if (error?.stack && this.shouldLog('trace')) {
            this.debugChannel.info(this.tagged(`[trace] Error stack: ${error.name}: ${error.stack.split('\n').slice(0, 5).join('\n')}`));
        }
    }

    /**
     * Log debug message (detailed diagnostics → Debug channel only)
     * Not included in export buffer for privacy
     * Uses info() with [debug] prefix to bypass VS Code's log level filtering
     * Respects demoBuilder.logLevel configuration setting
     */
    public debug(message: string, data?: unknown): void {
        if (!this.shouldLog('debug')) return;

        // Promote to info() with prefix to ensure visibility at default log level
        this.debugChannel.info(this.tagged(`[debug] ${message}`));

        if (data !== undefined) {
            try {
                const formatted = JSON.stringify(data, null, 2);
                this.debugChannel.info(this.tagged(`[debug] ${formatted}`));
            } catch {
                // If JSON.stringify fails (e.g., circular reference), use toString
                this.debugChannel.info(this.tagged(`[debug] ${String(data)}`));
            }
        }
    }

    /**
     * Log trace message (most verbose level → Debug channel only)
     * Not included in export buffer
     * Uses info() with [trace] prefix to bypass VS Code's log level filtering
     * Respects demoBuilder.logLevel configuration setting
     * SECURITY: Sanitizes data to redact API keys, tokens, and sensitive values
     */
    public trace(message: string, data?: unknown): void {
        if (!this.shouldLog('trace')) return;

        // Promote to info() with prefix to ensure visibility at default log level
        this.debugChannel.info(this.tagged(`[trace] ${message}`));

        if (data !== undefined) {
            try {
                const formatted = JSON.stringify(data, null, 2);
                // SECURITY: Sanitize to redact API keys, tokens, secrets
                const sanitized = sanitizeErrorForLogging(formatted);
                this.debugChannel.info(this.tagged(`[trace] ${sanitized}`));
            } catch {
                this.debugChannel.info(this.tagged(`[trace] ${String(data)}`));
            }
        }
    }

    /**
     * Add entry to log buffer with size cap
     * Uses LRU-style eviction (removes oldest entries when limit reached)
     */
    private addToBuffer(entry: string): void {
        this.logBuffer.push(entry);
        // Evict oldest entries if buffer exceeds limit
        if (this.logBuffer.length > DebugLogger.MAX_BUFFER_SIZE) {
            // Remove oldest 10% when limit reached (batch eviction for efficiency)
            const evictCount = Math.floor(DebugLogger.MAX_BUFFER_SIZE * 0.1);
            this.logBuffer.splice(0, evictCount);
        }
    }

    /**
     * Log command execution (for diagnostics → Debug channel)
     * Uses info() with prefixes to bypass VS Code's log level filtering
     * Respects demoBuilder.logLevel configuration setting
     */
    public logCommand(command: string, result: CommandResultWithContext, args?: string[]): void {
        if (!this.shouldLog('debug')) return;

        this.debugChannel.info(this.tagged(`[debug] ${'='.repeat(60)}`));
        this.debugChannel.info(this.tagged(`[debug] COMMAND EXECUTION: ${command}`));

        if (args && args.length > 0) {
            this.debugChannel.info(this.tagged(`[debug] Arguments: ${args.join(' ')}`));
        }

        if (result.cwd) {
            this.debugChannel.info(this.tagged(`[debug] Working Directory: ${result.cwd}`));
        }

        if (result.duration) {
            this.debugChannel.info(this.tagged(`[debug] Duration: ${result.duration}ms`));

            // Warn about slow commands - goes to Logs channel for visibility.
            // The threshold is per-tool: `aio` carries a ~1.7s startup floor that
            // no caller can avoid, so the generic 3s bar flagged healthy aio work
            // and taught the reader to ignore the warning (live 2026-08-08:
            // "aio config get ims.contexts.cli took 3927ms" on a cold start).
            if (result.duration > slowCommandThreshold(command)) {
                this.logsChannel.warn(`Slow command detected - ${command} took ${result.duration}ms`);
            }
        }

        this.debugChannel.info(this.tagged(`[debug] Exit Code: ${result.code ?? 'null'}`));

        // Log stdout/stderr at trace level to reduce noise
        if (this.shouldLog('trace')) {
            if (result.stdout) {
                this.debugChannel.info(this.tagged('[trace] --- STDOUT ---'));
                this.debugChannel.info(this.tagged(`[trace] ${result.stdout}`));
            }

            if (result.stderr) {
                this.debugChannel.info(this.tagged('[trace] --- STDERR ---'));
                this.debugChannel.info(this.tagged(`[trace] ${result.stderr}`));
            }
        }

        this.debugChannel.info(this.tagged(`[debug] ${'='.repeat(60)}`));
    }

    /**
     * Log environment information (→ Debug channel)
     * Uses info() with prefix to bypass VS Code's log level filtering
     * Respects demoBuilder.logLevel configuration setting
     */
    public logEnvironment(label: string, env: NodeJS.ProcessEnv): void {
        if (!this.shouldLog('debug')) return;

        this.debugChannel.info(this.tagged(`[debug] Environment - ${label}`));
        this.debugChannel.info('[debug] ' + JSON.stringify({
            PATH: env.PATH?.split(':').join('\n  '),
            HOME: env.HOME,
            SHELL: env.SHELL,
            USER: env.USER,
            NODE_PATH: env.NODE_PATH,
            npm_config_prefix: env.npm_config_prefix,
        }, null, 2));
    }

    /**
     * Show the Logs output channel (user-facing)
     */
    public show(preserveFocus = true): void {
        this.logsChannel.show(preserveFocus);
    }

    /**
     * Show the Debug output channel (technical diagnostics)
     */
    public showDebug(preserveFocus = true): void {
        this.debugChannel.show(preserveFocus);
    }

    /**
     * Hide the Logs output channel
     */
    public hide(): void {
        this.logsChannel.hide();
    }

    /**
     * Hide the Debug output channel
     */
    public hideDebug(): void {
        this.debugChannel.hide();
    }

    /**
     * Clear the Logs output channel
     */
    public clear(): void {
        this.logsChannel.clear();
    }

    /**
     * Clear the Debug output channel
     */
    public clearDebug(): void {
        this.debugChannel.clear();
    }

    /**
     * Export log to file
     */
    public async exportDebugLog(): Promise<string | undefined> {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('demo-builder.log'),
            filters: {
                'Log files': ['log', 'txt'],
            },
        });

        if (uri) {
            const content = this.logBuffer.length > 0
                ? this.logBuffer.join('\n')
                : 'No log content available';
            await fs.writeFile(uri.fsPath, content);
            this.info(`Log exported to: ${uri.fsPath}`);
            return uri.fsPath;
        }

        return undefined;
    }

    /**
     * Save current logs to a file for persistence across Extension Host restarts
     */
    public async saveLogsToFile(filePath: string): Promise<void> {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        const content = this.logBuffer.join('\n');
        await fs.writeFile(filePath, content, 'utf8');

        this.debug(`Saved ${this.logBuffer.length} log lines to ${filePath}`);
    }

    /**
     * Replay logs from a file into the current log buffer and Logs channel
     * SECURITY: Validates file path before reading to prevent path traversal
     */
    public async replayLogsFromFile(filePath: string): Promise<void> {
        try {
            // SECURITY: Validate path is within expected directory (~/.demo-builder/)
            const normalizedPath = path.normalize(filePath);
            const expectedDir = path.join(process.env.HOME || '', '.demo-builder');
            if (!normalizedPath.startsWith(expectedDir)) {
                this.debug(`Rejecting replay from untrusted path: ${filePath}`);
                return;
            }

            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n').filter((line: string) => line.trim());

            for (const line of lines) {
                this.logsChannel.info(line);
                this.addToBuffer(line);
            }

            this.logsChannel.info('');
            this.logsChannel.info('--- Extension reloaded, continuing from saved logs ---');
            this.logsChannel.info('');

            this.debug(`Replayed ${lines.length} logs from session`);

            // Clean up log file
            await fs.unlink(filePath);
        } catch (error) {
            this.debug(`Could not replay logs from ${filePath}: ${error}`);
        }
    }

    /**
     * Get current log buffer content as a string
     */
    public getLogContent(): string {
        return this.logBuffer.join('\n');
    }

    /**
     * Dispose both channels
     */
    public dispose(): void {
        this.logsChannel.dispose();
        this.debugChannel.dispose();
    }
}

// Singleton instance
let loggerInstance: DebugLogger | undefined;

export function initializeLogger(context: vscode.ExtensionContext): DebugLogger {
    if (!loggerInstance) {
        loggerInstance = new DebugLogger(context);
    }
    return loggerInstance;
}

export function getLogger(): DebugLogger {
    if (!loggerInstance) {
        throw new Error('Logger not initialized. Call initializeLogger first.');
    }
    return loggerInstance;
}

/**
 * Reset logger instance (for testing purposes only)
 */
export function _resetLoggerForTesting(): void {
    loggerInstance = undefined;
}
