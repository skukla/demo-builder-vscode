/**
 * Shared Test Utilities for PrerequisitesCacheManager Tests
 */

import { PrerequisiteStatus } from '@/features/prerequisites/services/types';

/**
 * Factory function to create mock PrerequisiteStatus objects
 */
export function createMockPrerequisiteStatus(
    overrides: Partial<PrerequisiteStatus> = {}
): PrerequisiteStatus {
    return {
        id: 'node',
        name: 'Node.js',
        description: 'JavaScript runtime',
        installed: true,
        optional: false,
        canInstall: true,
        ...overrides,
    };
}

/**
 * Create a mock prerequisite status for npm
 */
export function createNpmStatus(installed = true): PrerequisiteStatus {
    return createMockPrerequisiteStatus({
        id: 'npm',
        name: 'npm',
        description: 'Package manager',
        installed,
    });
}

/**
 * Create a mock prerequisite status for Adobe I/O CLI
 */
export function createAioCliStatus(installed = true, version = '10.0.0'): PrerequisiteStatus {
    return createMockPrerequisiteStatus({
        id: 'aio-cli',
        name: 'Adobe I/O CLI',
        description: 'Adobe I/O CLI',
        installed,
        version: installed ? version : undefined,
    });
}

/**
 * Wait for a specified duration (for TTL expiry tests)
 */
export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
