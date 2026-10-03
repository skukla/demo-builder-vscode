/**
 * The current project's storefront pages: where they live, the clients that reach them,
 * and one page adapter over both (EDS-24).
 *
 * `storefrontTarget`, `daLiveOps` and `helixFor` moved here from `contentAuthoringTools.ts`
 * unchanged, so the content tools and the catalog menu resolve the storefront the same
 * way. {@link createStorefrontPages} is the catalog menu's `StorefrontPages` port over the
 * same calls `read_page`, `write_page` (with publish) and `delete_page` make, in the same
 * order — used by the agent's tools and the dashboard alike.
 *
 * @module features/ai/server/storefrontPages
 */

import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import type { StorefrontPages } from '@/features/eds/services/catalogMenu/catalogMenuService';
import { resolveDaPath } from '@/features/eds/services/daLive/daLiveContentHelpers';
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

/** The two clients the page adapter drives — narrowed to the calls it makes. */
export interface PageTransport {
    daLive: Pick<DaLiveContentOperations, 'readSource' | 'createSource' | 'deleteSource'>;
    helix: Pick<HelixService, 'previewAndPublishPage' | 'unpublishPage'>;
}

/** DA source path for a web path — `/nav` → `nav.html`. The content pipeline's own rule. */
function sourcePathOf(webPath: string): string {
    return resolveDaPath(webPath, true);
}

/**
 * The catalog menu's page port over DA.live and Helix.
 *
 * - `read` reads WHOLE: a cut-short page written back would lose its tail, so a
 *   truncated read throws instead of answering.
 * - `write` is `write_page` with `publish: true`: overwrite the source, then preview and
 *   publish; a failure at either step throws, so nothing is recorded as live that is not.
 * - `remove` is `delete_page`: unpublish FIRST and stop if that fails (the source stays,
 *   so the page can still be removed), then delete the source.
 *
 * @param transport - the DA.live and Helix clients
 * @param target - the storefront's DA.live org and site
 * @returns the pages, by web path
 */
export function createStorefrontPages(
    transport: PageTransport,
    target: Pick<StorefrontTarget, 'daLiveOrg' | 'daLiveSite'>,
): StorefrontPages {
    const { daLiveOrg: org, daLiveSite: site } = target;
    return {
        async read(path) {
            const res = await transport.daLive.readSource(org, site, sourcePathOf(path), Number.POSITIVE_INFINITY);
            if (res.status === 404) return null;
            if (res.status < 200 || res.status >= 300) {
                throw new Error(`Could not read ${path}: HTTP ${res.status}`);
            }
            if (res.truncated) throw new Error(`Could not read all of ${path}`);
            return res.body;
        },
        async write(path, html) {
            const written = await transport.daLive.createSource(org, site, sourcePathOf(path), html, {
                overwrite: true,
            });
            if (!written.success) throw new Error(written.error ?? `Could not write ${path}`);
            await transport.helix.previewAndPublishPage(org, site, path);
        },
        async remove(path) {
            if (!(await transport.helix.unpublishPage(org, site, path))) {
                throw new Error(`Could not unpublish ${path}; its source was left in place`);
            }
            const deleted = await transport.daLive.deleteSource(org, site, sourcePathOf(path));
            if (!deleted.success) throw new Error(deleted.error ?? `Could not delete ${path}`);
        },
    };
}

/**
 * The page adapter for the current project's storefront, from a handler context.
 *
 * @param ctx - the handler context whose sign-ins the clients use
 * @param target - the storefront
 * @returns the pages
 */
export function storefrontPagesFor(ctx: HandlerContext, target: StorefrontTarget): StorefrontPages {
    return createStorefrontPages({ daLive: daLiveOps(ctx), helix: helixFor(ctx) }, target);
}
