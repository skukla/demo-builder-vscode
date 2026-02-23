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

    it('should return success with zero blocks when template has no blocks group', async () => {
        // Given: Template with component-definition.json but no blocks group
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

            // Verify logging
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Creating 2 block doc pages'),
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

        it('should overwrite blocks that already have doc pages', async () => {
            // Given: hero-cta already has a doc page
            mockGetFileContent.mockResolvedValue({
                content: createComponentDef([
                    { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">CTA</div>' },
                    { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter">Sub</div>' },
                ]),
                sha: 'abc123',
            });
            mockFetch.mockImplementation(createDocPageMockFetch({
                existingDocPages: ['hero-cta'], // Already exists — should be overwritten
                createSucceeds: true,
            }));

            // When: createBlockLibraryFromTemplate is called
            const result = await service.createBlockLibraryFromTemplate(
                destOrg, destSite, templateOwner, templateRepo, mockGetFileContent,
            );

            // Then: Both blocks should be in library
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);

            // Both blocks should get POST to /source/ (overwrite ensures format consistency)
            const createCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit]) =>
                    call[0].includes('/source/') &&
                    call[0].includes('.da/library/blocks/') &&
                    call[1]?.method === 'POST',
            );
            expect(createCalls).toHaveLength(2);
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
