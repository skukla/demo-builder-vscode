/**
 * DA.live Content Operations Tests - Utilities
 *
 * Tests for utility functions and additional operations:
 * - applyOrgConfig (preserving permissions sheet)
 * - filterProductOverlays (filtering product overlay paths)
 * - deleteAllSiteContent (recursive deletion with progress)
 */

import { DaLiveContentOperations, type TokenProvider, filterProductOverlays } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

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

describe('applyOrgConfig', () => {
    let service: DaLiveContentOperations;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();

        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
        };

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    });

    it('should preserve permissions sheet when updating data sheet', async () => {
        // Given: Existing org config with permissions AND data sheets
        const existingConfig = {
            ':version': 3,
            ':names': ['data', 'permissions'],
            ':type': 'multi-sheet',
            data: {
                total: 1,
                offset: 0,
                limit: 1,
                data: [{ key: 'old-key', value: 'old-value' }],
            },
            permissions: {
                total: 2,
                offset: 0,
                limit: 2,
                data: [
                    { path: '/+**', groups: 'owner@example.com', actions: 'write' },
                    { path: '/my-site/+**', groups: 'owner@example.com', actions: 'write' },
                ],
            },
        };

        // GET returns existing config
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue(existingConfig),
        });
        // POST succeeds
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
        });

        // When: applyOrgConfig updates the data sheet
        await service.applyOrgConfig('test-org', { 'new-key': 'new-value' });

        // Then: POST body should include the permissions sheet
        const postCall = mockFetch.mock.calls[1];
        const formData = postCall[1].body as FormData;
        const configStr = formData.get('config') as string;
        const config = JSON.parse(configStr);

        expect(config.permissions).toBeDefined();
        expect(config.permissions.data).toHaveLength(2);
        expect(config.permissions.data).toContainEqual(
            expect.objectContaining({ path: '/+**', groups: 'owner@example.com' }),
        );
    });

    it('should return error when GET returns non-404 HTTP error', async () => {
        // Given: GET returns 500 (server error), POST would succeed
        mockFetch
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            }) // GET fails with HTTP error
            .mockResolvedValueOnce({ ok: true, status: 200 }); // POST (should not be called)

        // When: applyOrgConfig is called
        const result = await service.applyOrgConfig('test-org', { key: 'value' });

        // Then: Should fail without writing
        expect(result.success).toBe(false);
        expect(result.error).toContain('500');
        // POST should NOT have been called
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not write permissions-free config when GET fails', async () => {
        // Given: GET fails (network error), but POST succeeds
        mockFetch
            .mockRejectedValueOnce(new Error('Network timeout')) // GET fails
            .mockResolvedValueOnce({ ok: true, status: 200 }); // POST succeeds

        // When: applyOrgConfig is called
        const result = await service.applyOrgConfig('test-org', { key: 'value' });

        // Then: Should either fail (not write), OR if it wrote, the config must
        // not be a bare skeleton missing the permissions sheet.
        // The correct behavior: return an error instead of overwriting.
        expect(result.success).toBe(false);
    });
});

describe('filterProductOverlays', () => {
    it('should keep /products/default', () => {
        const paths = ['/about', '/products/default', '/contact'];
        const result = filterProductOverlays(paths);
        expect(result).toContain('/products/default');
    });

    it('should keep paths under /products/default/', () => {
        const paths = ['/products/default/variant1', '/products/default/info'];
        const result = filterProductOverlays(paths);
        expect(result).toEqual(['/products/default/variant1', '/products/default/info']);
    });

    it('should filter out /products/sku-123 overlay paths', () => {
        const paths = ['/about', '/products/sku-123', '/products/abc-widget', '/contact'];
        const result = filterProductOverlays(paths);
        expect(result).toEqual(['/about', '/contact']);
        expect(result).not.toContain('/products/sku-123');
        expect(result).not.toContain('/products/abc-widget');
    });

    it('should filter /products/overlay-page paths', () => {
        const paths = ['/products/overlay-page', '/products/another-overlay'];
        const result = filterProductOverlays(paths);
        expect(result).toEqual([]);
    });

    it('should keep non-product paths unchanged', () => {
        const paths = ['/about', '/contact', '/blog/post-1', '/categories/clothing'];
        const result = filterProductOverlays(paths);
        expect(result).toEqual(['/about', '/contact', '/blog/post-1', '/categories/clothing']);
    });

    it('should handle empty paths array', () => {
        const paths: string[] = [];
        const result = filterProductOverlays(paths);
        expect(result).toEqual([]);
    });

    it('should handle mixed content with both product default and overlays', () => {
        const paths = [
            '/about',
            '/products/default',
            '/products/default/info',
            '/products/sku-apple-watch',
            '/products/sku-iphone-15',
            '/contact',
        ];
        const result = filterProductOverlays(paths);
        expect(result).toEqual([
            '/about',
            '/products/default',
            '/products/default/info',
            '/contact',
        ]);
    });
});

