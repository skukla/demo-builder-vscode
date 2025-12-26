/**
 * ErrorLogger Tests
 *
 * Tests for error tracking with VS Code status bar and diagnostics integration.
 * ErrorLogger wraps DebugLogger and adds status bar indicators for errors/warnings.
 */

// Mock debugLogger module
const mockDebugLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
};

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: jest.fn(() => mockDebugLogger),
    DebugLogger: jest.fn(),
}));

// Mock VS Code
const mockStatusBarItem = {
    text: '',
    tooltip: '',
    command: '',
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
};

const mockDiagnosticCollection = {
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
    delete: jest.fn(),
    dispose: jest.fn(),
};

jest.mock('vscode', () => {
    const originalModule = jest.requireActual('../../__mocks__/vscode');
    return {
        ...originalModule,
        window: {
            ...originalModule.window,
            createStatusBarItem: jest.fn(() => mockStatusBarItem),
            showErrorMessage: jest.fn().mockResolvedValue(undefined),
        },
        languages: {
            createDiagnosticCollection: jest.fn(() => mockDiagnosticCollection),
        },
        StatusBarAlignment: {
            Left: 1,
            Right: 2,
        },
        DiagnosticSeverity: {
            Error: 0,
            Warning: 1,
            Information: 2,
            Hint: 3,
        },
        Diagnostic: jest.fn().mockImplementation((range, message, severity) => ({
            range,
            message,
            severity,
        })),
        Range: jest.fn().mockImplementation((startLine, startChar, endLine, endChar) => ({
            start: { line: startLine, character: startChar },
            end: { line: endLine, character: endChar },
        })),
        Uri: {
            file: jest.fn((path: string) => ({
                fsPath: path,
                path,
                toString: () => path,
            })),
        },
    };
});

import * as vscode from 'vscode';
import { ErrorLogger } from '@/core/logging/errorLogger';
import { getLogger } from '@/core/logging/debugLogger';

