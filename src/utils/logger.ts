import * as vscode from 'vscode';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export class Logger {
    private outputChannel: vscode.OutputChannel | undefined;
    private name: string;
    private logLevel: LogLevel;

    constructor(name: string) {
        this.name = name;
        this.logLevel = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<LogLevel>('logLevel', 'info');
    }

    public setOutputChannel(channel: vscode.OutputChannel): void {
        this.outputChannel = channel;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
        const currentIndex = levels.indexOf(this.logLevel);
        const messageIndex = levels.indexOf(level);
        return messageIndex <= currentIndex;
    }

    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    private log(level: LogLevel, message: string, ...args: any[]): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message);
        
        // Log to console
        console.log(formattedMessage, ...args);
        
        // Log to output channel if available
        if (this.outputChannel) {
            this.outputChannel.appendLine(formattedMessage);
            if (args.length > 0) {
                args.forEach(arg => {
                    if (typeof arg === 'object') {
                        this.outputChannel!.appendLine(JSON.stringify(arg, null, 2));
                    } else {
                        this.outputChannel!.appendLine(String(arg));
                    }
                });
            }
        }
    }

    public error(message: string, error?: Error): void {
        this.log('error', message);
        if (error) {
            this.log('error', `Error details: ${error.message}`);
            if (error.stack && this.shouldLog('debug')) {
                this.log('debug', `Stack trace: ${error.stack}`);
            }
        }
    }

    public warn(message: string, ...args: any[]): void {
        this.log('warn', message, ...args);
    }

    public info(message: string, ...args: any[]): void {
        this.log('info', message, ...args);
    }

    public debug(message: string, ...args: any[]): void {
        this.log('debug', message, ...args);
    }
}