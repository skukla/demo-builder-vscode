import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number | null;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    duration?: number;
}

export class DebugLogger {
    private outputChannel: vscode.OutputChannel;
    private debugChannel: vscode.OutputChannel;
    private debugEnabled: boolean = true; // Can be controlled by settings later
    private logBuffer: string[] = []; // Track all main channel logs for persistence
    private debugBuffer: string[] = []; // Track all debug channel logs for persistence

    constructor(context: vscode.ExtensionContext) {
        // Main channel for user-facing messages
        this.outputChannel = vscode.window.createOutputChannel('Demo Builder: Logs');
        context.subscriptions.push(this.outputChannel);

        // Debug channel for detailed diagnostics
        this.debugChannel = vscode.window.createOutputChannel('Demo Builder: Debug');
        context.subscriptions.push(this.debugChannel);

        // Load debug setting if available
        const config = vscode.workspace.getConfiguration('demoBuilder');
        this.debugEnabled = config.get<boolean>('enableDebugLogging', true);
    }

    // User-facing messages (main channel)
    public info(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const logLine = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(logLine);
        this.logBuffer.push(logLine);
    }

    public warn(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const logLine = `[${timestamp}] ⚠️ ${message}`;
        this.outputChannel.appendLine(logLine);
        this.logBuffer.push(logLine);
    }

