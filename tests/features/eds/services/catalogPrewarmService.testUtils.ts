/**
 * Catalog Prewarm Service — Shared Test Utilities
 *
 * Fixtures shared by the catalogPrewarmService suite and its sample-scope
 * sibling: a logger double, a minimal ACCS project, and a Catalog Service
 * GraphQL page builder.
 *
 * NOTE: This is a `*.testUtils.ts` file (not `*.test.ts`) so Jest does not treat
 * it as a test suite — it contains no `describe`/`it` blocks.
 */

import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';

export const mockLogger = createMockLogger();

/**
 * A `PdpPublisher` double that succeeds. Pre-warming publishes through the
 * extension's AUTHENTICATED Helix path (`previewAndPublishPage`) rather than an
 * anonymous POST to the external action, so every call site needs one — the
 * anonymous form 401s on any site with a pinned admin.
 *
 * Returns a fresh mock per call so suites cannot leak call counts into one
 * another (`clearAllMocks` does not reset implementations).
 */
export function makePublisher() {
    return { previewAndPublishPage: jest.fn().mockResolvedValue(undefined) };
}

/** Minimal ACCS project shape that satisfies extractConfigParams. */
export function makeAccsProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://catalog.example.com/graphql',
                ACCS_STORE_VIEW_CODE: 'default',
                ACCS_STORE_CODE: 'main_website_store',
                ACCS_WEBSITE_CODE: 'base',
                ACCS_CUSTOMER_GROUP: '',
            },
        },
        ...overrides,
    } as Project;
}

/** One page of Catalog Service productSearch results. */
export function catalogPage(items: Array<{ sku: string; urlKey: string }>) {
    return {
        ok: true,
        status: 200,
        json: async () => ({
            data: {
                productSearch: {
                    items: items.map((i) => ({ productView: i })),
                    page_info: { total_pages: 1, current_page: 1 },
                },
            },
        }),
    };
}
