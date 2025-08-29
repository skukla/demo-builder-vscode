# Error Logging Strategy

## Overview

This document outlines the error logging and notification strategy for the Demo Builder VS Code extension. The goal is to provide users with clear, actionable error information while maintaining a clean separation between command execution, status display, and error diagnostics.

## Architecture

### Three-Channel Approach

1. **Terminal (Right Panel)** - Command Execution
   - Shows actual commands being run
   - Displays real command output
   - Provides transparency and trust
   - No formatting or status indicators

2. **Webview (Left Panel)** - Status Display
   - Shows prerequisite check status
   - Visual indicators (✓, ✗, ⟳)
   - User-friendly progress tracking
   - Action buttons for installation

3. **Output Channel + Status Bar** - Error Logging
   - Detailed error logs with timestamps
   - Stack traces for debugging
   - System information
   - Persistent and searchable

## Error Notification Levels

### Level 1: Informational
- **Where**: Output Channel only
- **When**: Non-critical information, debugging details
- **User Notification**: None
- **Example**: "Checking prerequisite version"

### Level 2: Warning
- **Where**: Output Channel + Status Bar
- **When**: Non-blocking issues, optional prerequisites missing
- **User Notification**: Status bar shows warning count
- **Example**: "Optional tool Docker not installed"

### Level 3: Error
- **Where**: Output Channel + Status Bar + Webview
- **When**: Blocking errors that prevent continuation
- **User Notification**: 
  - Status bar shows error count with red background
  - Webview shows error state for affected item
- **Example**: "Required prerequisite Node.js not found"

### Level 4: Critical Error
- **Where**: All channels + Problems Panel + Notification
- **When**: System failures, unrecoverable errors
- **User Notification**:
  - VS Code notification popup
  - Problems panel entry (with badge counter)
  - Status bar error indicator
  - Webview error state
- **Example**: "Failed to connect to Adobe I/O services"

## Implementation

### ErrorLogger Class

```typescript
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
    }
    
    logInfo(message: string, context?: string): void {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` [${context}]` : '';
        this.outputChannel.appendLine(`[${timestamp}] INFO${contextStr}: ${message}`);
    }
    
    logWarning(message: string, context?: string): void {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` [${context}]` : '';
        this.outputChannel.appendLine(`[${timestamp}] WARNING${contextStr}: ${message}`);
        
        this.warningCount++;
        this.updateStatusBar();
    }
    
    logError(error: Error | string, context?: string, critical: boolean = false): void {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` [${context}]` : '';
        const errorMessage = error instanceof Error ? error.message : error;
        const stackTrace = error instanceof Error ? error.stack : '';
        
        // Log to output channel
        this.outputChannel.appendLine(`[${timestamp}] ERROR${contextStr}: ${errorMessage}`);
        if (stackTrace) {
            this.outputChannel.appendLine(`  Stack Trace:`);
            stackTrace.split('\n').forEach(line => {
                this.outputChannel.appendLine(`    ${line}`);
            });
        }
        this.outputChannel.appendLine(''); // Empty line for readability
        
        // Update counts and status bar
        this.errorCount++;
        this.updateStatusBar();
        
        // For critical errors, add to Problems panel
        if (critical) {
            this.addToProblemPanel(errorMessage, context);
            this.showNotification(errorMessage);
        }
    }
    
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
    
    show(): void {
        this.outputChannel.show(true); // true = preserve focus
    }
    
    clear(): void {
        this.outputChannel.clear();
        this.errorCount = 0;
        this.warningCount = 0;
        this.diagnostics.clear();
        this.updateStatusBar();
    }
    
    dispose(): void {
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
        this.diagnostics.dispose();
    }
}
```

## Usage Examples

### Basic Logging

```typescript
const logger = new ErrorLogger(context);

// Info logging (no user notification)
logger.logInfo('Starting prerequisite checks', 'Prerequisites');

// Warning (shows in status bar)
logger.logWarning('Optional tool Docker not found', 'Prerequisites');

// Error (shows in status bar with red background)
logger.logError(new Error('Failed to install Node.js'), 'Prerequisites');

// Critical error (shows notification + problems panel + status bar)
logger.logError(
    new Error('Cannot connect to Adobe I/O services'), 
    'Authentication',
    true // critical flag
);
```

### Integration with Prerequisites Check

```typescript
try {
    const status = await this.prereqManager.checkPrerequisite(prereq);
    
    if (status.installed) {
        logger.logInfo(`${prereq.name} found: ${status.version}`, 'Prerequisites');
    } else {
        logger.logWarning(`${prereq.name} not installed`, 'Prerequisites');
    }
} catch (error) {
    logger.logError(error as Error, 'Prerequisites', true);
}
```

## User Experience Flow

### Normal Operation
1. User initiates prerequisite check
2. Terminal shows commands being executed
3. Webview shows status for each prerequisite
4. Info messages logged to Output Channel (not visible unless opened)

### When Warning Occurs
1. Warning logged to Output Channel with timestamp
2. Status bar shows: "$(issues) Demo Builder: 1 warning"
3. Status bar has yellow background
4. User can click status bar to view logs

### When Error Occurs
1. Error logged to Output Channel with full stack trace
2. Status bar shows: "$(issues) Demo Builder: 1 error"
3. Status bar has red background
4. Webview shows error state for affected prerequisite
5. User can click status bar to view detailed logs

### When Critical Error Occurs
1. All of the above, plus:
2. VS Code notification popup appears
3. Entry added to Problems panel (with badge counter)
4. User can:
   - Click notification to view logs
   - Open Problems panel to see error
   - Click status bar to view detailed logs
   - Copy logs from Output Channel for bug reports

## Benefits

### For Users
- **Multiple notification levels** ensure important errors aren't missed
- **Detailed logs** available for troubleshooting
- **Easy sharing** - can copy entire Output Channel content
- **Non-intrusive** for normal operations
- **Clear visual indicators** when attention needed

### For Developers
- **Centralized logging** system
- **Consistent error handling** across extension
- **Debugging information** preserved
- **Flexible severity levels**
- **Integration with VS Code's built-in UI elements**

## Best Practices

1. **Use appropriate severity levels**
   - Don't mark everything as critical
   - Info for debugging/trace information
   - Warning for optional/recoverable issues
   - Error for blocking issues
   - Critical only for system failures

2. **Provide context**
   - Always include context parameter (e.g., "Prerequisites", "Authentication")
   - Include relevant state information in error messages

3. **Clear logs appropriately**
   - Clear logs at the start of new operations
   - Preserve logs during error states for debugging

4. **Include actionable information**
   - Error messages should suggest solutions when possible
   - Include system information for bug reports

## Future Enhancements

1. **Log to file** - Option to save logs to a file for persistent storage
2. **Log levels** - User-configurable verbosity levels
3. **Structured logging** - JSON format for automated processing
4. **Remote logging** - Send critical errors to telemetry service (with user consent)
5. **Quick fixes** - Integrate with VS Code's Quick Fix functionality for common errors