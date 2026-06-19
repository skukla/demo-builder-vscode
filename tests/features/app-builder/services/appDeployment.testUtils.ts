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

export function createMockLogger() {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}
