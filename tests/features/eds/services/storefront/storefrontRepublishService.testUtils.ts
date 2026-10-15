/**
 * The storefront project the `republishStorefrontConfig` family publishes.
 *
 * Both suites — the base one and the store-change one (EDS-44) — need a project the
 * extractor accepts: a repository, a DA.live pair and a component path. One builder, so
 * the two cannot drift apart on what "a publishable storefront" is.
 */

import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

/**
 * @param metadata - laid over the storefront instance's metadata
 * @param overrides - laid over the project
 * @returns a project whose storefront `extractRepublishParams` accepts
 */
export function edsProject(metadata: Record<string, unknown> = {}, overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'p',
        path: '/p',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                path: '/p/storefront',
                metadata: {
                    githubRepo: 'me/shop',
                    daLiveOrg: 'acme',
                    daLiveSite: 'shop',
                    ...metadata,
                },
            },
        },
        ...overrides,
    });
}
