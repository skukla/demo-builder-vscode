/**
 * DebugLogger Logging Tests
 *
 * Tests for severity level methods, command logging, and log buffer functionality.
 */

import {
    mockLogsChannel,
    mockDebugChannel,
    createMockContext,
    resetMocks,
} from './debugLogger.testUtils';

// Mock vscode - must be in test file for proper hoisting
jest.mock('vscode', () => {
    const originalModule = jest.requireActual('../../__mocks__/vscode');
    return {
        ...originalModule,
        window: {
            ...originalModule.window,
            createOutputChannel: jest.fn((name: string, options?: { log: boolean }) => {
                const { mockLogsChannel, mockDebugChannel } = require('./debugLogger.testUtils');
                // Both channels use LogOutputChannel with { log: true }
                if (options?.log) {
                    if (name === 'Demo Builder: User Logs') {
                        return mockLogsChannel;
                    }
                    if (name === 'Demo Builder: Debug Logs') {
                        return mockDebugChannel;
                    }
                }
                return { append: jest.fn(), appendLine: jest.fn(), clear: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), name };
            }),
        },
        workspace: {
            ...originalModule.workspace,
            getConfiguration: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(true) }),
        },
    };
});

import * as vscode from 'vscode';
import { DebugLogger, _resetLoggerForTesting } from '@/core/logging/debugLogger';

describe('DebugLogger - Severity Level Methods', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        mockContext = createMockContext();
        logger = new DebugLogger(mockContext);
        jest.clearAllMocks();
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

            // Debug channel receives info() with [debug] prefix
            expect(mockDebugChannel.info).toHaveBeenCalledWith('[debug] Test with data');
            expect(mockDebugChannel.info).toHaveBeenCalledWith(
                expect.stringContaining('"key"')
            );
        });

        it('should fall back to String() for non-serializable data', () => {
            const circular: Record<string, unknown> = { name: 'test' };
            circular.self = circular;

            logger.debug('Test with circular data', circular);

            // Debug channel receives info() with [debug] prefix
            expect(mockDebugChannel.info).toHaveBeenCalled();
        });

        it('should always output debug messages via info() with [debug] prefix', () => {
            logger.debug('Should always appear');

            expect(mockDebugChannel.info).toHaveBeenCalledWith('[debug] Should always appear');
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

            // Debug channel receives info() with [trace] prefix
            expect(mockDebugChannel.info).toHaveBeenCalledWith('[trace] Trace with data');
        });
    });
});

describe('DebugLogger - Command Logging', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        mockContext = createMockContext();
        logger = new DebugLogger(mockContext);
        jest.clearAllMocks();
    });

    it('should log command execution to Debug Logs channel only', () => {
        const result = {
            stdout: 'command output',
            stderr: '',
            code: 0,
            duration: 150,
        };

        logger.logCommand('npm install', result);

        // Debug channel receives info() with [debug] prefix
        expect(mockDebugChannel.info).toHaveBeenCalledWith(
            expect.stringContaining('[debug] COMMAND EXECUTION')
        );
        // User Logs should not get command debug info
        expect(mockLogsChannel.info).not.toHaveBeenCalledWith(
            expect.stringContaining('COMMAND EXECUTION')
        );
    });

    it('should include command name in log', () => {
        const result = {
            stdout: 'output',
            stderr: '',
            code: 0,
            duration: 100,
        };

        logger.logCommand('aio auth login', result);

        expect(mockDebugChannel.info).toHaveBeenCalledWith(
            expect.stringContaining('aio auth login')
        );
    });

    it('should include duration in log', () => {
        const result = {
            stdout: 'output',
            stderr: '',
            code: 0,
            duration: 500,
        };

        logger.logCommand('git status', result);

        expect(mockDebugChannel.info).toHaveBeenCalledWith(
            expect.stringContaining('500')
        );
    });

    it('should include exit code in log', () => {
        const result = {
            stdout: '',
            stderr: 'error',
            code: 1,
            duration: 50,
        };

        logger.logCommand('failing-command', result);

        expect(mockDebugChannel.info).toHaveBeenCalledWith(
            expect.stringContaining('Exit Code')
        );
    });

    it('should log stdout to Debug Logs channel with [trace] prefix', () => {
        const result = {
            stdout: 'Detailed command output here',
            stderr: '',
            code: 0,
            duration: 100,
        };

        logger.logCommand('verbose-command', result);

        expect(mockDebugChannel.info).toHaveBeenCalledWith('[trace] --- STDOUT ---');
    });

    it('should log stderr when present with [trace] prefix', () => {
        const result = {
            stdout: '',
            stderr: 'Warning: something happened',
            code: 0,
            duration: 100,
        };

        logger.logCommand('warning-command', result);

        expect(mockDebugChannel.info).toHaveBeenCalledWith('[trace] --- STDERR ---');
    });

    it('should warn about slow commands in User Logs channel', () => {
        const result = {
            stdout: '',
            stderr: '',
            code: 0,
            duration: 5000,
        };

        logger.logCommand('slow-command', result);

        expect(mockLogsChannel.warn).toHaveBeenCalled();
    });
});

describe('DebugLogger - Log Buffer for Export', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        mockContext = createMockContext();
        logger = new DebugLogger(mockContext);
        jest.clearAllMocks();
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

describe('DebugLogger - Log Buffer Size Cap', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        mockContext = createMockContext();
        logger = new DebugLogger(mockContext);
        jest.clearAllMocks();
    });

    it('should evict oldest entries when buffer exceeds 10K limit', () => {
        for (let i = 0; i < 10001; i++) {
            logger.info(`Entry_${i.toString().padStart(5, '0')}`);
        }

        const content = logger.getLogContent();
        const lines = content.split('\n').filter((line) => line.trim());

        expect(lines.length).toBeLessThan(10001);
        expect(lines.length).toBeGreaterThan(8000);

        expect(content).not.toContain('Entry_00000');
        expect(content).not.toContain('Entry_00500');

        expect(content).toContain('Entry_10000');
        expect(content).toContain('Entry_09500');
    });

    it('should not evict when under the buffer limit', () => {
        for (let i = 0; i < 100; i++) {
            logger.info(`Message ${i}`);
        }

        const content = logger.getLogContent();
        const lines = content.split('\n').filter((line) => line.trim());

        expect(lines.length).toBe(100);
        expect(content).toContain('Message 0');
        expect(content).toContain('Message 99');
    });
});
