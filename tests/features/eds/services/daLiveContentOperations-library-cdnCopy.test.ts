/**
 * DA.live Content Operations Tests - CDN Copy & Verification
 *
 * Tests for createBlockLibraryFromTemplate:
 * - copyBlockDocPagesFromSources (CDN-based copy for blocks without unsafeHTML)
 * - Verification logging (filtering blocks by documentation pages)
 */

import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLiveContentOperations';
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

describe('createBlockLibraryFromTemplate', () => {
    let service: DaLiveContentOperations;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;
    let mockGetFileContent: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

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
        mockGetFileContent = jest.fn();
    });

    const destOrg = 'user-org';
    const destSite = 'user-site';
    const templateOwner = 'hlxsites';
    const templateRepo = 'citisignal';

    /** Helper to create component-definition.json content */
    function createComponentDef(blocks: Array<{ title: string; id: string; unsafeHTML?: string }>) {
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

    describe('copyBlockDocPagesFromSources (CDN-based copy)', () => {
        /**
         * Helper mock that handles the CDN-based copy flow:
         * 1. copySingleFile: HEAD to check spreadsheet (.json) -> 404
         * 2. copySingleFile: GET .plain.html from public CDN -> returns HTML
         * 3. copySingleFile: POST to /source/ on destination -> creates doc page
         * 4. ensureBlockDocPages: HEAD checks for blocks with exampleHtml
         * 5. getBlocksWithDocs: HEAD checks for ALL blocks
         * 6. createBlockLibrary: DELETE + POST config + POST spreadsheet
         */
        function createCdnCopyMockFetch(config: {
            cdnAvailableBlocks: string[];
        }) {
            const { cdnAvailableBlocks } = config;
            const createdPages = new Set<string>();

            return async (url: string, options?: RequestInit) => {
                if (url.includes('.aem.live/') && url.endsWith('.json') && options?.method === 'HEAD') {
                    return { ok: false, status: 404 } as Response;
                }

                if (url.includes('.aem.live/') && url.includes('.plain.html')) {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.plain\.html/);
                    if (match && cdnAvailableBlocks.includes(match[1])) {
                        return {
                            ok: true,
                            status: 200,
                            headers: new Headers({ 'content-type': 'text/html' }),
                            text: async () => `<div class="${match[1]}">Block content</div>`,
                            blob: async () => new Blob([`<div class="${match[1]}">Block content</div>`]),
                        } as unknown as Response;
                    }
                    return { ok: false, status: 404 } as Response;
                }

                if (url.includes('/source/') && url.includes('.da/library/blocks/') && options?.method === 'POST') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) createdPages.add(match[1]);
                    return { ok: true, status: 200 } as Response;
                }

                if (url.includes('.da/library/blocks/') && url.endsWith('.html') && options?.method === 'HEAD') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) {
                        const exists = createdPages.has(match[1]);
                        return { ok: exists, status: exists ? 200 : 404 } as Response;
                    }
                }

                if (url.includes('/config/') && options?.method === 'GET') {
                    return { ok: true, status: 200, json: async () => ({}) } as Response;
                }
                if (url.includes('/config/') && options?.method === 'POST') {
                    return { ok: true, status: 200 } as Response;
                }
                if (options?.method === 'DELETE') {
                    return { ok: true, status: 200 } as Response;
                }
                if (url.includes('.json') && options?.method === 'POST') {
                    return { ok: true, status: 200 } as Response;
                }

                return { ok: true, status: 200 } as Response;
            };
        }

        it('should copy doc pages from CDN for blocks without unsafeHTML', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Cards', id: 'cards', unsafeHTML: '<div class="cards">Example</div>' },
                    { title: 'Hero V2', id: 'hero-v2' },
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createCdnCopyMockFetch({
                cdnAvailableBlocks: ['hero-v2'],
            }));

            const contentSources = [{ org: 'demo-system-stores', site: 'accs-citisignal' }];

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
                contentSources,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);
            expect(result.paths).toContain('.da/library/blocks/cards');
            expect(result.paths).toContain('.da/library/blocks/hero-v2');

            const cdnFetches = mockFetch.mock.calls.filter(
                (call: [string, RequestInit]) =>
                    call[0].includes('aem.live') && call[0].includes('.plain.html'),
            );
            expect(cdnFetches.some((c: [string]) => c[0].includes('hero-v2'))).toBe(true);
            expect(cdnFetches.some((c: [string]) => c[0].includes('cards'))).toBe(false);
        });

        it('should try multiple content sources in order', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero V2', id: 'hero-v2' },
                ]),
                sha: 'abc123',
            });

            const createdPages = new Set<string>();
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (url.includes('.aem.live/') && url.endsWith('.json') && options?.method === 'HEAD') {
                    return { ok: false, status: 404 } as Response;
                }
                if (url.includes('.aem.live/') && url.includes('.plain.html')) {
                    if (url.includes('isle5')) {
                        return {
                            ok: true, status: 200,
                            headers: new Headers({ 'content-type': 'text/html' }),
                            text: async () => '<div class="hero-v2">Content</div>',
                        } as unknown as Response;
                    }
                    return { ok: false, status: 404 } as Response;
                }
                if (url.includes('/source/') && url.includes('.da/library/blocks/') && options?.method === 'POST') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) createdPages.add(match[1]);
                    return { ok: true, status: 200 } as Response;
                }
                if (url.includes('.da/library/blocks/') && url.endsWith('.html') && options?.method === 'HEAD') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) return { ok: createdPages.has(match[1]), status: createdPages.has(match[1]) ? 200 : 404 } as Response;
                }
                if (url.includes('/config/') && options?.method === 'GET') {
                    return { ok: true, status: 200, json: async () => ({}) } as Response;
                }
                if (url.includes('/config/') && options?.method === 'POST') return { ok: true, status: 200 } as Response;
                if (options?.method === 'DELETE') return { ok: true, status: 200 } as Response;
                if (url.includes('.json') && options?.method === 'POST') return { ok: true, status: 200 } as Response;
                return { ok: true, status: 200 } as Response;
            });

            const contentSources = [
                { org: 'first-org', site: 'first-site' },
                { org: 'stephen-garner-adobe', site: 'isle5' },
            ];

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
                contentSources,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
            expect(result.paths).toContain('.da/library/blocks/hero-v2');
        });

        it('should only attempt CDN copy for installedBlockIds, skipping native template blocks', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Cards', id: 'cards' },
                    { title: 'Hero', id: 'hero' },
                    { title: 'Commerce Cart', id: 'commerce-cart' },
                    { title: 'Tabs', id: 'tabs' },
                ]),
                sha: 'abc123',
            });

            mockFetch.mockImplementation(createCdnCopyMockFetch({
                cdnAvailableBlocks: ['commerce-cart', 'tabs'],
            }));

            const contentSources = [{ org: 'demo-system-stores', site: 'accs-citisignal' }];
            const installedBlockIds = ['commerce-cart', 'tabs'];

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
                contentSources, installedBlockIds,
            );

            expect(result.success).toBe(true);

            const cdnFetches = mockFetch.mock.calls.filter(
                (call: [string, RequestInit]) =>
                    call[0].includes('aem.live') && call[0].includes('.plain.html'),
            );

            expect(cdnFetches.some((c: [string]) => c[0].includes('commerce-cart'))).toBe(true);
            expect(cdnFetches.some((c: [string]) => c[0].includes('tabs'))).toBe(true);

            expect(cdnFetches.some((c: [string]) => c[0].includes('/cards.'))).toBe(false);
            expect(cdnFetches.some((c: [string]) => c[0].includes('/hero.'))).toBe(false);
        });

        it('should fall back to all blocks when installedBlockIds is not provided', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Cards', id: 'cards' },
                    { title: 'Hero V2', id: 'hero-v2' },
                ]),
                sha: 'abc123',
            });

            mockFetch.mockImplementation(createCdnCopyMockFetch({
                cdnAvailableBlocks: ['cards', 'hero-v2'],
            }));

            const contentSources = [{ org: 'demo-system-stores', site: 'accs-citisignal' }];

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
                contentSources,
            );

            expect(result.success).toBe(true);

            const cdnFetches = mockFetch.mock.calls.filter(
                (call: [string, RequestInit]) =>
                    call[0].includes('aem.live') && call[0].includes('.plain.html'),
            );
            expect(cdnFetches.some((c: [string]) => c[0].includes('cards'))).toBe(true);
            expect(cdnFetches.some((c: [string]) => c[0].includes('hero-v2'))).toBe(true);
        });

        it('should skip CDN copy when no libraryContentSources provided', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero V2', id: 'hero-v2' },
                ]),
                sha: 'abc123',
            });
            mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(0);
        });
    });

    describe('verification logging', () => {
        /**
         * Helper to create a mock fetch that tracks URL patterns
         */
        function createVerificationMockFetch(config: {
            configExists?: boolean;
            configHasLibrary?: boolean;
            blocksSheetExists?: boolean;
            blockDocsExist?: Record<string, boolean>;
        }) {
            const {
                configExists = true,
                configHasLibrary = true,
                blocksSheetExists = true,
                blockDocsExist = {},
            } = config;

            return async (url: string, options?: RequestInit) => {
                if (url.includes('/config/') && options?.method === 'GET') {
                    if (configExists) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => configHasLibrary ? { library: { data: [{ title: 'Blocks' }] } } : {},
                        } as Response;
                    }
                    return { ok: false, status: 404 } as Response;
                }

                if (url.includes('/config/') && options?.method === 'POST') {
                    return { ok: true, status: 200 } as Response;
                }

                if (options?.method === 'DELETE') {
                    return { ok: true, status: 200 } as Response;
                }

                if (url.includes('.da/library/blocks.json') && options?.method === 'POST') {
                    return { ok: blocksSheetExists, status: blocksSheetExists ? 200 : 500 } as Response;
                }

                if (url.includes('.da/library/blocks.json') && options?.method === 'HEAD') {
                    return { ok: blocksSheetExists, status: blocksSheetExists ? 200 : 404 } as Response;
                }

                if (url.includes('.da/library/blocks/') && options?.method === 'HEAD') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) {
                        const blockId = match[1];
                        const exists = blockDocsExist[blockId] ?? false;
                        return { ok: exists, status: exists ? 200 : 404 } as Response;
                    }
                }

                return { ok: true, status: 200 } as Response;
            };
        }

        it('should exclude blocks without docs and log info when no blocks qualify', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Cards', id: 'cards' },
                    { title: 'Hero', id: 'hero' },
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createVerificationMockFetch({
                configExists: true,
                configHasLibrary: true,
                blocksSheetExists: true,
                blockDocsExist: { cards: false, hero: false },
            }));

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(0);
            expect(result.paths).toEqual([]);

            const infoCalls = (mockLogger.info as jest.Mock).mock.calls;
            const noBlocksLog = infoCalls.find((call: string[]) =>
                call[0].includes('No blocks with documentation pages')
            );
            expect(noBlocksLog).toBeDefined();
        });

        it('should only include blocks with documentation pages in the spreadsheet', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Cards', id: 'cards' },
                    { title: 'Hero', id: 'hero' },
                    { title: 'Accordion', id: 'accordion' },
                    { title: 'Carousel', id: 'carousel' },
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createVerificationMockFetch({
                configExists: true,
                configHasLibrary: true,
                blocksSheetExists: true,
                blockDocsExist: { cards: true, hero: true, accordion: false, carousel: false },
            }));

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);

            expect(result.paths).toContain('.da/library/blocks.json');
            expect(result.paths).toContain('.da/library/blocks/cards');
            expect(result.paths).toContain('.da/library/blocks/hero');
            expect(result.paths).not.toContain('.da/library/blocks/accordion');
            expect(result.paths).not.toContain('.da/library/blocks/carousel');
        });
    });
});