describe('ErrorLogger', () => {
    let errorLogger: ErrorLogger;
    let mockContext: vscode.ExtensionContext;

    function createMockContext(): vscode.ExtensionContext {
        return {
            subscriptions: [],
            extensionPath: '/test/path',
            extensionUri: vscode.Uri.file('/test/path'),
            globalStorageUri: vscode.Uri.file('/test/global-storage'),
            storageUri: vscode.Uri.file('/test/storage'),
            logUri: vscode.Uri.file('/test/logs'),
            extensionMode: vscode.ExtensionMode.Development,
            asAbsolutePath: jest.fn((p: string) => `/test/path/${p}`),
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([]),
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn(),
            },
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn(),
            },
            environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
            extension: {} as vscode.Extension<unknown>,
            languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation,
        } as unknown as vscode.ExtensionContext;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockStatusBarItem.text = '';
        mockStatusBarItem.tooltip = '';
        mockStatusBarItem.command = '';
        mockContext = createMockContext();
    });

    describe('Initialization', () => {
        it('should create status bar item with left alignment', () => {
            errorLogger = new ErrorLogger(mockContext);

            expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
                vscode.StatusBarAlignment.Left,
                100
            );
        });

        it('should set status bar command to showLogs', () => {
            errorLogger = new ErrorLogger(mockContext);

            expect(mockStatusBarItem.command).toBe('demoBuilder.showLogs');
        });

        it('should add status bar to context subscriptions', () => {
            errorLogger = new ErrorLogger(mockContext);

            expect(mockContext.subscriptions).toContain(mockStatusBarItem);
        });

        it('should create diagnostic collection with demo-builder name', () => {
            errorLogger = new ErrorLogger(mockContext);

            expect(vscode.languages.createDiagnosticCollection).toHaveBeenCalledWith('demo-builder');
        });

        it('should add diagnostic collection to context subscriptions', () => {
            errorLogger = new ErrorLogger(mockContext);

            expect(mockContext.subscriptions).toContain(mockDiagnosticCollection);
        });

        it('should get DebugLogger instance', () => {
            errorLogger = new ErrorLogger(mockContext);

            expect(getLogger).toHaveBeenCalled();
        });

        it('should handle DebugLogger not initialized gracefully', () => {
            (getLogger as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Logger not initialized');
            });

            // Should not throw
            expect(() => new ErrorLogger(mockContext)).not.toThrow();
        });
    });

    describe('logInfo()', () => {
        beforeEach(() => {
            errorLogger = new ErrorLogger(mockContext);
            jest.clearAllMocks();
        });

        it('should log info message without context', () => {
            errorLogger.logInfo('Test message');

            expect(mockDebugLogger.info).toHaveBeenCalledWith('Test message');
        });

        it('should log info message with context prefix', () => {
            errorLogger.logInfo('Test message', 'MyContext');

            expect(mockDebugLogger.info).toHaveBeenCalledWith(' [MyContext]Test message');
        });

        it('should be no-op when debugLogger unavailable', () => {
            (getLogger as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Logger not initialized');
            });
            const loggerWithoutDebug = new ErrorLogger(mockContext);
            jest.clearAllMocks();

            loggerWithoutDebug.logInfo('Test message');

            expect(mockDebugLogger.info).not.toHaveBeenCalled();
        });
    });

    describe('logWarning()', () => {
        beforeEach(() => {
            errorLogger = new ErrorLogger(mockContext);
            jest.clearAllMocks();
        });

        it('should log warning message', () => {
            errorLogger.logWarning('Warning message');

            expect(mockDebugLogger.warn).toHaveBeenCalledWith('Warning message');
        });

        it('should log warning message with context', () => {
            errorLogger.logWarning('Warning message', 'MyContext');

            expect(mockDebugLogger.warn).toHaveBeenCalledWith(' [MyContext]Warning message');
        });

        it('should increment warning counter', () => {
            errorLogger.logWarning('Warning 1');
            errorLogger.logWarning('Warning 2');

            // Status bar should show warning count
            expect(mockStatusBarItem.text).toContain('2');
        });

        it('should update status bar', () => {
            errorLogger.logWarning('Warning message');

            expect(mockStatusBarItem.show).toHaveBeenCalled();
            expect(mockStatusBarItem.text).toContain('$(warning)');
        });
    });

    describe('logError()', () => {
        beforeEach(() => {
            errorLogger = new ErrorLogger(mockContext);
            jest.clearAllMocks();
        });

        it('should log error string message', () => {
            errorLogger.logError('Error message');

            expect(mockDebugLogger.error).toHaveBeenCalledWith('Error message', undefined);
        });

        it('should log Error object with message extraction', () => {
            const error = new Error('Test error');
            errorLogger.logError(error);

            expect(mockDebugLogger.error).toHaveBeenCalledWith('Test error', error);
        });

        it('should log error with context prefix', () => {
            errorLogger.logError('Error message', 'MyContext');

            expect(mockDebugLogger.error).toHaveBeenCalledWith(' [MyContext]Error message', undefined);
        });

        it('should log error details when provided', () => {
            errorLogger.logError('Error message', undefined, false, 'Details here');

            expect(mockDebugLogger.debug).toHaveBeenCalledWith(
                'Error details for: Error message',
                { details: 'Details here', critical: false }
            );
        });

        it('should increment error counter', () => {
            errorLogger.logError('Error 1');
            errorLogger.logError('Error 2');

            expect(mockStatusBarItem.text).toContain('2');
        });

        it('should update status bar', () => {
            errorLogger.logError('Error message');

            expect(mockStatusBarItem.show).toHaveBeenCalled();
            expect(mockStatusBarItem.text).toContain('$(error)');
        });

        it('should show notification for critical errors', () => {
            errorLogger.logError('Critical error', undefined, true);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Demo Builder Error: Critical error',
                'Show Logs'
            );
        });

        it('should not show notification for non-critical errors', () => {
            errorLogger.logError('Non-critical error', undefined, false);

            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('should show logs when user clicks Show Logs button', async () => {
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValueOnce('Show Logs');

            errorLogger.logError('Critical error', undefined, true);

            // Wait for promise resolution
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockDebugLogger.show).toHaveBeenCalledWith(false);
        });
    });

    describe('updateStatusBar()', () => {
        beforeEach(() => {
            errorLogger = new ErrorLogger(mockContext);
            jest.clearAllMocks();
        });

        it('should show status bar when errors exist', () => {
            errorLogger.logError('Error');

            expect(mockStatusBarItem.show).toHaveBeenCalled();
        });

        it('should show status bar when warnings exist', () => {
            errorLogger.logWarning('Warning');

            expect(mockStatusBarItem.show).toHaveBeenCalled();
        });

        it('should hide status bar when no errors or warnings', () => {
            // Force status bar to be hidden (no errors/warnings logged)
            errorLogger.clear();

            expect(mockStatusBarItem.hide).toHaveBeenCalled();
        });

        it('should show combined text for errors and warnings', () => {
            errorLogger.logError('Error');
            errorLogger.logWarning('Warning');

            expect(mockStatusBarItem.text).toContain('$(error) 1');
            expect(mockStatusBarItem.text).toContain('$(warning) 1');
        });

        it('should set tooltip', () => {
            errorLogger.logError('Error');

            expect(mockStatusBarItem.tooltip).toBe('Click to show Demo Builder logs');
        });
    });

    describe('clear()', () => {
        beforeEach(() => {
            errorLogger = new ErrorLogger(mockContext);
            errorLogger.logError('Error');
            errorLogger.logWarning('Warning');
            jest.clearAllMocks();
        });

        it('should reset error counter', () => {
            errorLogger.clear();
            jest.clearAllMocks();

            // Log new error, should show count of 1 not 2
            errorLogger.logError('New error');
            expect(mockStatusBarItem.text).toContain('1');
        });

        it('should reset warning counter', () => {
            errorLogger.clear();
            jest.clearAllMocks();

            // Log new warning, should show count of 1 not 2
            errorLogger.logWarning('New warning');
            expect(mockStatusBarItem.text).toContain('1');
        });

        it('should clear diagnostics', () => {
            errorLogger.clear();

            expect(mockDiagnosticCollection.clear).toHaveBeenCalled();
        });

        it('should hide status bar', () => {
            errorLogger.clear();

            expect(mockStatusBarItem.hide).toHaveBeenCalled();
        });

        it('should call debugLogger.clear()', () => {
            errorLogger.clear();

            expect(mockDebugLogger.clear).toHaveBeenCalled();
        });
    });

    describe('show()', () => {
        beforeEach(() => {
            errorLogger = new ErrorLogger(mockContext);
            jest.clearAllMocks();
        });

        it('should call debugLogger.show() with preserveFocus false', () => {
            errorLogger.show();

            expect(mockDebugLogger.show).toHaveBeenCalledWith(false);
        });
    });

    describe('addDiagnostic()', () => {
        beforeEach(() => {
            errorLogger = new ErrorLogger(mockContext);
            mockDiagnosticCollection.get.mockReturnValue([]);
            jest.clearAllMocks();
        });

        it('should create diagnostic with message and severity', () => {
            const uri = vscode.Uri.file('/test/file.ts');
            errorLogger.addDiagnostic(uri, 'Test diagnostic', vscode.DiagnosticSeverity.Error);

            expect(vscode.Diagnostic).toHaveBeenCalledWith(
                expect.anything(),
                'Test diagnostic',
                vscode.DiagnosticSeverity.Error
            );
        });

        it('should use default Range when not provided', () => {
            const uri = vscode.Uri.file('/test/file.ts');
            errorLogger.addDiagnostic(uri, 'Test diagnostic');

            expect(vscode.Range).toHaveBeenCalledWith(0, 0, 0, 0);
        });

        it('should use provided Range', () => {
            const uri = vscode.Uri.file('/test/file.ts');
            const range = new vscode.Range(1, 0, 1, 10);
            errorLogger.addDiagnostic(uri, 'Test diagnostic', vscode.DiagnosticSeverity.Warning, range);

            expect(vscode.Diagnostic).toHaveBeenCalledWith(
                range,
                'Test diagnostic',
                vscode.DiagnosticSeverity.Warning
            );
        });

        it('should default severity to Error', () => {
            const uri = vscode.Uri.file('/test/file.ts');
            errorLogger.addDiagnostic(uri, 'Test diagnostic');

            expect(vscode.Diagnostic).toHaveBeenCalledWith(
                expect.anything(),
                'Test diagnostic',
                vscode.DiagnosticSeverity.Error
            );
        });

        it('should append to existing diagnostics', () => {
            const uri = vscode.Uri.file('/test/file.ts');
            const existingDiagnostic = { message: 'Existing', severity: 0 };
            mockDiagnosticCollection.get.mockReturnValue([existingDiagnostic]);

            errorLogger.addDiagnostic(uri, 'New diagnostic');

            expect(mockDiagnosticCollection.set).toHaveBeenCalledWith(
                uri,
                expect.arrayContaining([existingDiagnostic])
            );
        });

        it('should handle undefined existing diagnostics', () => {
            const uri = vscode.Uri.file('/test/file.ts');
            mockDiagnosticCollection.get.mockReturnValue(undefined);

            errorLogger.addDiagnostic(uri, 'Test diagnostic');

            expect(mockDiagnosticCollection.set).toHaveBeenCalled();
        });
    });

    describe('dispose()', () => {
        beforeEach(() => {
            errorLogger = new ErrorLogger(mockContext);
            jest.clearAllMocks();
        });

        it('should dispose status bar item', () => {
            errorLogger.dispose();

            expect(mockStatusBarItem.dispose).toHaveBeenCalled();
        });

        it('should dispose diagnostic collection', () => {
            errorLogger.dispose();

            expect(mockDiagnosticCollection.dispose).toHaveBeenCalled();
        });
    });
});
