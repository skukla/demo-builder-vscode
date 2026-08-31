/**
 * Shared Test Helpers for ComponentManager Tests
 *
 * Contains common mocks, factories, and utilities used across
 * componentManager test files.
 */

import { Project } from '@/types/base';
import { CommandExecutor } from '@/core/shell/commandExecutor';
import { createMockProject as createMockProjectBase } from '../../../helpers/projectFake';

/** Canonical command-executor fake (ADR-016). */
export { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

/** Canonical logger fake (ADR-016). Re-exported so existing imports keep working. */
export { createMockLogger } from '../../../helpers/loggerFake';

/**
 * Creates a test Project with default values
 */
export function createComponentServiceProject(overrides?: Partial<Project>): Project {
    return createMockProjectBase({
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        componentInstances: {},
        ...overrides
    } as never)
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
