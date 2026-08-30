/**
 * DA.live Content Operations Tests - Utilities
 *
 * Tests for utility functions and additional operations:
 * - filterProductOverlays (filtering product overlay paths)
 * - deleteAllSiteContent (recursive deletion with progress)
 */

import {
    mockFetch,
} from './daLiveContentOperations.testUtils';
import { DaLiveContentOperations, type TokenProvider, filterProductOverlays } from '@/features/eds/services/daLive/daLiveContentOperations';
import type { Logger } from '@/types/logger';

global.fetch = mockFetch;

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
