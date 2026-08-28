import { promises as fsPromises } from 'fs';

/**
 * Shared test utilities for appDeployment tests
 */

export const mockFs = fsPromises as jest.Mocked<typeof fsPromises>;

export function createMockCommandManager() {
    return {
        execute: jest.fn(),
    };
}

/** Canonical logger fake (ADR-016). Re-exported so existing imports keep working. */
export { createMockLogger } from '../../../helpers/loggerFake';
