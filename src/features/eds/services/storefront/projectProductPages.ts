/**
 * The product-page removal's deps for ONE project's own storefront (EDS-26, EDS-44).
 *
 * Reset and the store-change republish remove the same pages the same way: the
 * authored pages under `/products` are read from the project's DA.live site, folder by
 * folder (a listing that fails stops the removal), and "another project" is any other
 * local project on the same repository. The rules themselves are
 * `productPageRemoval.ts`.
 *
 * @module features/eds/services/storefront/projectProductPages
 */

import { listDaLivePages } from '../daLive/daLivePageWalk';
import type { DaLiveSourceOperations } from '../daLive/daLiveSourceOperations';
import type { ProductPageHelix, ProductPageRemovalDeps } from './productPageRemoval';
import { otherProjectsPublishingTo } from './sharedRepoProjects';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

const PRODUCTS_FOLDER = '/products';

export interface ProjectProductPagesInput {
    /** The project's folder: the one project on the repository that does not count. */
    projectPath: string;
    target: { repoOwner: string; repoName: string; daLiveOrg: string; daLiveSite: string };
    daLive: Pick<DaLiveSourceOperations, 'listDirectory'>;
    helix: ProductPageHelix;
    stateManager: StateManager;
    logger: Logger;
}

/**
 * @param input - the project, its storefront and the clients the caller holds
 * @returns what `removeProductPages` needs for that storefront
 */
export function productPageRemovalDepsFor(input: ProjectProductPagesInput): ProductPageRemovalDeps {
    const { target, daLive, stateManager } = input;
    return {
        helix: input.helix,
        // The DA.live documents under /products, sub-folders included.
        listAuthoredProductPages: () => listDaLivePages(daLive, target.daLiveOrg, target.daLiveSite, PRODUCTS_FOLDER),
        otherProjectsOnRepo: () =>
            otherProjectsPublishingTo(stateManager, `${target.repoOwner}/${target.repoName}`, input.projectPath),
        logger: input.logger,
    };
}
