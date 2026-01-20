/**
 * Tests for Template Patch Registry
 */

import {
    TEMPLATE_PATCHES,
    applyTemplatePatches,
    getPatchById,
    getAllPatches,
    type TemplatePatch,
    type PatchResult,
} from '@/features/eds/services/templatePatchRegistry';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock logger
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

describe('templatePatchRegistry', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('TEMPLATE_PATCHES', () => {
        it('should have at least one patch defined', () => {
            expect(TEMPLATE_PATCHES.length).toBeGreaterThan(0);
        });

        it('should have the header nav-tools defensive patch', () => {
            const headerPatch = TEMPLATE_PATCHES.find((p) => p.id === 'header-nav-tools-defensive');
            expect(headerPatch).toBeDefined();
            expect(headerPatch?.filePath).toBe('blocks/header/header.js');
        });

        it('should have valid patch structure for all patches', () => {
            for (const patch of TEMPLATE_PATCHES) {
                expect(patch.id).toBeTruthy();
                expect(patch.filePath).toBeTruthy();
                expect(patch.description).toBeTruthy();
                expect(patch.searchPattern).toBeTruthy();
                expect(patch.replacement).toBeTruthy();
            }
        });
    });

    describe('getPatchById', () => {
        it('should return patch when found', () => {
            const patch = getPatchById('header-nav-tools-defensive');
            expect(patch).toBeDefined();
            expect(patch?.id).toBe('header-nav-tools-defensive');
        });

        it('should return undefined when not found', () => {
            const patch = getPatchById('non-existent-patch');
            expect(patch).toBeUndefined();
        });
    });

    describe('getAllPatches', () => {
        it('should return all patches', () => {
            const all = getAllPatches();
            expect(all.length).toBe(TEMPLATE_PATCHES.length);
        });

        it('should return a copy (not mutate original)', () => {
            const all = getAllPatches();
            all.push({ id: 'test', filePath: '', description: '', searchPattern: '', replacement: '' });
            expect(TEMPLATE_PATCHES.length).not.toBe(all.length);
        });
    });

    describe('applyTemplatePatches', () => {
        const templateOwner = 'test-owner';
        const templateRepo = 'test-repo';
        const patchIds = ['header-nav-tools-defensive'];

        it('should return empty results when no patch IDs provided', async () => {
            const fileOverrides = new Map<string, string>();
            const results = await applyTemplatePatches(templateOwner, templateRepo, [], fileOverrides, mockLogger as any);

            expect(results.length).toBe(0);
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('No patches specified'));
        });

        it('should apply patch when search pattern is found', async () => {
            const originalContent = `
function decorateHeader() {
  const navTools = nav.querySelector('.nav-tools');
  navTools.append(wishlist);
}
`;
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(originalContent),
            });

            const fileOverrides = new Map<string, string>();
            const results = await applyTemplatePatches(templateOwner, templateRepo, patchIds, fileOverrides, mockLogger as any);

            expect(results.length).toBeGreaterThan(0);
            const headerResult = results.find((r) => r.patchId === 'header-nav-tools-defensive');
            expect(headerResult?.applied).toBe(true);

            // Verify the patch was applied to fileOverrides
            const patchedContent = fileOverrides.get('blocks/header/header.js');
            expect(patchedContent).toBeDefined();
            expect(patchedContent).toContain('let navTools = nav.querySelector');
            expect(patchedContent).toContain('if (!navTools)');
            expect(patchedContent).toContain("navTools.classList.add('nav-tools')");
        });

        it('should not apply patch when search pattern is not found', async () => {
            const originalContent = `
function decorateHeader() {
  // Already patched or different code
  let navTools = nav.querySelector('.nav-tools');
}
`;
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(originalContent),
            });

            const fileOverrides = new Map<string, string>();
            const results = await applyTemplatePatches(templateOwner, templateRepo, patchIds, fileOverrides, mockLogger as any);

            const headerResult = results.find((r) => r.patchId === 'header-nav-tools-defensive');
            expect(headerResult?.applied).toBe(false);
            expect(headerResult?.reason).toContain('Search pattern not found');
            expect(fileOverrides.has('blocks/header/header.js')).toBe(false);
        });

        it('should handle fetch failure gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            const fileOverrides = new Map<string, string>();
            const results = await applyTemplatePatches(templateOwner, templateRepo, patchIds, fileOverrides, mockLogger as any);

            const headerResult = results.find((r) => r.patchId === 'header-nav-tools-defensive');
            expect(headerResult?.applied).toBe(false);
            expect(headerResult?.reason).toContain('Failed to fetch file');
        });

        it('should handle network error gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const fileOverrides = new Map<string, string>();
            const results = await applyTemplatePatches(templateOwner, templateRepo, patchIds, fileOverrides, mockLogger as any);

            const headerResult = results.find((r) => r.patchId === 'header-nav-tools-defensive');
            expect(headerResult?.applied).toBe(false);
            expect(headerResult?.reason).toBe('Network error');
            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('should log info when patch is applied successfully', async () => {
            const originalContent = `const navTools = nav.querySelector('.nav-tools');`;
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(originalContent),
            });

            const fileOverrides = new Map<string, string>();
            await applyTemplatePatches(templateOwner, templateRepo, patchIds, fileOverrides, mockLogger as any);

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Applied patch'),
            );
        });

        it('should preserve existing fileOverrides', async () => {
            const originalContent = `const navTools = nav.querySelector('.nav-tools');`;
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(originalContent),
            });

            const fileOverrides = new Map<string, string>();
            fileOverrides.set('fstab.yaml', 'mountpoints:\n  /: https://example.com/');

            await applyTemplatePatches(templateOwner, templateRepo, patchIds, fileOverrides, mockLogger as any);

            // Original override should still be there
            expect(fileOverrides.get('fstab.yaml')).toBe('mountpoints:\n  /: https://example.com/');
            // New patch should also be there
            expect(fileOverrides.has('blocks/header/header.js')).toBe(true);
        });

        it('should warn about unknown patch IDs', async () => {
            const fileOverrides = new Map<string, string>();
            await applyTemplatePatches(templateOwner, templateRepo, ['unknown-patch-id'], fileOverrides, mockLogger as any);

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Unknown patch IDs'));
        });
    });
});
