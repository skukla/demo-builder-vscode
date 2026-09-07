/**
 * `filterProductOverlays` — the pure overlay filter.
 *
 * Split out of `daLiveContentOperations-utils.test.ts` on 2026-09-07 (PL-45).
 * The function is DECLARED in `daLiveContentCopy.ts`; `daLiveContentOperations.ts`
 * only re-exports it, so these tests were credited to a module they never
 * constrain. `deleteAllSiteContent` is a method on the class and stayed behind.
 */

import { filterProductOverlays } from '@/features/eds/services/daLive/daLiveContentCopy';

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
