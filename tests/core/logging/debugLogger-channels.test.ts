/**
 * DebugLogger Channel Tests
 *
 * Tests for channel routing and channel operations (show, hide, clear, dispose).
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
                if (options?.log) {
                    if (name === 'Demo Builder: User Logs') return mockLogsChannel;
                    if (name === 'Demo Builder: Debug Logs') return mockDebugChannel;
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

describe('DebugLogger - Channel Routing', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        mockContext = createMockContext();
        logger = new DebugLogger(mockContext);
        jest.clearAllMocks();
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

            expect(mockLogsChannel.error).toHaveBeenCalled();
            expect(mockDebugChannel.error).toHaveBeenCalled();
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

describe('DebugLogger - Channel Operations', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        mockContext = createMockContext();
        logger = new DebugLogger(mockContext);
        jest.clearAllMocks();
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
