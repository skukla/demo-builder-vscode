/**
 * DA.live Content Operations Tests - Block Library
 *
 * Tests for createBlockLibraryFromTemplate:
 * - Extracting blocks from component-definition.json
 * - Creating block library with spreadsheet and config
 * - Handling missing/empty template definitions
 * - ensureBlockDocPages (creating doc pages for blocks with exampleHtml)
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
        // Given: Template with blocks
        mockGetFileContent.mockResolvedValue({
            content: createComponentDef([
                { title: 'Cards', id: 'cards', unsafeHTML: '<div class="cards">Example</div>' },
                { title: 'Hero', id: 'hero' },
            ]),
            sha: 'abc123',
        });
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);

        // When: createBlockLibraryFromTemplate is called
        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        // Then: Should fetch component-definition.json and create library
        expect(mockGetFileContent).toHaveBeenCalledWith(templateOwner, templateRepo, 'component-definition.json');
        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(2);

        // Verify config was updated via /config/ API (not /source/)
        const configCall = mockFetch.mock.calls.find((call: [string, RequestInit]) =>
            call[0].includes('/config/') && !call[0].includes('/source/')
        );
        expect(configCall).toBeDefined();

        // Verify blocks spreadsheet was created at /.da/library/blocks.json
        const blocksCall = mockFetch.mock.calls.find((call: [string, RequestInit]) =>
            call[0].includes('.da/library/blocks.json')
        );
        expect(blocksCall).toBeDefined();

        // Should return paths for publishing:
        // - Blocks spreadsheet with .json extension
        // - Block document paths for each block
        expect(result.paths).toContain('.da/library/blocks.json');
        expect(result.paths).toContain('.da/library/blocks/cards');
        expect(result.paths).toContain('.da/library/blocks/hero');
    });

    it('should return success with zero blocks when template has no component-definition.json', async () => {
        // Given: Template without component-definition.json
        mockGetFileContent.mockResolvedValue(null);

        // When: createBlockLibraryFromTemplate is called
        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        // Then: Should return success with zero blocks (graceful handling)
        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(0);
    });

    it('should return success with zero blocks when all groups have empty components', async () => {
        // Given: Template with component-definition.json but no components in any group
        const content = { groups: [{ id: 'other', title: 'Other', components: [] }] };
        mockGetFileContent.mockResolvedValue({
            content: JSON.stringify(content),
            sha: 'abc123',
        });

        // When: createBlockLibraryFromTemplate is called
        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        // Then: Should return success with zero blocks
        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(0);
    });

    it('should extract blocks from all groups, not just the blocks group', async () => {
        // Given: Template with blocks in multiple groups (blocks + product)
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

        // When: createBlockLibraryFromTemplate is called
        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        // Then: Should include blocks from both groups
        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(2);
        expect(result.paths).toContain('.da/library/blocks/hero');
        expect(result.paths).toContain('.da/library/blocks/product-teaser');
    });

    it('should handle getFileContent errors gracefully', async () => {
        // Given: getFileContent throws an error
        mockGetFileContent.mockRejectedValue(new Error('GitHub API error'));

        // When: createBlockLibraryFromTemplate is called
        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        // Then: Should return failure but not throw
        expect(result.success).toBe(false);
        expect(result.error).toContain('GitHub API error');
        expect(result.blocksCount).toBe(0);
    });

    it('should handle DA.live API errors gracefully', async () => {
        // Given: Template with blocks, docs exist but spreadsheet creation fails
        mockGetFileContent.mockResolvedValue({
            content: createComponentDef([{ title: 'Cards', id: 'cards' }]),
            sha: 'abc123',
        });
        mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
            // HEAD check for block docs — return ok so block passes filter
            if (url.includes('.da/library/blocks/') && options?.method === 'HEAD') {
                return { ok: true, status: 200 } as Response;
            }
            // All other calls fail (config, spreadsheet creation, etc.)
            return { ok: false, status: 500 } as Response;
        });

        // When: createBlockLibraryFromTemplate is called
        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        // Then: Should return failure (spreadsheet creation failed)
        expect(result.success).toBe(false);
        expect(result.blocksCount).toBe(0);
    });

    it('should return success with zero blocks when no block docs exist', async () => {
        // Given: Template with blocks but no block documentation pages on DA.live
        mockGetFileContent.mockResolvedValue({
            content: createComponentDef([{ title: 'Cards', id: 'cards' }]),
            sha: 'abc123',
        });
        mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);

        // When: createBlockLibraryFromTemplate is called
        const result = await service.createBlockLibraryFromTemplate(
            destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
        );

        // Then: Should return success with zero blocks (no docs = no library entries)
        expect(result.success).toBe(true);
        expect(result.blocksCount).toBe(0);
        expect(result.paths).toEqual([]);
    });

    describe('ensureBlockDocPages', () => {
        /**
         * Helper to create a mock fetch that handles ensureBlockDocPages flow.
         *
         * The flow is:
         * 1. ensureBlockDocPages: HEAD checks for blocks with exampleHtml
         * 2. ensureBlockDocPages: POST /source/ to create missing doc pages
         * 3. getBlocksWithDocs: HEAD checks for ALL blocks (including newly created)
         * 4. createBlockLibrary: DELETE old spreadsheets, POST config, POST spreadsheet
         */
        function createDocPageMockFetch(config: {
            existingDocPages?: string[];
            createSucceeds?: boolean;
        }) {
            const {
                existingDocPages = [],
                createSucceeds = true,
            } = config;

            // Track created pages so subsequent HEAD checks find them
            const createdPages = new Set<string>();

            return async (url: string, options?: RequestInit) => {
                // HEAD check for block doc pages (both ensureBlockDocPages and getBlocksWithDocs)
                if (url.includes('.da/library/blocks/') && url.endsWith('.html') && options?.method === 'HEAD') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) {
                        const blockId = match[1];
                        const exists = existingDocPages.includes(blockId) || createdPages.has(blockId);
                        return { ok: exists, status: exists ? 200 : 404 } as Response;
                    }
                }

                // POST to /source/ for creating doc pages
                if (url.includes('/source/') && url.includes('.da/library/blocks/') && options?.method === 'POST') {
                    if (createSucceeds) {
                        const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                        if (match) createdPages.add(match[1]);
                        return { ok: true, status: 200 } as Response;
                    }
                    return { ok: false, status: 500, statusText: 'Error', text: async () => '' } as Response;
                }

                // GET config
                if (url.includes('/config/') && options?.method === 'GET') {
                    return { ok: true, status: 200, json: async () => ({}) } as Response;
                }

                // POST config
                if (url.includes('/config/') && options?.method === 'POST') {
                    return { ok: true, status: 200 } as Response;
                }

                // DELETE old spreadsheets
                if (options?.method === 'DELETE') {
                    return { ok: true, status: 200 } as Response;
                }

                // POST spreadsheet creation
                if (url.includes('.da/library/') && url.endsWith('.json') && options?.method === 'POST') {
                    return { ok: true, status: 200 } as Response;
                }

                return { ok: true, status: 200 } as Response;
            };
        }

        it('should create doc pages for blocks with exampleHtml but no existing page', async () => {
            // Given: Template with 2 blocks that have exampleHtml, no existing pages
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

            // When: createBlockLibraryFromTemplate is called
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            // Then: Doc pages should have been created and blocks should be in library
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);

            // Verify POST calls were made to create doc pages
            const postCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit]) =>
                    call[0].includes('/source/') &&
                    call[0].includes('.da/library/blocks/') &&
                    call[1]?.method === 'POST',
            );
            expect(postCalls).toHaveLength(2);

            // Verify logging (0 already exist since existingDocPages is empty)
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Creating 2 block doc pages (0 already exist)'),
            );
        });

        it('should skip blocks without exampleHtml', async () => {
            // Given: One block with exampleHtml, one without
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">CTA</div>' },
                    { title: 'Cards', id: 'cards' }, // No unsafeHTML
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createDocPageMockFetch({
                existingDocPages: [],
                createSucceeds: true,
            }));

            // When: createBlockLibraryFromTemplate is called
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            // Then: Only hero-cta gets a doc page; cards has no doc page and is excluded
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
            expect(result.paths).toContain('.da/library/blocks/hero-cta');
            expect(result.paths).not.toContain('.da/library/blocks/cards');
        });

        it('should skip blocks that already have doc pages from content source', async () => {
            // Given: hero-cta already has a doc page (e.g., copied from library content source)
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">CTA</div>' },
                    { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter">Sub</div>' },
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createDocPageMockFetch({
                existingDocPages: ['hero-cta'], // Already exists — should NOT be overwritten
                createSucceeds: true,
            }));

            // When: createBlockLibraryFromTemplate is called
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            // Then: Both blocks should be in library (hero-cta via existing, newsletter via created)
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);

            // Only newsletter should get POST to /source/ (hero-cta already exists)
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
            // Given: 2 blocks with exampleHtml, but create fails for one
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">CTA</div>' },
                    { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter">Sub</div>' },
                ]),
                sha: 'abc123',
            });

            // Custom mock: hero-cta creation succeeds, newsletter fails
            const createdPages = new Set<string>();
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                // HEAD check for block doc pages
                if (url.includes('.da/library/blocks/') && url.endsWith('.html') && options?.method === 'HEAD') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) {
                        return { ok: createdPages.has(match[1]), status: createdPages.has(match[1]) ? 200 : 404 } as Response;
                    }
                }

                // POST to create doc pages
                if (url.includes('/source/') && url.includes('.da/library/blocks/') && options?.method === 'POST') {
                    if (url.includes('hero-cta')) {
                        createdPages.add('hero-cta');
                        return { ok: true, status: 200 } as Response;
                    }
                    // newsletter creation fails
                    return { ok: false, status: 500, statusText: 'Error', text: async () => '' } as Response;
                }

                // Config and spreadsheet operations
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

            // When: createBlockLibraryFromTemplate is called
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            // Then: hero-cta should be in library; newsletter should not (creation failed)
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
            expect(result.paths).toContain('.da/library/blocks/hero-cta');

            // Warning should have been logged for newsletter
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to create doc page for newsletter'),
            );
        });

        it('should wrap exampleHtml in document structure when creating doc pages', async () => {
            // Given: A block with exampleHtml
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

            // When: createBlockLibraryFromTemplate is called
            await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            // Then: The posted content should be wrapped in document structure
            expect(postedFormData).not.toBeNull();
            const postedBlob = postedFormData!.get('data') as Blob;
            const postedHtml = await postedBlob.text();

            // Block must be inside a section <div> — DA.live treats direct
            // children of <main> as sections, not blocks
            expect(postedHtml).toBe(
                `<body><header></header><main><div>${exampleHtml}</div></main><footer></footer></body>`,
            );
        });
    });

    describe('copyBlockDocPagesFromSources (CDN-based copy)', () => {
        /**
         * Helper mock that handles the CDN-based copy flow:
         * 1. copySingleFile: HEAD to check spreadsheet (.json) → 404 (not a spreadsheet)
         * 2. copySingleFile: GET .plain.html from public CDN → returns HTML content
         * 3. copySingleFile: POST to /source/ on destination → creates doc page
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
                // HEAD check for spreadsheet detection (.json URL)
                if (url.includes('.aem.live/') && url.endsWith('.json') && options?.method === 'HEAD') {
                    return { ok: false, status: 404 } as Response;
                }

                // GET .plain.html from public CDN (copySingleFile fetch)
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

                // POST to /source/ (create doc page or CDN copy write)
                if (url.includes('/source/') && url.includes('.da/library/blocks/') && options?.method === 'POST') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) createdPages.add(match[1]);
                    return { ok: true, status: 200 } as Response;
                }

                // HEAD check for block doc pages (ensureBlockDocPages + getBlocksWithDocs)
                if (url.includes('.da/library/blocks/') && url.endsWith('.html') && options?.method === 'HEAD') {
                    const match = url.match(/\.da\/library\/blocks\/([^.]+)\.html/);
                    if (match) {
                        const exists = createdPages.has(match[1]);
                        return { ok: exists, status: exists ? 200 : 404 } as Response;
                    }
                }

                // Config and spreadsheet operations
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
            // Given: hero-v2 has no unsafeHTML but exists on CDN content source
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Cards', id: 'cards', unsafeHTML: '<div class="cards">Example</div>' },
                    { title: 'Hero V2', id: 'hero-v2' }, // No unsafeHTML — needs CDN copy
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createCdnCopyMockFetch({
                cdnAvailableBlocks: ['hero-v2'],
            }));

            const contentSources = [{ org: 'demo-system-stores', site: 'accs-citisignal' }];

            // When: createBlockLibraryFromTemplate is called with content sources
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
                contentSources,
            );

            // Then: Both blocks should appear in the library
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);
            expect(result.paths).toContain('.da/library/blocks/cards');
            expect(result.paths).toContain('.da/library/blocks/hero-v2');

            // Verify CDN fetch was made for hero-v2 (not cards, which has unsafeHTML)
            const cdnFetches = mockFetch.mock.calls.filter(
                (call: [string, RequestInit]) =>
                    call[0].includes('aem.live') && call[0].includes('.plain.html'),
            );
            expect(cdnFetches.some((c: [string]) => c[0].includes('hero-v2'))).toBe(true);
            expect(cdnFetches.some((c: [string]) => c[0].includes('cards'))).toBe(false);
        });

        it('should try multiple content sources in order', async () => {
            // Given: hero-v2 not on first source, available on second
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
                    // Only available on second source (isle5)
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

            // When
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
                contentSources,
            );

            // Then: hero-v2 should be found via second source
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
            expect(result.paths).toContain('.da/library/blocks/hero-v2');
        });

        it('should skip CDN copy when no libraryContentSources provided', async () => {
            // Given: Block without unsafeHTML and no content sources
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero V2', id: 'hero-v2' }, // No unsafeHTML, no CDN source
                ]),
                sha: 'abc123',
            });
            mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);

            // When: Called without content sources
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            // Then: Block excluded (no doc page, no way to get one)
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
                // GET config for reading existing config
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

                // POST config
                if (url.includes('/config/') && options?.method === 'POST') {
                    return { ok: true, status: 200 } as Response;
                }

                // DELETE old spreadsheets
                if (options?.method === 'DELETE') {
                    return { ok: true, status: 200 } as Response;
                }

                // POST blocks spreadsheet
                if (url.includes('.da/library/blocks.json') && options?.method === 'POST') {
                    return { ok: blocksSheetExists, status: blocksSheetExists ? 200 : 500 } as Response;
                }

                // HEAD verification requests for blocks spreadsheet
                if (url.includes('.da/library/blocks.json') && options?.method === 'HEAD') {
                    return { ok: blocksSheetExists, status: blocksSheetExists ? 200 : 404 } as Response;
                }

                // HEAD verification requests for block docs
                if (url.includes('.da/library/blocks/') && options?.method === 'HEAD') {
                    // Extract block ID from URL (e.g., .da/library/blocks/cards.html -> cards)
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
            // Given: Template with blocks but no block docs exist on DA.live
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
                blockDocsExist: { cards: false, hero: false }, // No docs exist
            }));

            // When: createBlockLibraryFromTemplate is called
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            // Then: Should return success with zero blocks (no docs = no library entries)
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(0);
            expect(result.paths).toEqual([]);

            // Should log that no blocks with docs were found
            const infoCalls = (mockLogger.info as jest.Mock).mock.calls;
            const noBlocksLog = infoCalls.find((call: string[]) =>
                call[0].includes('No blocks with documentation pages')
            );
            expect(noBlocksLog).toBeDefined();
        });

        it('should only include blocks with documentation pages in the spreadsheet', async () => {
            // Given: Template with 4 blocks, but only 2 have documentation pages
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

            // When: createBlockLibraryFromTemplate is called
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            // Then: Should only include blocks with documentation pages
            expect(result.success).toBe(true);

            // blocksCount should reflect only blocks with docs, not all blocks
            expect(result.blocksCount).toBe(2);

            // Paths should only include verified blocks
            expect(result.paths).toContain('.da/library/blocks.json');
            expect(result.paths).toContain('.da/library/blocks/cards');
            expect(result.paths).toContain('.da/library/blocks/hero');
            expect(result.paths).not.toContain('.da/library/blocks/accordion');
            expect(result.paths).not.toContain('.da/library/blocks/carousel');
        });

    });
});
