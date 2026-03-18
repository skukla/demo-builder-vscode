/**
 * DA.live Content Operations Tests - Block Library Creation
 *
 * Tests for createBlockLibraryFromTemplate:
 * - Extracting blocks from component-definition.json
 * - Creating block library with spreadsheet and config
 * - Handling missing/empty template definitions
 * - ensureBlockDocPages (creating doc pages for blocks with exampleHtml)
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

    /**
     * Helper to create component-definition.json content
     * Note: GitHubFileOperations.getFileContent returns decoded content (not base64)
     */
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

    it('should extract blocks from component-definition.json and create library', async () => {
        mockGetFileContent.mockResolvedValue({
            content: createComponentDef([
                { title: 'Cards', id: 'cards', unsafeHTML: '<div class="cards">Example</div>' },
                { title: 'Hero', id: 'hero' },
            ]),
            sha: 'abc123',
        });
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);

        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        expect(mockGetFileContent).toHaveBeenCalledWith(templateOwner, templateRepo, 'component-definition.json');
        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(2);

        const configCall = mockFetch.mock.calls.find((call: [string, RequestInit]) =>
            call[0].includes('/config/') && !call[0].includes('/source/')
        );
        expect(configCall).toBeDefined();

        const blocksCall = mockFetch.mock.calls.find((call: [string, RequestInit]) =>
            call[0].includes('.da/library/blocks.json')
        );
        expect(blocksCall).toBeDefined();

        expect(result.paths).toContain('.da/library/blocks.json');
        expect(result.paths).toContain('.da/library/blocks/cards');
        expect(result.paths).toContain('.da/library/blocks/hero');
    });

    it('should return success with zero blocks when template has no component-definition.json', async () => {
        mockGetFileContent.mockResolvedValue(null);

        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(0);
    });

    it('should return success with zero blocks when all groups have empty components', async () => {
        const content = { groups: [{ id: 'other', title: 'Other', components: [] }] };
        mockGetFileContent.mockResolvedValue({
            content: JSON.stringify(content),
            sha: 'abc123',
        });

        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(0);
    });

    it('should extract blocks from all groups, not just the blocks group', async () => {
        const content = {
            groups: [
                {
                    id: 'blocks',
                    title: 'Blocks',
                    components: [
                        { title: 'Hero', id: 'hero', plugins: { da: { unsafeHTML: '<div class="hero">Example</div>' } } },
                    ],
                },
                {
                    id: 'product',
                    title: 'Product',
                    components: [
                        { title: 'Product Teaser', id: 'product-teaser' },
                    ],
                },
            ],
        };
        mockGetFileContent.mockResolvedValue({
            content: JSON.stringify(content),
            sha: 'abc123',
        });
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);

        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(2);
        expect(result.paths).toContain('.da/library/blocks/hero');
        expect(result.paths).toContain('.da/library/blocks/product-teaser');
    });

    it('should handle getFileContent errors gracefully', async () => {
        mockGetFileContent.mockRejectedValue(new Error('GitHub API error'));

        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('GitHub API error');
        expect(result.blocksCount).toBe(0);
    });

    it('should handle DA.live API errors gracefully', async () => {
        mockGetFileContent.mockResolvedValue({
            content: createComponentDef([{ title: 'Cards', id: 'cards' }]),
            sha: 'abc123',
        });
        mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
            if (url.includes('.da/library/blocks/') && options?.method === 'HEAD') {
                return { ok: true, status: 200 } as Response;
            }
            return { ok: false, status: 500 } as Response;
        });

        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        expect(result.success).toBe(false);
        expect(result.blocksCount).toBe(0);
    });

    it('should return success with zero blocks when no block docs exist', async () => {
        mockGetFileContent.mockResolvedValue({
            content: createComponentDef([{ title: 'Cards', id: 'cards' }]),
            sha: 'abc123',
        });
        mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);

        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(0);
        expect(result.paths).toEqual([]);
    });

    describe('ensureBlockDocPages', () => {
        /**
         * Helper to create a mock fetch that handles ensureBlockDocPages flow.
         */
        function createDocPageMockFetch(config: {
            existingDocPages?: string[];
            createSucceeds?: boolean;
        }) {
            const {
                existingDocPages = [],
                createSucceeds = true,
            } = config;

            const createdPages = new Set<string>();

            return async (url: string, options?: RequestInit) => {
                if (url.includes('.da/library/blocks/') && url.endsWith('.html') && options?.method === 'HEAD') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) {
                        const blockId = match[1];
                        const exists = existingDocPages.includes(blockId) || createdPages.has(blockId);
                        return { ok: exists, status: exists ? 200 : 404 } as Response;
                    }
                }

                if (url.includes('/source/') && url.includes('.da/library/blocks/') && options?.method === 'POST') {
                    if (createSucceeds) {
                        const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                        if (match) createdPages.add(match[1]);
                        return { ok: true, status: 200 } as Response;
                    }
                    return { ok: false, status: 500, statusText: 'Error', text: async () => '' } as Response;
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
                if (url.includes('.da/library/') && url.endsWith('.json') && options?.method === 'POST') {
                    return { ok: true, status: 200 } as Response;
                }

                return { ok: true, status: 200 } as Response;
            };
        }

        it('should create doc pages for blocks with exampleHtml but no existing page', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">CTA</div>' },
                    { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter">Sub</div>' },
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createDocPageMockFetch({
                existingDocPages: [],
                createSucceeds: true,
            }));

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);

            const postCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit]) =>
                    call[0].includes('/source/') &&
                    call[0].includes('.da/library/blocks/') &&
                    call[1]?.method === 'POST',
            );
            expect(postCalls).toHaveLength(2);

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Creating 2 block doc pages (0 already exist)'),
            );
        });

        it('should skip blocks without exampleHtml', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">CTA</div>' },
                    { title: 'Cards', id: 'cards' },
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createDocPageMockFetch({
                existingDocPages: [],
                createSucceeds: true,
            }));

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
            expect(result.paths).toContain('.da/library/blocks/hero-cta');
            expect(result.paths).not.toContain('.da/library/blocks/cards');
        });

        it('should skip blocks that already have doc pages from content source', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">CTA</div>' },
                    { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter">Sub</div>' },
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createDocPageMockFetch({
                existingDocPages: ['hero-cta'],
                createSucceeds: true,
            }));

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);

            const createCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit]) =>
                    call[0].includes('/source/') &&
                    call[0].includes('.da/library/blocks/') &&
                    call[1]?.method === 'POST',
            );
            expect(createCalls).toHaveLength(1);
            expect(createCalls[0][0]).toContain('newsletter');
        });

        it('should continue when one doc page creation fails', async () => {
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">CTA</div>' },
                    { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter">Sub</div>' },
                ]),
                sha: 'abc123',
            });

            const createdPages = new Set<string>();
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (url.includes('.da/library/blocks/') && url.endsWith('.html') && options?.method === 'HEAD') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) {
                        return { ok: createdPages.has(match[1]), status: createdPages.has(match[1]) ? 200 : 404 } as Response;
                    }
                }
                if (url.includes('/source/') && url.includes('.da/library/blocks/') && options?.method === 'POST') {
                    if (url.includes('hero-cta')) {
                        createdPages.add('hero-cta');
                        return { ok: true, status: 200 } as Response;
                    }
                    return { ok: false, status: 500, statusText: 'Error', text: async () => '' } as Response;
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
            });

            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
            expect(result.paths).toContain('.da/library/blocks/hero-cta');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to create doc page for newsletter'),
            );
        });

        it('should wrap exampleHtml in document structure when creating doc pages', async () => {
            const exampleHtml = '<div class="hero-cta"><div><div>Content</div></div></div>';
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: exampleHtml },
                ]),
                sha: 'abc123',
            });

            let postedFormData: FormData | null = null;
            const createdPages = new Set<string>();

            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (url.includes('.da/library/blocks/') && url.endsWith('.html') && options?.method === 'HEAD') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) {
                        return { ok: createdPages.has(match[1]), status: createdPages.has(match[1]) ? 200 : 404 } as Response;
                    }
                }
                if (url.includes('/source/') && url.includes('.da/library/blocks/') && options?.method === 'POST') {
                    postedFormData = options?.body as FormData;
                    createdPages.add('hero-cta');
                    return { ok: true, status: 200 } as Response;
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
            });

            await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            expect(postedFormData).not.toBeNull();
            const postedBlob = postedFormData!.get('data') as Blob;
            const postedHtml = await postedBlob.text();

            expect(postedHtml).toBe(
                `<body><header></header><main><div>${exampleHtml}</div></main><footer></footer></body>`,
            );
        });
    });
});
