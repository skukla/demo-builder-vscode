/**
 * The current project's storefront: where its pages live and the clients that reach them.
 *
 * `storefrontTarget`, `daLiveOps` and `helixFor` moved here from `contentAuthoringTools.ts`
 * unchanged. The catalog menu's page port over the same calls is
 * `features/eds/services/catalogMenu/storefrontPageAdapter.ts` (EDS-24).
 *
 * @module features/ai/server/storefrontPages
 */

import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { createCatalogMenuSite } from '@/features/eds/services/catalogMenu/catalogMenuSiteDeps';
import type { CatalogMenuSite } from '@/features/eds/services/catalogMenu/catalogMenuStep';
import {
    DaLiveContentOperations,
    createDaLiveServiceTokenProvider,
} from '@/features/eds/services/daLive/daLiveContentOperations';
import { HelixService } from '@/features/eds/services/helix/helixService';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { getEdsDaLiveTarget, getEdsRepoParts } from '@/types/typeGuards';

/** Where a page lives, in all the spellings the three surfaces need. */
export interface StorefrontTarget {
    daLiveOrg: string;
    daLiveSite: string;
    repoOwner: string;
    repoName: string;
}

/**
 * Coordinate segments are interpolated into a URL AUTHORITY
 * (`main--{repo}--{owner}.aem.live`) and into admin API paths, so they are
 * restricted to characters that cannot restructure a URL.
 *
 * Without this, `githubRepo: "a@internal.example?/b"` yields
 * `https://main--b--a@internal.example?.aem.live`, which parses as userinfo
 * `main--b--a` and host `internal.example` — turning read_published_page into an
 * SSRF probe fired from the extension host. The manifest is writable through
 * `update_project_config`, which validates content only for `.env`, and
 * `getCurrentProject()` re-reads it from disk on every call.
 *
 * Must START alphanumeric, which is what rules out `..` — `githubRepo: "../../x/y"`
 * splits to owner `..` / repo `..`, and a dots-anywhere class accepts both,
 * putting the traversal back into the DA source path. Caught by its own test.
 */
const SAFE_COORDINATE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * Pull the DA.live + GitHub coordinates off the project's storefront metadata,
 * reusing the shared getters rather than re-splitting `githubRepo` — that split
 * already had four hand-rolled copies before `getEdsRepoParts` existed.
 *
 * Returns null when anything is missing OR fails {@link SAFE_COORDINATE}.
 */
export function storefrontTarget(project: Project): StorefrontTarget | null {
    const repo = getEdsRepoParts(project);
    if (!repo) return null;
    const da = getEdsDaLiveTarget(project);
    const target = {
        repoOwner: repo.owner,
        repoName: repo.repo,
        daLiveOrg: da?.org || repo.owner,
        daLiveSite: da?.site || repo.repo,
    };
    return Object.values(target).every((v) => SAFE_COORDINATE.test(v)) ? target : null;
}

/** DA.live content operations bound to the DA.live (not Adobe) token. */
export function daLiveOps(ctx: HandlerContext): DaLiveContentOperations {
    return new DaLiveContentOperations(
        createDaLiveServiceTokenProvider(getDaLiveAuthService(ctx.context)),
        ctx.logger,
    );
}

/** Helix service carrying both credentials preview/publish sends on one request. */
export function helixFor(ctx: HandlerContext): HelixService {
    return new HelixService(
        ctx.logger,
        getGitHubServices(ctx.context.secrets).tokenService,
        createDaLiveServiceTokenProvider(getDaLiveAuthService(ctx.context)),
    );
}

/**
 * The project's storefront as the catalog menu step sees it, on this context's sign-ins
 * — for project creation, the new-category watcher and the category page tools.
 *
 * @param ctx - the handler context
 * @param project - the project
 * @returns the site, or null when the project has no usable storefront coordinates
 */
export function catalogMenuSiteFor(ctx: HandlerContext, project: Project): CatalogMenuSite | null {
    const target = storefrontTarget(project);
    if (!target) return null;
    return createCatalogMenuSite({
        project,
        target,
        daLive: daLiveOps(ctx),
        helix: helixFor(ctx),
        github: getGitHubServices(ctx.context.secrets).fileOperations,
    });
}
