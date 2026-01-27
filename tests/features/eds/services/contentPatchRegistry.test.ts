/**
 * Tests for Content Patch Registry
 *
 * Validates loading, matching, and applying content patches to HTML content.
 */

import {
    CONTENT_PATCHES,
    getContentPatchById,
    applyContentPatches,
} from '@/features/eds/services/contentPatchRegistry';
import type { Logger } from '@/types';

// Mock logger
const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('CONTENT_PATCHES', () => {
    it('loads all patches from config', () => {
        expect(CONTENT_PATCHES.length).toBe(5);
    });

    it('each patch has required fields', () => {
        for (const patch of CONTENT_PATCHES) {
            expect(patch.id).toBeTruthy();
            expect(patch.pagePath).toBeTruthy();
            expect(patch.description).toBeTruthy();
            expect(patch.searchPattern).toBeTruthy();
            expect(patch.replacement).toBeTruthy();
        }
    });

    it('includes index-product-teaser-sku patch', () => {
        const patch = CONTENT_PATCHES.find(p => p.id === 'index-product-teaser-sku');
        expect(patch).toBeDefined();
        expect(patch!.pagePath).toBe('/');
        expect(patch!.searchPattern).toBe('Orchard7');
        expect(patch!.replacement).toBe('apple-iphone-se/iphone-se');
    });
});

describe('getContentPatchById', () => {
    it('returns patch by ID', () => {
        const patch = getContentPatchById('phones-product-teaser-sku');
        expect(patch).toBeDefined();
        expect(patch!.pagePath).toBe('/phones');
    });

    it('returns undefined for unknown ID', () => {
        expect(getContentPatchById('nonexistent')).toBeUndefined();
    });
});

describe('applyContentPatches', () => {
    it('returns unmodified HTML when no patch IDs provided', () => {
        const html = '<div>Orchard7</div>';
        const result = applyContentPatches(html, '/', [], mockLogger);
        expect(result.html).toBe(html);
        expect(result.results).toEqual([]);
    });

    it('applies matching patch to correct page path', () => {
        const html = '<div>Orchard7</div>';
        const result = applyContentPatches(
            html,
            '/',
            ['index-product-teaser-sku'],
            mockLogger,
        );
        expect(result.html).toBe('<div>apple-iphone-se/iphone-se</div>');
        expect(result.results).toHaveLength(1);
        expect(result.results[0].applied).toBe(true);
        expect(result.results[0].patchId).toBe('index-product-teaser-sku');
    });

    it('skips patch when page path does not match', () => {
        const html = '<div>Orchard7</div>';
        const result = applyContentPatches(
            html,
            '/about',
            ['index-product-teaser-sku'],
            mockLogger,
        );
        expect(result.html).toBe(html);
        expect(result.results).toEqual([]);
    });

    it('reports not applied when search pattern not found', () => {
        const html = '<div>no match here</div>';
        const result = applyContentPatches(
            html,
            '/',
            ['index-product-teaser-sku'],
            mockLogger,
        );
        expect(result.html).toBe(html);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].applied).toBe(false);
        expect(result.results[0].reason).toContain('not found');
    });

    it('applies multiple patches to different pages', () => {
        // Test /phones page
        const phonesHtml = '<div>Orchard1-1</div>';
        const phonesResult = applyContentPatches(
            phonesHtml,
            '/phones',
            ['index-product-teaser-sku', 'phones-product-teaser-sku'],
            mockLogger,
        );
        expect(phonesResult.html).toBe('<div>apple-iphone-se/iphone-se</div>');
        // Only phones patch should match /phones path
        expect(phonesResult.results).toHaveLength(1);
        expect(phonesResult.results[0].patchId).toBe('phones-product-teaser-sku');
    });

    it('warns about unknown patch IDs', () => {
        const html = '<div>Orchard7</div>';
        applyContentPatches(
            html,
            '/',
            ['index-product-teaser-sku', 'unknown-patch'],
            mockLogger,
        );
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('unknown-patch'),
        );
    });

    it('applies smart-watches category patch', () => {
        const html = '<div class="product-list-page"><p>38</p></div>';
        const result = applyContentPatches(
            html,
            '/smart-watches',
            ['smart-watches-category-id'],
            mockLogger,
        );
        expect(result.html).toBe('<div class="product-list-page"><p>5</p></div>');
        expect(result.results[0].applied).toBe(true);
    });

    it('applies smart-watches url-path patch', () => {
        const html = '<div><div>urlPath</div>\n      <div>smart-watches</div></div>';
        const result = applyContentPatches(
            html,
            '/smart-watches',
            ['smart-watches-url-path'],
            mockLogger,
        );
        expect(result.html).toBe('<div><div>urlPath</div>\n      <div>watches</div></div>');
        expect(result.results[0].applied).toBe(true);
    });

    it('applies phones heading reorder patch', () => {
        const html = [
            '<div>',
            '  <div class="product-list-page">',
            '    <div>',
            '      <div>category</div>',
            '      <div>41</div>',
            '    </div>',
            '    <div>',
            '      <div>urlPath</div>',
            '      <div>phones</div>',
            '    </div>',
            '  </div>',
            '  <h1 id="phones">Phones</h1>',
            '  <div class="enrichment">',
            '</div>',
        ].join('\n');
        const result = applyContentPatches(
            html,
            '/phones',
            ['phones-heading-reorder'],
            mockLogger,
        );
        expect(result.html).toContain('<h1 id="phones">Phones</h1>\n  <div class="product-list-page">');
        expect(result.results[0].applied).toBe(true);
    });
});
