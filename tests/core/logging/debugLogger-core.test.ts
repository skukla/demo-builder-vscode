/**
 * DebugLogger Core Tests
 *
 * Tests for initialization, singleton pattern, backward compatibility,
 * and environment information logging.
 */

// Import mock channels first (they're used in the jest.mock below)
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
                get: jest.fn().mockReturnValue(true),
            }),
        },
    };
});

import * as vscode from 'vscode';
import {
    DebugLogger,
    initializeLogger,
    getLogger,
    _resetLoggerForTesting,
} from '@/core/logging/debugLogger';

describe('DebugLogger - Core', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        mockContext = createMockContext();
    });

    describe('Initialization', () => {
        it('should create LogOutputChannel for both channels', () => {
            logger = new DebugLogger(mockContext);

            // Both channels use LogOutputChannel with { log: true }
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

            expect(mockContext.subscriptions.length).toBe(2);
        });

        it('should always output debug messages via info() with [debug] prefix', () => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks();

            logger.debug('test message');
            // Debug messages promoted to info() with [debug] prefix
            expect(mockDebugChannel.info).toHaveBeenCalledWith('[debug] test message');
        });

        it('should write initialization messages to both channels', () => {
            logger = new DebugLogger(mockContext);

            expect(mockLogsChannel.info).toHaveBeenCalledWith('Demo Builder initialized');
            expect(mockDebugChannel.info).toHaveBeenCalledWith(
                'Demo Builder initialized - Debug Logs channel ready'
            );
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
            expect(() => getLogger()).toThrow('Logger not initialized');
        });
    });

    describe('Environment Information Logging', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks();
        });

        it('should log environment info to Debug Logs channel only', () => {
            const env = {
                PATH: '/usr/bin:/usr/local/bin',
                HOME: '/Users/test',
                SHELL: '/bin/zsh',
            } as unknown as NodeJS.ProcessEnv;

            logger.logEnvironment('Test Environment', env);

            // Debug channel receives info() with [debug] prefix
            expect(mockDebugChannel.info).toHaveBeenCalledWith(
                expect.stringContaining('[debug] Environment - Test Environment')
            );
            // User Logs should not get environment info
            expect(mockLogsChannel.info).not.toHaveBeenCalledWith(
                expect.stringContaining('Environment')
            );
        });

        it('should always log environment info', () => {
            const env = {
                PATH: '/usr/bin:/usr/local/bin',
            } as unknown as NodeJS.ProcessEnv;

            logger.logEnvironment('Test', env);

            expect(mockDebugChannel.info).toHaveBeenCalled();
        });
    });

    describe('Backward Compatibility', () => {
        beforeEach(() => {
            logger = new DebugLogger(mockContext);
            jest.clearAllMocks();
        });

        it('should expose toggle() method for legacy code', () => {
            expect(typeof logger.toggle).toBe('function');

            logger.toggle();
            expect(mockLogsChannel.show).toHaveBeenCalled();
        });

        it('should expose hide() method', () => {
            expect(typeof logger.hide).toBe('function');

            logger.hide();
            expect(mockLogsChannel.hide).toHaveBeenCalled();
        });

        it('should expose hideDebug() method', () => {
            expect(typeof logger.hideDebug).toBe('function');

            logger.hideDebug();
            expect(mockDebugChannel.hide).toHaveBeenCalled();
        });
    });
});
