/**
 * DebugLogger Tests
 *
 * Tests for the DebugLogger class using VS Code's LogOutputChannel API.
 * This logger uses dual channels:
 * - "Demo Builder: User Logs" - User-facing messages (info, warn, error)
 * - "Demo Builder: Debug Logs" - Technical diagnostics (debug, trace, command logs)
 *
 * Test Strategy:
 * - Mock VS Code's LogOutputChannel API with separate mocks per channel
 * - Test all severity methods route to correct channel
 * - Test data serialization for debug logging
 * - Test command logging goes to debug channel
 * - Test channel operations (show, showDebug, clear, dispose)
 * - Test log buffer for export functionality
 */

import * as vscode from 'vscode';

// Mock LogOutputChannel for User Logs channel
const mockLogsChannel = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    append: jest.fn(),
    appendLine: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
    name: 'Demo Builder: User Logs',
    logLevel: 2, // Info level
};

// Mock LogOutputChannel for Debug Logs channel
const mockDebugChannel = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    append: jest.fn(),
    appendLine: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
    name: 'Demo Builder: Debug Logs',
    logLevel: 0, // Trace level
};

// Override the vscode mock for createOutputChannel to return appropriate channel
jest.mock('vscode', () => {
    const originalModule = jest.requireActual('../../__mocks__/vscode');
    return {
        ...originalModule,
        window: {
            ...originalModule.window,
            createOutputChannel: jest.fn((name: string, options?: { log: boolean }) => {
                if (options?.log) {
                    // Return appropriate mock based on channel name
                    if (name === 'Demo Builder: User Logs') {
                        return mockLogsChannel;
                    } else if (name === 'Demo Builder: Debug Logs') {
                        return mockDebugChannel;
                    }
                }
                // Fallback for non-log channels
                return {
                    append: jest.fn(),
                    appendLine: jest.fn(),
                    clear: jest.fn(),
                    show: jest.fn(),
                    hide: jest.fn(),
                    dispose: jest.fn(),
                    name,
                };
            }),
        },
        workspace: {
            ...originalModule.workspace,
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue(true), // debugEnabled = true
            }),
        },
    };
});

// Import after mocking
import { DebugLogger, initializeLogger, getLogger, _resetLoggerForTesting } from '@/core/logging/debugLogger';

