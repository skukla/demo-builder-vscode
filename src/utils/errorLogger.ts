import * as vscode from 'vscode';
import { getLogger, DebugLogger } from './debugLogger';

export class ErrorLogger {
    private debugLogger: DebugLogger | undefined;
    private statusBarItem: vscode.StatusBarItem;
    private diagnostics: vscode.DiagnosticCollection;
    private errorCount = 0;
    private warningCount = 0;
    
    constructor(context: vscode.ExtensionContext) {
        // Use the unified DebugLogger instead of creating own channel
        try {
            this.debugLogger = getLogger();
        } catch {
            // DebugLogger not initialized yet - this shouldn't happen in normal use
            console.error('ErrorLogger: DebugLogger not initialized');
        }
        
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
        if (!this.debugLogger) return;
        
        const contextStr = context ? ` [${context}]` : '';
        this.debugLogger.info(`${contextStr}${message}`);
    }
    
    /**
     * Log a warning message
     */
    logWarning(message: string, context?: string): void {
        if (!this.debugLogger) return;
        
        const contextStr = context ? ` [${context}]` : '';
        this.debugLogger.warn(`${contextStr}${message}`);
        
        this.warningCount++;
        this.updateStatusBar();
    }
    
    /**
     * Log an error message with optional detailed information
     */
    logError(error: Error | string, context?: string, critical: boolean = false, details?: string): void {
        if (!this.debugLogger) return;
        
        const contextStr = context ? ` [${context}]` : '';
        const errorMessage = error instanceof Error ? error.message : error;
        
        // Log to main channel
        this.debugLogger.error(`${contextStr}${errorMessage}`, error instanceof Error ? error : undefined);
        
        // Log details to debug channel if provided
        if (details) {
            this.debugLogger.debug(`Error details for: ${errorMessage}`, { details, critical });
        }
        
        this.errorCount++;
        this.updateStatusBar();
        
        // Show notification for critical errors
        if (critical) {
            vscode.window.showErrorMessage(
                `Demo Builder Error: ${errorMessage}`,
                'Show Logs'
            ).then(selection => {
                if (selection === 'Show Logs') {
                    this.show();
                }
            });
        }
    }
    
    /**
     * Clear the log output channel and reset counters
     */
    clear(): void {
        if (this.debugLogger) {
            this.debugLogger.clear();
        }
        this.errorCount = 0;
        this.warningCount = 0;
        this.diagnostics.clear();
        this.updateStatusBar();
    }
    
    /**
     * Show the output channel
     */
    show(): void {
        if (this.debugLogger) {
            this.debugLogger.show(false);
        }
    }
    
    /**
     * Update the status bar with error/warning counts
     */
    private updateStatusBar(): void {
        if (this.errorCount > 0 || this.warningCount > 0) {
            const errorText = this.errorCount > 0 ? `$(error) ${this.errorCount}` : '';
            const warningText = this.warningCount > 0 ? `$(warning) ${this.warningCount}` : '';
            this.statusBarItem.text = `${errorText} ${warningText}`.trim();
            this.statusBarItem.tooltip = 'Click to show Demo Builder logs';
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }
    
    /**
     * Add a diagnostic (error/warning) to the Problems panel
     */
    addDiagnostic(
        uri: vscode.Uri,
        message: string,
        severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Error,
        range?: vscode.Range
    ): void {
        const diagnostic = new vscode.Diagnostic(
            range || new vscode.Range(0, 0, 0, 0),
            message,
            severity
        );
        
        const existingDiagnostics = this.diagnostics.get(uri) || [];
        this.diagnostics.set(uri, [...existingDiagnostics, diagnostic]);
    }
    
    /**
     * Dispose of resources
     */
    dispose(): void {
        this.statusBarItem.dispose();
        this.diagnostics.dispose();
    }
}