/**
 * DA.live Content Operations - Block Library Creation: Shared Test Utilities
 *
 * Shared mock factory + component-definition.json builder for the block library
 * creation test suite. Not a `*.test.ts` file, so Jest does not run it directly.
 */

import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

export interface LibraryCreationMocks {
    service: DaLiveContentOperations;
    mockTokenProvider: TokenProvider;
    mockLogger: Logger;
    mockGetFileContent: jest.Mock;
}

/** Build a fresh set of mocks + a configured service for one test. */
export function createLibraryCreationMocks(): LibraryCreationMocks {
    const mockTokenProvider: TokenProvider = {
        getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
    };

    const mockLogger = createMockLogger() as unknown as Logger;

    const service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    const mockGetFileContent = jest.fn();

    return { service, mockTokenProvider, mockLogger, mockGetFileContent };
}

/** Byte-identical to the blockCollectionHelpers one; re-exported (ADR-016). */
export { createComponentDef } from '../blockCollectionHelpers.testUtils';
