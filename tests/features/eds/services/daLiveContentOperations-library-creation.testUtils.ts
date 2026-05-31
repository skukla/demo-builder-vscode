/**
 * DA.live Content Operations - Block Library Creation: Shared Test Utilities
 *
 * Shared mock factory + component-definition.json builder for the block library
 * creation test suite. Not a `*.test.ts` file, so Jest does not run it directly.
 */

import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

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

    const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as Logger;

    const service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    const mockGetFileContent = jest.fn();

    return { service, mockTokenProvider, mockLogger, mockGetFileContent };
}

/**
 * Build a component-definition.json content string.
 * Note: GitHubFileOperations.getFileContent returns decoded content (not base64).
 */
export function createComponentDef(
    blocks: Array<{ title: string; id: string; unsafeHTML?: string }>,
): string {
    const content = {
        groups: [{
            id: 'blocks',
            title: 'Blocks',
            components: blocks.map(b => ({
                title: b.title,
                id: b.id,
                plugins: b.unsafeHTML ? { da: { unsafeHTML: b.unsafeHTML } } : undefined,
            })),
        }],
    };
    return JSON.stringify(content);
}
