/**
 * Shared Test Helpers for ComponentManager Tests
 *
 * Contains common mocks, factories, and utilities used across
 * componentManager test files.
 */

import { Project } from '@/types';
import { Logger } from '@/types/logger';
import { CommandExecutor } from '@/core/shell';

/**
 * Creates a mock CommandExecutor with all methods stubbed
 */
export function createMockCommandExecutor(): CommandExecutor {
    return {
        execute: jest.fn(),
        executeExclusive: jest.fn(),
        pollUntilCondition: jest.fn(),
        waitForFileSystem: jest.fn(),
        executeSequence: jest.fn(),
        executeParallel: jest.fn(),
        queueCommand: jest.fn(),
        commandExists: jest.fn(),
        isPortAvailable: jest.fn(),
        dispose: jest.fn()
    } as unknown as CommandExecutor;
}

/**
 * Creates a mock Logger with all methods stubbed
 */
export function createMockLogger(): Logger {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    };
}

/**
 * Creates a test Project with default values
 */
export function createMockProject(overrides?: Partial<Project>): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        componentInstances: {},
        ...overrides
    };
}

/**
 * Sets up successful command execution mock
 */
export function mockSuccessfulExecution(mockCommandExecutor: CommandExecutor): void {
    (mockCommandExecutor.execute as jest.Mock).mockResolvedValue({
        stdout: 'success',
        stderr: '',
        code: 0,
        duration: 100
    });
}

/**
 * Mocks fs/promises module with common defaults
 */
export function setupFsMocks(): void {
    const fs = require('fs/promises');
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.rm as jest.Mock).mockResolvedValue(undefined);
}

/**
 * Mocks fs/promises to simulate file not found
 */
export function mockFileNotFound(): void {
    const fs = require('fs/promises');
    (fs.access as jest.Mock).mockRejectedValue(new Error('File not found'));
}

/**
 * Mocks fs/promises to simulate file exists
 */
export function mockFileExists(): void {
    const fs = require('fs/promises');
    (fs.access as jest.Mock).mockResolvedValue(undefined);
}
