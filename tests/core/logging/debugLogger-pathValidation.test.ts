/**
 * DebugLogger Path Validation Tests
 *
 * Tests for replayLogsFromFile security validation.
 * Ensures logs can only be replayed from trusted paths.
 */

import {
    mockDebugChannel,
    createDebugLoggerContext,
    resetMocks,
} from './debugLogger.testUtils';

import * as vscode from 'vscode';
import { DebugLogger, _resetLoggerForTesting } from '@/core/logging/debugLogger';

describe('DebugLogger - replayLogsFromFile Path Validation', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;
    const originalEnv = process.env;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        mockContext = createDebugLoggerContext();
        logger = new DebugLogger(mockContext);
        jest.clearAllMocks();
        process.env = { ...originalEnv, HOME: '/Users/testuser' };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should reject paths outside ~/.demo-builder directory', async () => {
        await logger.replayLogsFromFile('/etc/passwd');

        // Debug channel receives info() with [debug] prefix
        expect(mockDebugChannel.info).toHaveBeenCalledWith(
            expect.stringContaining('Rejecting replay from untrusted path')
        );
    });

    it('should reject path traversal attempts', async () => {
        await logger.replayLogsFromFile(
            '/Users/testuser/.demo-builder/../.ssh/id_rsa'
        );

        // Debug channel receives info() with [debug] prefix
        expect(mockDebugChannel.info).toHaveBeenCalledWith(
            expect.stringContaining('Rejecting replay from untrusted path')
        );
    });

    it('should accept paths within ~/.demo-builder directory', async () => {
        const fs = require('fs').promises;
        const originalReadFile = fs.readFile;
        fs.readFile = jest.fn().mockResolvedValue('');
        fs.unlink = jest.fn().mockResolvedValue(undefined);

        const validPath = '/Users/testuser/.demo-builder/session-logs.txt';
        await logger.replayLogsFromFile(validPath);

        // Debug channel receives info() calls
        const infoCalls = mockDebugChannel.info.mock.calls;
        const hasRejection = infoCalls.some((call: unknown[]) =>
            call.some(
                (arg: unknown) =>
                    typeof arg === 'string' && arg.includes('Rejecting replay')
            )
        );
        expect(hasRejection).toBe(false);

        fs.readFile = originalReadFile;
    });
});
