/**
 * DA.live Content Operations Tests - ensureBlockDocPages
 *
 * Tests for ensureBlockDocPages (creating doc pages for blocks with exampleHtml).
 * Split from daLiveContentOperations-library-creation.test.ts to keep each file
 * under the max-lines limit; shared mock setup is imported from the sibling
 * testUtils module.
 */

import { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';
import {
    createLibraryCreationMocks,
    createComponentDef,
} from './daLiveContentOperations-library-creation.testUtils';

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
    let mockLogger: Logger;
    let mockGetFileContent: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ service, mockLogger, mockGetFileContent } = createLibraryCreationMocks());
    });

    const destOrg = 'user-org';
    const destSite = 'user-site';
    const templateOwner = 'hlxsites';
    const templateRepo = 'citisignal';

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

        it('should create a stub for blocks without exampleHtml', async () => {
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

            // Both blocks appear: hero-cta via ensureBlockDocPages, cards via generateStubDocPages
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);
            expect(result.paths).toContain('.da/library/blocks/hero-cta');
            expect(result.paths).toContain('.da/library/blocks/cards');
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