describe('deleteAllSiteContent', () => {
    let service: DaLiveContentOperations;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    beforeEach(() => {
        mockFetch.mockReset();
        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        };
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;
        service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    });

    it('should collect paths then delete files in batch followed by directories', async () => {
        // DA.live API returns paths with org/site prefix — code must strip it
        mockFetch
            // listDirectory('/')
            .mockResolvedValueOnce({
                ok: true, status: 200, statusText: 'OK',
                headers: { get: () => null } as unknown as Headers,
                json: jest.fn().mockResolvedValue([
                    { name: 'index', path: '/test-org/test-site/index.html', ext: 'html' },
                    { name: 'pages', path: '/test-org/test-site/pages' },
                ]),
            } as unknown as Response)
            // listDirectory('/pages') (recurse into directory — using stripped relative path)
            .mockResolvedValueOnce({
                ok: true, status: 200, statusText: 'OK',
                headers: { get: () => null } as unknown as Headers,
                json: jest.fn().mockResolvedValue([
                    { name: 'about', path: '/test-org/test-site/pages/about.html', ext: 'html' },
                ]),
            } as unknown as Response)
            // Phase 2: delete files (/index.html and /pages/about.html in batch)
            .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null } } as unknown as Response)
            .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null } } as unknown as Response)
            // Phase 3: delete directory (/pages)
            .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null } } as unknown as Response)
            // Phase 4: delete site root
            .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null } } as unknown as Response);

        const result = await service.deleteAllSiteContent('test-org', 'test-site');

        expect(result.success).toBe(true);
        expect(result.deletedCount).toBe(2); // 2 files (directories don't count)

        // Verify delete calls used relative paths (no double-prefix)
        const deleteCalls = mockFetch.mock.calls.filter(
            (call: [string, RequestInit?]) => call[1]?.method === 'DELETE',
        );
        expect(deleteCalls).toHaveLength(4); // 2 files + 1 directory + 1 site root
        expect(deleteCalls[0][0]).toBe('https://admin.da.live/source/test-org/test-site/index.html');
        expect(deleteCalls[1][0]).toBe('https://admin.da.live/source/test-org/test-site/pages/about.html');
        expect(deleteCalls[2][0]).toBe('https://admin.da.live/source/test-org/test-site/pages');
        expect(deleteCalls[3][0]).toBe('https://admin.da.live/source/test-org/test-site/');
    });

    it('should return success with 0 deleted for empty site and delete site root', async () => {
        // Root returns empty
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200, statusText: 'OK',
            headers: { get: () => null } as unknown as Headers,
            json: jest.fn().mockResolvedValue([]),
        } as unknown as Response)
        // Site root deletion (best-effort)
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null } } as unknown as Response);

        const result = await service.deleteAllSiteContent('test-org', 'test-site');

        expect(result.success).toBe(true);
        expect(result.deletedCount).toBe(0);

        // Should still delete the site root entry
        const deleteCalls = mockFetch.mock.calls.filter(
            (call: [string, RequestInit?]) => call[1]?.method === 'DELETE',
        );
        expect(deleteCalls).toHaveLength(1);
        expect(deleteCalls[0][0]).toBe('https://admin.da.live/source/test-org/test-site/');
    });

    it('should report progress for each deleted file', async () => {
        mockFetch
            .mockResolvedValueOnce({
                ok: true, status: 200, statusText: 'OK',
                headers: { get: () => null } as unknown as Headers,
                json: jest.fn().mockResolvedValue([
                    { name: 'a', path: '/org/site/a.html', ext: 'html' },
                    { name: 'b', path: '/org/site/b.html', ext: 'html' },
                ]),
            } as unknown as Response)
            .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null } } as unknown as Response)
            .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null } } as unknown as Response)
            // Site root deletion
            .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null } } as unknown as Response);

        const progress: Array<{ deleted: number; current: string }> = [];
        await service.deleteAllSiteContent('org', 'site', (info) => progress.push(info));

        expect(progress).toHaveLength(2);
        // Progress reports relative paths (prefix stripped)
        expect(progress[0]).toEqual({ deleted: 1, current: '/a.html' });
        expect(progress[1]).toEqual({ deleted: 2, current: '/b.html' });
    });

    it('should handle errors gracefully', async () => {
        // fetchWithRetry retries 3 times, so reject all attempts
        mockFetch
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'));

        const result = await service.deleteAllSiteContent('org', 'site');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Network error');
    });
});
