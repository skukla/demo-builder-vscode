/**
 * DA.live Content Operations Tests
 *
 * Tests for DaLiveContentOperations service, specifically the
 * copyMediaFromSource() method for copying media files.
 */

import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';
import type { DaLiveEntry, DaLiveProgressCallback } from '@/features/eds/services/types';

// Mock the timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('DaLiveContentOperations', () => {
    let service: DaLiveContentOperations;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock token provider
        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
        };

        // Create mock logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    });

    /**
     * Helper to create mock DA.live directory entries
     */
    function createMockEntry(name: string, path: string, ext?: string): DaLiveEntry {
        const entry: DaLiveEntry = { name, path };
        if (ext) {
            entry.ext = ext;
            entry.lastModified = Date.now();
        }
        return entry;
    }

    /**
     * Helper to mock fetch responses
     */
    function mockFetchResponse(status: number, body?: unknown): Response {
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
            headers: new Map() as unknown as Headers,
            json: jest.fn().mockResolvedValue(body),
            blob: jest.fn().mockResolvedValue(new Blob(['test content'])),
            text: jest.fn().mockResolvedValue(''),
        } as unknown as Response;
    }

    describe('copyMediaFromSource', () => {
        const sourceOrg = 'demo-system-stores';
        const sourceSite = 'accs-citisignal';
        const destOrg = 'user-org';
        const destSite = 'user-site';

        it('should copy media files from /media/ folder', async () => {
            // Given: Source has media files in /media/ folder
            const mediaEntries: DaLiveEntry[] = [
                createMockEntry('hero', '/demo-system-stores/accs-citisignal/media/hero.png', 'png'),
                createMockEntry('logo', '/demo-system-stores/accs-citisignal/media/logo.svg', 'svg'),
            ];

            // Mock listDirectory for /media
            mockFetch
                .mockResolvedValueOnce(mockFetchResponse(200, mediaEntries)) // listDirectory(/media)
                // Mock copySingleFile for each file (source fetch + dest POST)
                .mockResolvedValueOnce(mockFetchResponse(200)) // fetch hero.png from source
                .mockResolvedValueOnce(mockFetchResponse(200)) // POST hero.png to dest
                .mockResolvedValueOnce(mockFetchResponse(200)) // fetch logo.svg from source
                .mockResolvedValueOnce(mockFetchResponse(200)); // POST logo.svg to dest

            // When: copyMediaFromSource is called
            const result = await service.copyMediaFromSource(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
            );

            // Then: Both files are copied successfully
            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(2);
            expect(result.failedFiles).toHaveLength(0);
            expect(result.totalFiles).toBe(2);
        });

        it('should handle 404 when /media/ folder does not exist', async () => {
            // Given: Source has no /media/ folder (404)
            mockFetch.mockResolvedValueOnce(mockFetchResponse(404));

            // When: copyMediaFromSource is called
            const result = await service.copyMediaFromSource(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
            );

            // Then: Returns success with empty lists (graceful handling)
            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(0);
            expect(result.failedFiles).toHaveLength(0);
            expect(result.totalFiles).toBe(0);
        });

        it('should recursively copy nested folders within /media/', async () => {
            // Given: Source has nested folders in /media/
            const mediaEntries: DaLiveEntry[] = [
                createMockEntry('hero', '/demo-system-stores/accs-citisignal/media/hero.png', 'png'),
                createMockEntry('products', '/demo-system-stores/accs-citisignal/media/products'), // folder (no ext)
            ];

            const nestedEntries: DaLiveEntry[] = [
                createMockEntry('product1', '/demo-system-stores/accs-citisignal/media/products/product1.jpg', 'jpg'),
            ];

            // Mock order: ALL directory listings happen FIRST (recursive collection),
            // THEN all file copies happen
            mockFetch
                .mockResolvedValueOnce(mockFetchResponse(200, mediaEntries)) // listDirectory(/media)
                .mockResolvedValueOnce(mockFetchResponse(200, nestedEntries)) // listDirectory(/media/products) - recursive
                // Now all files are collected, copying begins:
                .mockResolvedValueOnce(mockFetchResponse(200)) // fetch hero.png from source
                .mockResolvedValueOnce(mockFetchResponse(200)) // POST hero.png to dest
                .mockResolvedValueOnce(mockFetchResponse(200)) // fetch product1.jpg from source
                .mockResolvedValueOnce(mockFetchResponse(200)); // POST product1.jpg to dest

            // When: copyMediaFromSource is called
            const result = await service.copyMediaFromSource(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
            );

            // Then: All files including nested are copied
            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(2);
            expect(result.totalFiles).toBe(2);
        });

        it('should invoke progress callback correctly', async () => {
            // Given: Source has media files
            const mediaEntries: DaLiveEntry[] = [
                createMockEntry('hero', '/demo-system-stores/accs-citisignal/media/hero.png', 'png'),
                createMockEntry('logo', '/demo-system-stores/accs-citisignal/media/logo.svg', 'svg'),
            ];

            mockFetch
                .mockResolvedValueOnce(mockFetchResponse(200, mediaEntries))
                .mockResolvedValueOnce(mockFetchResponse(200))
                .mockResolvedValueOnce(mockFetchResponse(200))
                .mockResolvedValueOnce(mockFetchResponse(200))
                .mockResolvedValueOnce(mockFetchResponse(200));

            const progressCallback: DaLiveProgressCallback = jest.fn();

            // When: copyMediaFromSource is called with progress callback
            await service.copyMediaFromSource(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                progressCallback,
            );

            // Then: Progress callback is invoked with correct values
            expect(progressCallback).toHaveBeenCalled();

            // Check that progress reports include correct total and processed counts
            const calls = (progressCallback as jest.Mock).mock.calls;
            expect(calls.length).toBeGreaterThanOrEqual(2);

            // First call should be processing first file
            expect(calls[0][0]).toMatchObject({
                processed: 0,
                total: 2,
            });

            // Final call should show completion
            const lastCall = calls[calls.length - 1][0];
            expect(lastCall.processed).toBe(2);
            expect(lastCall.total).toBe(2);
            expect(lastCall.percentage).toBe(100);
        });

        it('should return partial success when some files fail to copy', async () => {
            // Given: Source has media files but one fails to copy
            const mediaEntries: DaLiveEntry[] = [
                createMockEntry('hero', '/demo-system-stores/accs-citisignal/media/hero.png', 'png'),
                createMockEntry('logo', '/demo-system-stores/accs-citisignal/media/logo.svg', 'svg'),
            ];

            mockFetch
                .mockResolvedValueOnce(mockFetchResponse(200, mediaEntries)) // listDirectory
                // Copy hero.png - success
                .mockResolvedValueOnce(mockFetchResponse(200)) // fetch
                .mockResolvedValueOnce(mockFetchResponse(200)) // POST
                // Copy logo.svg - fails
                .mockResolvedValueOnce(mockFetchResponse(200)) // fetch succeeds
                .mockResolvedValueOnce(mockFetchResponse(500)); // POST fails

            // When: copyMediaFromSource is called
            const result = await service.copyMediaFromSource(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
            );

            // Then: Returns partial success
            expect(result.success).toBe(false); // Not all files succeeded
            expect(result.copiedFiles).toHaveLength(1);
            expect(result.failedFiles).toHaveLength(1);
            expect(result.failedFiles[0].path).toContain('logo');
            expect(result.totalFiles).toBe(2);
        });

        it('should throw DaLiveAuthError when not authenticated', async () => {
            // Given: Token provider returns null (not authenticated)
            (mockTokenProvider.getAccessToken as jest.Mock).mockResolvedValue(null);

            // When/Then: copyMediaFromSource throws auth error
            await expect(
                service.copyMediaFromSource(
                    { org: sourceOrg, site: sourceSite },
                    destOrg,
                    destSite,
                ),
            ).rejects.toThrow('Not authenticated');
        });
    });
});
