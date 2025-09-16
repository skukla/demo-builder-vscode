import * as vscode from 'vscode';

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
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    public warn(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ⚠️ ${message}`);
    }

    public error(message: string, error?: Error): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ❌ ${message}`);
        if (error?.message) {
            this.outputChannel.appendLine(`  Error: ${error.message}`);
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
        this.debugChannel.appendLine(`[${timestamp}] DEBUG: ${message}`);
        
        if (data !== undefined) {
            try {
                const formatted = JSON.stringify(data, null, 2);
                this.debugChannel.appendLine(formatted);
            } catch {
                // If JSON.stringify fails, use toString
                this.debugChannel.appendLine(String(data));
            }
        }
    }

    // Command execution logging (debug channel)
    public logCommand(command: string, result: CommandResult, args?: string[]): void {
        if (!this.debugEnabled) return;

        const timestamp = new Date().toISOString();
        this.debugChannel.appendLine(`\n${'='.repeat(80)}`);
        this.debugChannel.appendLine(`[${timestamp}] COMMAND EXECUTION`);
        this.debugChannel.appendLine(`${'='.repeat(80)}`);
        this.debugChannel.appendLine(`Command: ${command}`);
        
        if (args && args.length > 0) {
            this.debugChannel.appendLine(`Arguments: ${args.join(' ')}`);
        }
        
        if (result.cwd) {
            this.debugChannel.appendLine(`Working Directory: ${result.cwd}`);
        }
        
        if (result.duration) {
            this.debugChannel.appendLine(`Duration: ${result.duration}ms`);
            
            // Warn about slow commands
            if (result.duration > 3000) {
                const warningMsg = `⚠️ WARNING: Slow command detected - took ${result.duration}ms`;
                this.debugChannel.appendLine(warningMsg);
                this.debug(warningMsg);
            }
        }
        
        this.debugChannel.appendLine(`Exit Code: ${result.code ?? 'null'}`);
        
        if (result.stdout) {
            this.debugChannel.appendLine(`\n--- STDOUT ---`);
            this.debugChannel.appendLine(result.stdout);
        }
        
        if (result.stderr) {
            this.debugChannel.appendLine(`\n--- STDERR ---`);
            this.debugChannel.appendLine(result.stderr);
        }
        
        this.debugChannel.appendLine(`${'='.repeat(80)}\n`);
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
            const fs = require('fs').promises;
            await fs.writeFile(uri.fsPath, content);
            this.info(`Debug log exported to: ${uri.fsPath}`);
            return uri.fsPath;
        }
        
        return undefined;
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