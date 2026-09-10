/**
 * DebugLogger Path Validation Tests
 *
 * Tests for replayLogsFromFile security validation.
 * Ensures logs can only be replayed from trusted paths.
 */

import { mockDebugChannel, createDebugLoggerContext, resetMocks } from './debugLogger.testUtils';

import { promises as fs } from 'fs';
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
        // Hands every fs spy back to the real implementation. Load-bearing across
        // FILES, not just tests: `fs.promises` is a Node builtin, so one object is
        // shared by every suite a jest worker runs, and a mock left on it outlives
        // this file.
        jest.restoreAllMocks();
    });

    it('should reject paths outside ~/.demo-builder directory', async () => {
        await logger.replayLogsFromFile('/etc/passwd');

        // Debug channel receives info() with [debug] prefix
        expect(mockDebugChannel.info).toHaveBeenCalledWith(
            expect.stringContaining('Rejecting replay from untrusted path')
        );
    });

    it('should reject path traversal attempts', async () => {
        await logger.replayLogsFromFile('/Users/testuser/.demo-builder/../.ssh/id_rsa');

        // Debug channel receives info() with [debug] prefix
        expect(mockDebugChannel.info).toHaveBeenCalledWith(
            expect.stringContaining('Rejecting replay from untrusted path')
        );
    });

    // `jest.spyOn`, NOT `fs.readFile = jest.fn()`.
    //
    // This test used to assign the mocks straight onto `require('fs').promises`
    // and hand `readFile` back at the end — `unlink` was never handed back at
    // all, and even `readFile` only was when every assertion above it passed.
    //
    // `fs.promises` is a Node builtin: one object, shared by every suite a jest
    // worker runs, and outside the module registry jest resets between files. So
    // the abandoned `unlink` mock stayed on it for the rest of the worker's life,
    // and `restoreMocks` could not help — jest only restores spies it created.
    //
    // The next suite in that worker then did `jest.spyOn(fs, 'unlink')`, and
    // spyOn hands back a property that is ALREADY a mock function rather than
    // wrapping it, call history and all. That is how
    // `debugLogger-fileIO.test.ts` came to see four `unlink` calls it never made
    // and fail `expect(unlink).not.toHaveBeenCalled()` — but only when the two
    // files landed in the same worker in this order, which is why it read as
    // random and passed in isolation.
    it('should accept paths within ~/.demo-builder directory', async () => {
        jest.spyOn(fs, 'readFile').mockResolvedValue('');
        jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

        const validPath = '/Users/testuser/.demo-builder/session-logs.txt';
        await logger.replayLogsFromFile(validPath);

        // Debug channel receives info() calls
        const infoCalls = mockDebugChannel.info.mock.calls;
        const hasRejection = infoCalls.some((call: unknown[]) =>
            call.some((arg: unknown) => typeof arg === 'string' && arg.includes('Rejecting replay'))
        );
        expect(hasRejection).toBe(false);
    });
});
