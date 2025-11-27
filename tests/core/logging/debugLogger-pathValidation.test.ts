/**
 * DebugLogger Path Validation Tests
 *
 * Tests for replayLogsFromFile security validation.
 * Ensures logs can only be replayed from trusted paths.
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

describe('DebugLogger - replayLogsFromFile Path Validation', () => {
    let logger: DebugLogger;
    let mockContext: vscode.ExtensionContext;
    const originalEnv = process.env;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        mockContext = createMockContext();
        logger = new DebugLogger(mockContext);
        jest.clearAllMocks();
        process.env = { ...originalEnv, HOME: '/Users/testuser' };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should reject paths outside ~/.demo-builder directory', async () => {
        await logger.replayLogsFromFile('/etc/passwd');

        expect(mockDebugChannel.debug).toHaveBeenCalledWith(
            expect.stringContaining('Rejecting replay from untrusted path')
        );
    });

    it('should reject path traversal attempts', async () => {
        await logger.replayLogsFromFile(
            '/Users/testuser/.demo-builder/../.ssh/id_rsa'
        );

        expect(mockDebugChannel.debug).toHaveBeenCalledWith(
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

        const debugCalls = mockDebugChannel.debug.mock.calls;
        const hasRejection = debugCalls.some((call: unknown[]) =>
            call.some(
                (arg: unknown) =>
                    typeof arg === 'string' && arg.includes('Rejecting replay')
            )
        );
        expect(hasRejection).toBe(false);

        fs.readFile = originalReadFile;
    });
});
