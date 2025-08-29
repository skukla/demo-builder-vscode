import * as vscode from 'vscode';

export class ErrorLogger {
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private diagnostics: vscode.DiagnosticCollection;
    private errorCount = 0;
    private warningCount = 0;
    
    constructor(context: vscode.ExtensionContext) {
        // Create output channel for detailed logs
        this.outputChannel = vscode.window.createOutputChannel('Demo Builder Logs');
        
        // Create status bar item for quick error/warning indicator
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'demoBuilder.showLogs';
        context.subscriptions.push(this.statusBarItem);
        
        // Create diagnostic collection for Problems panel
        this.diagnostics = vscode.languages.createDiagnosticCollection('demo-builder');
        context.subscriptions.push(this.diagnostics);
        
        // Register command to show logs
        const showLogsCommand = vscode.commands.registerCommand('demoBuilder.showLogs', () => {
            this.show();
        });
        context.subscriptions.push(showLogsCommand);
    }
    
    /**
     * Log an informational message
     */
    logInfo(message: string, context?: string): void {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` [${context}]` : '';
        this.outputChannel.appendLine(`[${timestamp}] INFO${contextStr}: ${message}`);
    }
    
    /**
     * Log a warning message
     */
    logWarning(message: string, context?: string): void {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` [${context}]` : '';
        this.outputChannel.appendLine(`[${timestamp}] WARNING${contextStr}: ${message}`);
        
        this.warningCount++;
        this.updateStatusBar();
    }
    
    /**
     * Log an error message with optional detailed information
     */
    logError(error: Error | string, context?: string, critical: boolean = false, details?: string): void {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` [${context}]` : '';
        const errorMessage = error instanceof Error ? error.message : error;
        const stackTrace = error instanceof Error ? error.stack : '';
        
        // Log to output channel
        this.outputChannel.appendLine(`[${timestamp}] ERROR${contextStr}: ${errorMessage}`);
        
        // Add detailed error information if provided
        if (details) {
            this.outputChannel.appendLine(`  ╔══════════════════════════════════════════════╗`);
            this.outputChannel.appendLine(`  ║ Error Details                                ║`);
            this.outputChannel.appendLine(`  ╚══════════════════════════════════════════════╝`);
            details.split('\n').forEach(line => {
                this.outputChannel.appendLine(`  │ ${line}`);
            });
            this.outputChannel.appendLine(`  └──────────────────────────────────────────────`);
        }
        
        if (stackTrace) {
            this.outputChannel.appendLine(`  Stack Trace:`);
            stackTrace.split('\n').slice(1).forEach(line => {
                this.outputChannel.appendLine(`    ${line}`);
            });
        }
        this.outputChannel.appendLine(''); // Empty line for readability
        
        // Update counts and status bar
        this.errorCount++;
        this.updateStatusBar();
        
        // For critical errors, add to Problems panel and show notification
        if (critical) {
            this.addToProblemPanel(errorMessage, context);
            this.showNotification(errorMessage);
        } else if (details) {
            // For non-critical errors with details, show option to view
            vscode.window.showErrorMessage(
                `${contextStr}: ${errorMessage}`,
                'View Details'
            ).then(selection => {
                if (selection === 'View Details') {
                    this.show();
                }
            });
        }
    }
    
    /**
     * Update the status bar with current error/warning counts
     */
    private updateStatusBar(): void {
        if (this.errorCount > 0 || this.warningCount > 0) {
            const errorText = this.errorCount > 0 ? `${this.errorCount} error${this.errorCount > 1 ? 's' : ''}` : '';
            const warningText = this.warningCount > 0 ? `${this.warningCount} warning${this.warningCount > 1 ? 's' : ''}` : '';
            const separator = errorText && warningText ? ', ' : '';
            
            this.statusBarItem.text = `$(issues) Demo Builder: ${errorText}${separator}${warningText}`;
            
            if (this.errorCount > 0) {
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else {
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            }
            
            this.statusBarItem.tooltip = 'Click to view Demo Builder logs';
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }
    
    /**
     * Add an error to the Problems panel
     */
    private addToProblemPanel(message: string, context?: string): void {
        // Create a virtual URI for the problem
        const uri = vscode.Uri.file(context || 'demo-builder-prerequisites');
        
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            message,
            vscode.DiagnosticSeverity.Error
        );
        
        diagnostic.source = 'Demo Builder';
        
        // Get existing diagnostics and add new one
        const existingDiagnostics = this.diagnostics.get(uri) || [];
        this.diagnostics.set(uri, [...existingDiagnostics, diagnostic]);
    }
    
    /**
     * Show a notification for critical errors
     */
    private showNotification(message: string): void {
        vscode.window.showErrorMessage(
            `Demo Builder: ${message}`,
            'View Logs',
            'Dismiss'
        ).then(selection => {
            if (selection === 'View Logs') {
                this.show();
            }
        });
    }
    
    /**
     * Show the output channel
     */
    show(): void {
        this.outputChannel.show(true); // true = preserve focus
    }
    
    /**
     * Clear all logs and reset counters
     */
    clear(): void {
        this.outputChannel.clear();
        this.errorCount = 0;
        this.warningCount = 0;
        this.diagnostics.clear();
        this.updateStatusBar();
    }
    
    /**
     * Dispose of all resources
     */
    dispose(): void {
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
        this.diagnostics.dispose();
    }
}