describe('DebugLogger', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        // Reset all mocks and restore default implementations
        jest.clearAllMocks();

        // Reset singleton state using exported function
        _resetLoggerForTesting();

        // Restore default mock for workspace.getConfiguration
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockReturnValue(true), // debugEnabled = true by default
        });

        // Create mock extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/path',
            storagePath: '/test/storage',
            globalStoragePath: '/test/global-storage',
            logPath: '/test/logs',
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
    });

    describe('Initialization', () => {
        it('should create two LogOutputChannels with log: true option', () => {
            logger = new DebugLogger(mockContext);

            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith(
                'Demo Builder: User Logs',
                { log: true }
            );
            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith(
                'Demo Builder: Debug Logs',
                { log: true }
            );
        });

        it('should add both channels to subscriptions for cleanup', () => {
            logger = new DebugLogger(mockContext);

            // Should have 2 subscriptions (one per channel)
            expect(mockContext.subscriptions.length).toBe(2);
        });

        it('should initialize with debug enabled by default', () => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages

            // Debug should work when enabled
            logger.debug('test message');
            expect(mockDebugChannel.debug).toHaveBeenCalled();
        });

        it('should write initialization messages to both channels', () => {
            logger = new DebugLogger(mockContext);

            expect(mockLogsChannel.info).toHaveBeenCalledWith('Demo Builder initialized');
            expect(mockDebugChannel.info).toHaveBeenCalledWith('Demo Builder initialized - Debug Logs channel ready');
        });
    });

    describe('Channel Routing', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages
        });

        describe('Both Channels (info, warn, error)', () => {
            it('should route info() to BOTH channels', () => {
                logger.info('Test info message');

                expect(mockLogsChannel.info).toHaveBeenCalledWith('Test info message');
                expect(mockDebugChannel.info).toHaveBeenCalledWith('Test info message');
            });

            it('should route warn() to BOTH channels', () => {
                logger.warn('Test warning message');

                expect(mockLogsChannel.warn).toHaveBeenCalledWith('Test warning message');
                expect(mockDebugChannel.warn).toHaveBeenCalledWith('Test warning message');
            });

            it('should route error() to BOTH channels', () => {
                logger.error('Test error message');

                expect(mockLogsChannel.error).toHaveBeenCalledWith('Test error message');
                expect(mockDebugChannel.error).toHaveBeenCalledWith('Test error message');
            });

            it('should route error details to Debug Logs channel only', () => {
                const testError = new Error('Underlying error');
                logger.error('Test error message', testError);

                // Main error goes to both channels
                expect(mockLogsChannel.error).toHaveBeenCalled();
                expect(mockDebugChannel.error).toHaveBeenCalled();
                // Technical error details go to Debug Logs only
                expect(mockDebugChannel.debug).toHaveBeenCalled();
                expect(mockLogsChannel.debug).not.toHaveBeenCalled();
            });
        });

        describe('Debug Logs Only (debug, trace)', () => {
            it('should route debug() to Debug Logs channel only', () => {
                logger.debug('Test debug message');

                expect(mockDebugChannel.debug).toHaveBeenCalledWith('Test debug message');
                expect(mockLogsChannel.debug).not.toHaveBeenCalled();
            });

            it('should route trace() to Debug Logs channel only', () => {
                logger.trace('Test trace message');

                expect(mockDebugChannel.trace).toHaveBeenCalledWith('Test trace message');
                expect(mockLogsChannel.trace).not.toHaveBeenCalled();
            });
        });
    });

    describe('Severity Level Methods', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages
        });

        describe('info()', () => {
            it('should add message to log buffer for export', () => {
                logger.info('Message for buffer');

                const content = logger.getLogContent();
                expect(content).toContain('Message for buffer');
            });
        });

        describe('warn()', () => {
            it('should add message to log buffer for export', () => {
                logger.warn('Warning for buffer');

                const content = logger.getLogContent();
                expect(content).toContain('Warning for buffer');
            });
        });

        describe('error()', () => {
            it('should add message to log buffer for export', () => {
                logger.error('Error for buffer');

                const content = logger.getLogContent();
                expect(content).toContain('Error for buffer');
            });

            it('should truncate excessively long error messages', () => {
                const longMessage = 'x'.repeat(3000);
                const testError = new Error(longMessage);
                logger.error('Test error', testError);

                // Should still log but message should be truncated in debug
                expect(mockLogsChannel.error).toHaveBeenCalled();
            });
        });

        describe('debug()', () => {
            it('should NOT add debug messages to export buffer (privacy)', () => {
                logger.debug('Debug message not for export');

                const content = logger.getLogContent();
                expect(content).not.toContain('Debug message not for export');
            });

            it('should serialize object data to JSON', () => {
                const data = { key: 'value', count: 42 };
                logger.debug('Test with data', data);

                expect(mockDebugChannel.debug).toHaveBeenCalledWith('Test with data');
                expect(mockDebugChannel.debug).toHaveBeenCalledWith(
                    expect.stringContaining('"key"')
                );
            });

            it('should fall back to String() for non-serializable data', () => {
                const circular: Record<string, unknown> = { name: 'test' };
                circular.self = circular; // Creates circular reference

                logger.debug('Test with circular data', circular);

                // Should not throw, should fall back to String()
                expect(mockDebugChannel.debug).toHaveBeenCalled();
            });

            it('should respect debugEnabled setting', () => {
                // Mock disabled debug
                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                    get: jest.fn().mockReturnValue(false),
                });

                const disabledLogger = new DebugLogger(mockContext);
                jest.clearAllMocks();

                disabledLogger.debug('Should not appear');

                expect(mockDebugChannel.debug).not.toHaveBeenCalled();
            });
        });

        describe('trace()', () => {
            it('should NOT add trace messages to export buffer', () => {
                logger.trace('Trace message');

                const content = logger.getLogContent();
                expect(content).not.toContain('Trace message');
            });

            it('should handle data parameter', () => {
                logger.trace('Trace with data', { detail: 'value' });

                expect(mockDebugChannel.trace).toHaveBeenCalled();
            });
        });
    });

    describe('Command Logging', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages
        });

        it('should log command execution to Debug Logs channel', () => {
            const result = {
                stdout: 'command output',
                stderr: '',
                code: 0,
                duration: 150,
            };

            logger.logCommand('npm install', result);

            expect(mockDebugChannel.debug).toHaveBeenCalled();
            expect(mockLogsChannel.debug).not.toHaveBeenCalled();
        });

        it('should include command name in log', () => {
            const result = {
                stdout: 'output',
                stderr: '',
                code: 0,
                duration: 100,
            };

            logger.logCommand('aio auth login', result);

            // Check that the command name is logged
            const debugCalls = mockDebugChannel.debug.mock.calls;
            const hasCommandName = debugCalls.some((call: unknown[]) =>
                call.some((arg: unknown) =>
                    typeof arg === 'string' && arg.includes('aio auth login')
                )
            );
            expect(hasCommandName).toBe(true);
        });

        it('should include duration in log', () => {
            const result = {
                stdout: 'output',
                stderr: '',
                code: 0,
                duration: 500,
            };

            logger.logCommand('git status', result);

            const debugCalls = mockDebugChannel.debug.mock.calls;
            const hasDuration = debugCalls.some((call: unknown[]) =>
                call.some((arg: unknown) =>
                    typeof arg === 'string' && arg.includes('500')
                )
            );
            expect(hasDuration).toBe(true);
        });

        it('should include exit code in log', () => {
            const result = {
                stdout: '',
                stderr: 'error',
                code: 1,
                duration: 50,
            };

            logger.logCommand('failing-command', result);

            const debugCalls = mockDebugChannel.debug.mock.calls;
            const hasExitCode = debugCalls.some((call: unknown[]) =>
                call.some((arg: unknown) =>
                    typeof arg === 'string' && (arg.includes('Exit Code') || arg.includes('code'))
                )
            );
            expect(hasExitCode).toBe(true);
        });

        it('should log stdout at trace level to Debug Logs channel', () => {
            const result = {
                stdout: 'Detailed command output here',
                stderr: '',
                code: 0,
                duration: 100,
            };

            logger.logCommand('verbose-command', result);

            // stdout should be at trace level in Debug channel
            expect(mockDebugChannel.trace).toHaveBeenCalled();
        });

        it('should log stderr when present', () => {
            const result = {
                stdout: '',
                stderr: 'Warning: something happened',
                code: 0,
                duration: 100,
            };

            logger.logCommand('warning-command', result);

            expect(mockDebugChannel.trace).toHaveBeenCalled();
        });

        it('should warn about slow commands in User Logs channel', () => {
            const result = {
                stdout: '',
                stderr: '',
                code: 0,
                duration: 5000, // 5 seconds - slow
            };

            logger.logCommand('slow-command', result);

            // Slow command warning goes to User Logs (visible to user)
            expect(mockLogsChannel.warn).toHaveBeenCalled();
        });
    });

    describe('Channel Operations', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages
        });

        describe('show()', () => {
            it('should call logsChannel.show()', () => {
                logger.show();

                expect(mockLogsChannel.show).toHaveBeenCalled();
                expect(mockDebugChannel.show).not.toHaveBeenCalled();
            });

            it('should preserve focus by default', () => {
                logger.show();

                expect(mockLogsChannel.show).toHaveBeenCalledWith(true);
            });

            it('should allow taking focus', () => {
                logger.show(false);

                expect(mockLogsChannel.show).toHaveBeenCalledWith(false);
            });
        });

        describe('showDebug()', () => {
            it('should call debugChannel.show()', () => {
                logger.showDebug();

                expect(mockDebugChannel.show).toHaveBeenCalled();
                expect(mockLogsChannel.show).not.toHaveBeenCalled();
            });

            it('should preserve focus by default', () => {
                logger.showDebug();

                expect(mockDebugChannel.show).toHaveBeenCalledWith(true);
            });

            it('should allow taking focus', () => {
                logger.showDebug(false);

                expect(mockDebugChannel.show).toHaveBeenCalledWith(false);
            });
        });

        describe('clear()', () => {
            it('should call logsChannel.clear()', () => {
                logger.clear();

                expect(mockLogsChannel.clear).toHaveBeenCalled();
            });
        });

        describe('clearDebug()', () => {
            it('should call debugChannel.clear()', () => {
                logger.clearDebug();

                expect(mockDebugChannel.clear).toHaveBeenCalled();
            });
        });

        describe('dispose()', () => {
            it('should dispose both channels', () => {
                logger.dispose();

                expect(mockLogsChannel.dispose).toHaveBeenCalled();
                expect(mockDebugChannel.dispose).toHaveBeenCalled();
            });
        });
    });

    describe('Log Buffer for Export', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages
        });

        it('should accumulate info messages', () => {
            logger.info('First message');
            logger.info('Second message');

            const content = logger.getLogContent();
            expect(content).toContain('First message');
            expect(content).toContain('Second message');
        });

        it('should accumulate warn messages', () => {
            logger.warn('Warning one');
            logger.warn('Warning two');

            const content = logger.getLogContent();
            expect(content).toContain('Warning one');
            expect(content).toContain('Warning two');
        });

        it('should accumulate error messages', () => {
            logger.error('Error one');
            logger.error('Error two');

            const content = logger.getLogContent();
            expect(content).toContain('Error one');
            expect(content).toContain('Error two');
        });

        it('should NOT include debug/trace in export buffer', () => {
            logger.info('Info for export');
            logger.debug('Debug not for export');
            logger.trace('Trace not for export');

            const content = logger.getLogContent();
            expect(content).toContain('Info for export');
            expect(content).not.toContain('Debug not for export');
            expect(content).not.toContain('Trace not for export');
        });
    });

    describe('Log Buffer Size Cap', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages
        });

        it('should evict oldest entries when buffer exceeds 10K limit', () => {
            // Add 10,001 entries to exceed the 10K cap
            for (let i = 0; i < 10001; i++) {
                logger.info(`Entry_${i.toString().padStart(5, '0')}`);
            }

            const content = logger.getLogContent();
            const lines = content.split('\n').filter(line => line.trim());

            // After exceeding limit, 10% oldest should be evicted (1000 entries)
            // So we should have ~9001 entries
            expect(lines.length).toBeLessThan(10001);
            expect(lines.length).toBeGreaterThan(8000); // Reasonable bounds

            // First messages should have been evicted (use exact match patterns)
            expect(content).not.toContain('Entry_00000');
            expect(content).not.toContain('Entry_00500');

            // Later messages should still be present
            expect(content).toContain('Entry_10000');
            expect(content).toContain('Entry_09500');
        });

        it('should not evict when under the buffer limit', () => {
            // Add only 100 entries (well under the 10K cap)
            for (let i = 0; i < 100; i++) {
                logger.info(`Message ${i}`);
            }

            const content = logger.getLogContent();
            const lines = content.split('\n').filter(line => line.trim());

            // All entries should be present
            expect(lines.length).toBe(100);
            expect(content).toContain('Message 0');
            expect(content).toContain('Message 99');
        });
    });

    describe('Singleton Pattern', () => {
        it('should return same instance from initializeLogger', () => {
            const logger1 = initializeLogger(mockContext);
            const logger2 = initializeLogger(mockContext);

            expect(logger1).toBe(logger2);
        });

        it('should return initialized instance from getLogger', () => {
            const initialized = initializeLogger(mockContext);
            const retrieved = getLogger();

            expect(retrieved).toBe(initialized);
        });

        it('should throw when getLogger called before initialization', () => {
            // Reset singleton - done in beforeEach
            expect(() => getLogger()).toThrow('Logger not initialized');
        });
    });

    describe('Environment Information Logging', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages
        });

        it('should log environment info to Debug Logs channel', () => {
            const env = {
                PATH: '/usr/bin:/usr/local/bin',
                HOME: '/Users/test',
                SHELL: '/bin/zsh',
            } as unknown as NodeJS.ProcessEnv;

            logger.logEnvironment('Test Environment', env);

            expect(mockDebugChannel.debug).toHaveBeenCalled();
            expect(mockLogsChannel.debug).not.toHaveBeenCalled();
        });

        it('should respect debug enabled setting', () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn().mockReturnValue(false),
            });

            const disabledLogger = new DebugLogger(mockContext);
            jest.clearAllMocks();

            disabledLogger.logEnvironment('Test', {} as NodeJS.ProcessEnv);

            expect(mockDebugChannel.debug).not.toHaveBeenCalled();
        });
    });

    describe('Backward Compatibility', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages
        });

        it('should expose toggle() method for legacy code', () => {
            expect(typeof logger.toggle).toBe('function');

            // Should not throw - calls show() internally
            logger.toggle();
            expect(mockLogsChannel.show).toHaveBeenCalled();
        });

        it('should expose hide() method', () => {
            expect(typeof logger.hide).toBe('function');

            // Should not throw
            logger.hide();
            expect(mockLogsChannel.hide).toHaveBeenCalled();
        });

        it('should expose hideDebug() method', () => {
            expect(typeof logger.hideDebug).toBe('function');

            // Should not throw
            logger.hideDebug();
            expect(mockDebugChannel.hide).toHaveBeenCalled();
        });
    });

    describe('replayLogsFromFile Path Validation', () => {
        const originalEnv = process.env;

        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks(); // Clear initialization messages
            // Mock HOME for path validation
            process.env = { ...originalEnv, HOME: '/Users/testuser' };
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it('should reject paths outside ~/.demo-builder directory', async () => {
            // Attempt to replay from untrusted path
            await logger.replayLogsFromFile('/etc/passwd');

            // Should not attempt to read the file (no info logged from replay)
            // The debug log should show rejection
            expect(mockDebugChannel.debug).toHaveBeenCalledWith(
                expect.stringContaining('Rejecting replay from untrusted path')
            );
        });

        it('should reject path traversal attempts', async () => {
            // Attempt path traversal
            await logger.replayLogsFromFile('/Users/testuser/.demo-builder/../.ssh/id_rsa');

            // Should be rejected after normalization
            expect(mockDebugChannel.debug).toHaveBeenCalledWith(
                expect.stringContaining('Rejecting replay from untrusted path')
            );
        });

        it('should accept paths within ~/.demo-builder directory', async () => {
            // Mock fs.readFile to return empty content for valid path
            const fs = require('fs').promises;
            const originalReadFile = fs.readFile;
            fs.readFile = jest.fn().mockResolvedValue('');
            fs.unlink = jest.fn().mockResolvedValue(undefined);

            // Valid path within ~/.demo-builder
            const validPath = '/Users/testuser/.demo-builder/session-logs.txt';
            await logger.replayLogsFromFile(validPath);

            // Should not have rejection message
            const debugCalls = mockDebugChannel.debug.mock.calls;
            const hasRejection = debugCalls.some((call: unknown[]) =>
                call.some((arg: unknown) =>
                    typeof arg === 'string' && arg.includes('Rejecting replay')
                )
            );
            expect(hasRejection).toBe(false);

            // Restore fs
            fs.readFile = originalReadFile;
        });
    });
});
