/**
 * Logger Tests
 *
 * Tests for the backward-compatible Logger wrapper around DebugLogger.
 * Logger provides a simple API that delegates all logging to the unified DebugLogger.
 */

// Mock debugLogger module
const mockDebugLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
};

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: jest.fn(() => mockDebugLogger),
    DebugLogger: jest.fn(),
}));

import { Logger } from '@/core/logging/logger';
import { getLogger } from '@/core/logging/debugLogger';

describe('Logger', () => {
    let logger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        it('should store the logger name', () => {
            logger = new Logger('TestLogger');

            // Internal property, we verify by checking getLogger was called
            expect(getLogger).toHaveBeenCalled();
        });

        it('should get DebugLogger instance on construction', () => {
            logger = new Logger('TestLogger');

            expect(getLogger).toHaveBeenCalled();
        });

        it('should handle DebugLogger not initialized gracefully', () => {
            (getLogger as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Logger not initialized');
            });

            // Should not throw
            expect(() => new Logger('TestLogger')).not.toThrow();
        });
    });

    describe('setOutputChannel()', () => {
        beforeEach(() => {
            logger = new Logger('TestLogger');
            jest.clearAllMocks();
        });

        it('should be a no-op for backward compatibility', () => {
            const mockChannel = { appendLine: jest.fn() };

            // Should not throw
            expect(() => logger.setOutputChannel(mockChannel)).not.toThrow();
        });

        it('should accept any type without errors', () => {
            expect(() => logger.setOutputChannel(null)).not.toThrow();
            expect(() => logger.setOutputChannel(undefined)).not.toThrow();
            expect(() => logger.setOutputChannel('string')).not.toThrow();
            expect(() => logger.setOutputChannel(123)).not.toThrow();
        });
    });

    describe('error()', () => {
        beforeEach(() => {
            logger = new Logger('TestLogger');
            jest.clearAllMocks();
        });

        it('should delegate to debugLogger.error() with message', () => {
            logger.error('Error message');

            expect(mockDebugLogger.error).toHaveBeenCalledWith('Error message', undefined);
        });

        it('should delegate to debugLogger.error() with Error object', () => {
            const error = new Error('Test error');
            logger.error('Error message', error);

            expect(mockDebugLogger.error).toHaveBeenCalledWith('Error message', error);
        });

        it('should be no-op when debugLogger unavailable', () => {
            (getLogger as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Logger not initialized');
            });
            const loggerWithoutDebug = new Logger('TestLogger');
            jest.clearAllMocks();

            loggerWithoutDebug.error('Error message');

            expect(mockDebugLogger.error).not.toHaveBeenCalled();
        });
    });

    describe('warn()', () => {
        beforeEach(() => {
            logger = new Logger('TestLogger');
            jest.clearAllMocks();
        });

        it('should delegate to debugLogger.warn() with message', () => {
            logger.warn('Warning message');

            expect(mockDebugLogger.warn).toHaveBeenCalledWith('Warning message');
        });

        it('should log additional args to debug channel', () => {
            logger.warn('Warning message', 'extra', 'args');

            expect(mockDebugLogger.warn).toHaveBeenCalledWith('Warning message');
            expect(mockDebugLogger.debug).toHaveBeenCalledWith(
                'Warning details for: Warning message',
                ['extra', 'args']
            );
        });

        it('should not log debug when no additional args', () => {
            logger.warn('Warning message');

            expect(mockDebugLogger.debug).not.toHaveBeenCalled();
        });

        it('should be no-op when debugLogger unavailable', () => {
            (getLogger as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Logger not initialized');
            });
            const loggerWithoutDebug = new Logger('TestLogger');
            jest.clearAllMocks();

            loggerWithoutDebug.warn('Warning message');

            expect(mockDebugLogger.warn).not.toHaveBeenCalled();
        });
    });

    describe('info()', () => {
        beforeEach(() => {
            logger = new Logger('TestLogger');
            jest.clearAllMocks();
        });

        it('should delegate to debugLogger.info() with message', () => {
            logger.info('Info message');

            expect(mockDebugLogger.info).toHaveBeenCalledWith('Info message');
        });

        it('should log additional args to debug channel', () => {
            logger.info('Info message', { key: 'value' }, 42);

            expect(mockDebugLogger.info).toHaveBeenCalledWith('Info message');
            expect(mockDebugLogger.debug).toHaveBeenCalledWith(
                'Info details for: Info message',
                [{ key: 'value' }, 42]
            );
        });

        it('should not log debug when no additional args', () => {
            logger.info('Info message');

            expect(mockDebugLogger.debug).not.toHaveBeenCalled();
        });

        it('should be no-op when debugLogger unavailable', () => {
            (getLogger as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Logger not initialized');
            });
            const loggerWithoutDebug = new Logger('TestLogger');
            jest.clearAllMocks();

            loggerWithoutDebug.info('Info message');

            expect(mockDebugLogger.info).not.toHaveBeenCalled();
        });
    });

    describe('debug()', () => {
        beforeEach(() => {
            logger = new Logger('TestLogger');
            jest.clearAllMocks();
        });

        it('should delegate to debugLogger.debug() with message', () => {
            logger.debug('Debug message');

            expect(mockDebugLogger.debug).toHaveBeenCalledWith('Debug message', undefined);
        });

        it('should pass additional args to debugLogger.debug()', () => {
            logger.debug('Debug message', 'extra', 'data');

            expect(mockDebugLogger.debug).toHaveBeenCalledWith('Debug message', ['extra', 'data']);
        });

        it('should be no-op when debugLogger unavailable', () => {
            (getLogger as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Logger not initialized');
            });
            const loggerWithoutDebug = new Logger('TestLogger');
            jest.clearAllMocks();

            loggerWithoutDebug.debug('Debug message');

            expect(mockDebugLogger.debug).not.toHaveBeenCalled();
        });
    });

    describe('trace()', () => {
        beforeEach(() => {
            logger = new Logger('TestLogger');
            jest.clearAllMocks();
        });

        it('should delegate to debugLogger.trace() with message', () => {
            logger.trace('Trace message');

            expect(mockDebugLogger.trace).toHaveBeenCalledWith('Trace message', undefined);
        });

        it('should pass additional args to debugLogger.trace()', () => {
            logger.trace('Trace message', { detailed: true });

            expect(mockDebugLogger.trace).toHaveBeenCalledWith('Trace message', [{ detailed: true }]);
        });

        it('should be no-op when debugLogger unavailable', () => {
            (getLogger as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Logger not initialized');
            });
            const loggerWithoutDebug = new Logger('TestLogger');
            jest.clearAllMocks();

            loggerWithoutDebug.trace('Trace message');

            expect(mockDebugLogger.trace).not.toHaveBeenCalled();
        });
    });
});
