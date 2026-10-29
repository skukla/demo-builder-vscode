/**
 * Builds {@link StoreScopePagesDeps} from the clients a door already holds (EDS-44).
 *
 * The three doors — Configure's Republish, the agent's `republish`, the dashboard's
 * Republish — reach the store-change service with different clients in hand: the
 * dashboard's pipeline already has a Helix service and DA.live operations, the other
 * two only the token sources. This is the one place they become the service's deps, so
 * the three cannot wire it differently.
 *
 * @module features/eds/services/storefront/storeScopePagesDeps
 */

import { resolveByomOverlayConfig } from '../../handlers/byomOverlay';
import { createCatalogMenuSite, type CatalogMenuTarget } from '../catalogMenu/catalogMenuSiteDeps';
import type { PageTransport } from '../catalogMenu/storefrontPageAdapter';
import { prewarmCatalog } from '../catalogPrewarmService';
import { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { TokenProvider } from '../daLive/daLiveOrgOperations';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import { productPageRemovalDepsFor } from './projectProductPages';
import type { StoreScopePagesDeps } from './storeScopePages';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

export interface StoreScopePagesClients {
    project: Project;
    target: CatalogMenuTarget;
    daLiveTokenProvider: TokenProvider;
    githubFiles: Pick<GitHubFileOperations, 'getFileContent'>;
    stateManager: StateManager;
    persist: (project: Project) => Promise<void>;
    logger: Logger;
    /** Needed only when no `helixService` is handed in. */
    githubTokenService?: GitHubTokenService;
    /** Reused when the caller holds one (the dashboard's pipeline); built otherwise. */
    helixService?: HelixService;
    /** Reused when the caller holds them; built otherwise. */
    daLiveSourceOps?: PageTransport['daLive'];
}

/**
 * @param clients - the project, its storefront, and the clients the door holds
 * @returns the store-change service's deps
 */
export function createStoreScopePagesDeps(clients: StoreScopePagesClients): StoreScopePagesDeps {
    const { project, target, logger } = clients;
    const helix =
        clients.helixService ?? new HelixService(logger, clients.githubTokenService, clients.daLiveTokenProvider);
    const daLive =
        clients.daLiveSourceOps ?? new DaLiveContentOperations(clients.daLiveTokenProvider, logger).sourceOps;
    return {
        site: { repoOwner: target.repoOwner, repoName: target.repoName },
        productPages: productPageRemovalDepsFor({
            projectPath: project.path,
            target,
            daLive,
            helix,
            stateManager: clients.stateManager,
            logger,
        }),
        catalogMenu: createCatalogMenuSite({
            project,
            target,
            daLive,
            helix,
            github: clients.githubFiles,
            stateManager: clients.stateManager,
            logger,
        }),
        publishProductPages: (onProgress) =>
            prewarmCatalog(
                project,
                resolveByomOverlayConfig(undefined, target.daLiveOrg, target.daLiveSite),
                target.daLiveOrg,
                target.daLiveSite,
                helix,
                logger,
                onProgress,
            ),
        persist: clients.persist,
        logger,
    };
}