    public error(message: string, error?: Error): void {
        const timestamp = new Date().toLocaleTimeString();
        const logLine = `[${timestamp}] ❌ ${message}`;
        this.outputChannel.appendLine(logLine);
        this.logBuffer.push(logLine);
        if (error?.message) {
            const errorLine = `  Error: ${error.message}`;
            this.outputChannel.appendLine(errorLine);
            this.logBuffer.push(errorLine);
        }
        
        // Also log full error to debug channel
        if (error && this.debugEnabled) {
            this.debug('Full error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
    }

    // Debug messages (debug channel)
    public debug(message: string, data?: any): void {
        if (!this.debugEnabled) return;

        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] DEBUG: ${message}`;
        this.debugChannel.appendLine(logLine);
        this.debugBuffer.push(logLine);
        
        if (data !== undefined) {
            try {
                const formatted = JSON.stringify(data, null, 2);
                this.debugChannel.appendLine(formatted);
                this.debugBuffer.push(formatted);
            } catch {
                // If JSON.stringify fails, use toString
                const dataStr = String(data);
                this.debugChannel.appendLine(dataStr);
                this.debugBuffer.push(dataStr);
            }
        }
    }

    // Helper to append to debug channel and buffer
    private appendDebug(line: string): void {
        this.debugChannel.appendLine(line);
        this.debugBuffer.push(line);
    }

    // Command execution logging (debug channel)
    public logCommand(command: string, result: CommandResult, args?: string[]): void {
        if (!this.debugEnabled) return;

        const timestamp = new Date().toISOString();
        this.appendDebug(`\n${'='.repeat(80)}`);
        this.appendDebug(`[${timestamp}] COMMAND EXECUTION`);
        this.appendDebug(`${'='.repeat(80)}`);
        this.appendDebug(`Command: ${command}`);
        
        if (args && args.length > 0) {
            this.appendDebug(`Arguments: ${args.join(' ')}`);
        }
        
        if (result.cwd) {
            this.appendDebug(`Working Directory: ${result.cwd}`);
        }
        
        if (result.duration) {
            this.appendDebug(`Duration: ${result.duration}ms`);
            
            // Warn about slow commands
            if (result.duration > 3000) {
                const warningMsg = `⚠️ WARNING: Slow command detected - took ${result.duration}ms`;
                this.appendDebug(warningMsg);
                this.debug(warningMsg);
            }
        }
        
        this.appendDebug(`Exit Code: ${result.code ?? 'null'}`);
        
        if (result.stdout) {
            this.appendDebug('\n--- STDOUT ---');
            this.appendDebug(result.stdout);
        }
        
        if (result.stderr) {
            this.appendDebug('\n--- STDERR ---');
            this.appendDebug(result.stderr);
        }
        
        this.appendDebug(`${'='.repeat(80)}\n`);
    }

    // Log environment information
    public logEnvironment(label: string, env: NodeJS.ProcessEnv): void {
        if (!this.debugEnabled) return;

        this.debug(`Environment - ${label}`, {
            PATH: env.PATH?.split(':').join('\n  '),
            HOME: env.HOME,
            SHELL: env.SHELL,
            USER: env.USER,
            NODE_PATH: env.NODE_PATH,
            npm_config_prefix: env.npm_config_prefix
        });
    }

    // Show the output channel
    public show(preserveFocus: boolean = true): void {
        this.outputChannel.show(preserveFocus);
    }

    // Show the debug channel
    public showDebug(preserveFocus: boolean = true): void {
        this.debugChannel.show(preserveFocus);
    }

    // Clear channels
    public clear(): void {
        this.outputChannel.clear();
    }

    public clearDebug(): void {
        this.debugChannel.clear();
    }

    // Export debug log to file
    public async exportDebugLog(): Promise<string | undefined> {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('demo-builder-debug.log'),
            filters: {
                'Log files': ['log', 'txt']
            }
        });

        if (uri) {
            const content = (this.debugChannel as any)._content || 'No debug content available';
            await fs.writeFile(uri.fsPath, content);
            this.info(`Debug log exported to: ${uri.fsPath}`);
            return uri.fsPath;
        }
        
        return undefined;
    }

    /**
     * Save current logs to a file for persistence across Extension Host restarts
     */
    public async saveLogsToFile(filePath: string): Promise<void> {
        
        // Ensure directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        // Write main logs
        const content = this.logBuffer.join('\n');
        await fs.writeFile(filePath, content, 'utf8');
        
        // Write debug logs to separate file
        const debugFilePath = filePath.replace('.log', '-debug.log');
        const debugContent = this.debugBuffer.join('\n');
        await fs.writeFile(debugFilePath, debugContent, 'utf8');
        
        this.debug(`Saved ${this.logBuffer.length} main log lines and ${this.debugBuffer.length} debug log lines`);
    }

    /**
     * Replay logs from a file into the current log buffer and output channel
     */
    public async replayLogsFromFile(filePath: string): Promise<void> {
        
        try {
            // Replay main logs
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n').filter((line: string) => line.trim());
            
            for (const line of lines) {
                this.outputChannel.appendLine(line);
                this.logBuffer.push(line);
            }
            
            // Add separator after replayed logs
            this.outputChannel.appendLine('');
            this.outputChannel.appendLine('--- Extension reloaded, continuing from saved logs ---');
            this.outputChannel.appendLine('');
            this.logBuffer.push('');
            this.logBuffer.push('--- Extension reloaded, continuing from saved logs ---');
            this.logBuffer.push('');
            
            // Replay debug logs
            const debugFilePath = filePath.replace('.log', '-debug.log');
            try {
                const debugContent = await fs.readFile(debugFilePath, 'utf8');
                const debugLines = debugContent.split('\n').filter((line: string) => line.trim());
                
                for (const line of debugLines) {
                    this.debugChannel.appendLine(line);
                    this.debugBuffer.push(line);
                }
                
                // Add separator after replayed debug logs
                this.debugChannel.appendLine('');
                this.debugChannel.appendLine('--- Extension reloaded, continuing from saved logs ---');
                this.debugChannel.appendLine('');
                this.debugBuffer.push('');
                this.debugBuffer.push('--- Extension reloaded, continuing from saved logs ---');
                this.debugBuffer.push('');
                
                // Note: Don't log to debug channel here since we're still replaying
                // Clean up debug log file
                await fs.unlink(debugFilePath);
            } catch {
                // Debug log file might not exist, that's okay
            }
            
            // Now we can log the replay summary (after replay is complete)
            const timestamp = new Date().toISOString();
            const summaryLine = `[${timestamp}] DEBUG: Replayed ${lines.length} main logs and debug logs from session`;
            this.debugChannel.appendLine(summaryLine);
            this.debugBuffer.push(summaryLine);
            
            // Clean up main log file
            await fs.unlink(filePath);
        } catch (error) {
            // If file doesn't exist or can't be read, just log a debug message
            const timestamp = new Date().toISOString();
            const errorLine = `[${timestamp}] DEBUG: Could not replay logs from ${filePath}: ${error}`;
            this.debugChannel.appendLine(errorLine);
            this.debugBuffer.push(errorLine);
        }
    }

    /**
     * Get current log buffer content as a string
     */
    public getLogContent(): string {
        return this.logBuffer.join('\n');
    }

    // Dispose channels
    public dispose(): void {
        this.outputChannel.dispose();
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