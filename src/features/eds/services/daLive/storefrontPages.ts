/**
 * One storefront page: where it lives, and the write and the removal of it.
 *
 * Extracted from the content-authoring tools (`write_page`, `delete_page`) on
 * 2026-10-01, when the category-page generator needed the same two operations
 * over a list of pages. The rules here are the tools' rules, moved, not restated:
 *
 * - **One path, three spellings.** DA source `about.html`, Helix `/about`,
 *   da.live/canvas `about`. Callers hand in the web path; {@link toWebPath}
 *   validates it and {@link toSourcePath} derives the DA spelling.
 * - **The path is a security boundary**, see {@link toWebPath}.
 * - **Removal unpublishes first and stops if that fails**, see {@link removePage}.
 *
 * `vscode`-free: dependencies arrive as parameters (ADR-015).
 *
 * @module features/eds/services/daLive/storefrontPages
 */

import type { HelixService } from '../helix/helixService';
import { resolveDaPath } from './daLiveContentHelpers';
import type { DaLiveContentOperations } from './daLiveContentOperations';
import type { Project } from '@/types/base';
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

/**
 * Canonical WEB path, or `null` when the input is not a safe page path.
 *
 * **This is a security boundary, not a formatter.** The page tools deliberately
 * expose no `org`/`site` arguments so an agent cannot reach another site — but
 * that control is only as strong as the path. `..` segments defeat it entirely:
 * the WHATWG URL parser collapses them, so
 * `/source/skukla/bodea/../../victim/site/index.html` resolves to
 * `/source/victim/site/index.html` and is sent with the user's DA.live bearer.
 * Verified by execution, 2026-08-16. The same escape reaches Helix
 * preview/publish and the unpublish DELETE, whose `normalizeWebPath` also leaves
 * `..` intact.
 *
 * Rejects rather than normalizes: silently rewriting a hostile path would let an
 * agent believe it wrote where it asked.
 *
 * Accepts a caller's `.html` and strips it — an agent that has just read a DA
 * listing naturally holds the source spelling.
 */
export function toWebPath(raw: string): string | null {
    const p0 = raw.trim();
    // A scheme, a protocol-relative prefix, a backslash or any control character
    // can all restructure the URL once interpolated.
    if (/^[a-z][a-z0-9+.-]*:/i.test(p0) || p0.startsWith('//')) return null;
    // eslint-disable-next-line no-control-regex
    if (/[\\\u0000-\u001f\u007f]/.test(p0)) return null;

    let p = p0;
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.endsWith('.html')) p = p.slice(0, -'.html'.length);
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    p = p || '/';

    // Reject traversal AND percent-encoded traversal — decode first, since the
    // URL parser will. A bare `%` that is not valid encoding is also refused.
    let decoded: string;
    try {
        decoded = decodeURIComponent(p);
    } catch {
        return null;
    }
    if (decoded.split('/').some((seg) => seg === '..' || seg === '.')) return null;
    return p;
}

/**
 * DA source path for a web path — `/about` → `about.html`, `/` → `index.html`.
 * Delegates to the content pipeline's own helper so the two cannot drift;
 * `resolveDaPath` already maps the root to `index.html`.
 */
export function toSourcePath(webPath: string): string {
    return resolveDaPath(webPath, true);
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * The two services a page read, write or removal goes through, bound to one site.
 * Typed to exactly the methods used, so a caller can hand in the real classes or
 * a fake of the same signatures without a cast.
 */
export interface PageServices {
    ops: Pick<DaLiveContentOperations, 'readSource' | 'createSource' | 'deleteSource'>;
    helix: Pick<HelixService, 'previewAndPublishPage' | 'unpublishPage'>;
    target: StorefrontTarget;
}

/** A page's current DA.live source: 404 when there is none. */
export async function readPage(
    services: PageServices,
    webPath: string,
): Promise<{ status: number; body: string; truncated: boolean }> {
    const { daLiveOrg, daLiveSite } = services.target;
    const res = await services.ops.readSource(daLiveOrg, daLiveSite, toSourcePath(webPath));
    return { status: res.status, body: res.body, truncated: res.truncated };
}

/** What one page write did. A publish failure is not a write failure. */
export interface PageWriteResult {
    written: boolean;
    /** Absent when the write itself failed — nothing was there to publish. */
    published?: boolean;
    path: string;
    sourcePath?: string;
    error?: string;
    publishError?: string;
}

/**
 * Write a page's HTML to DA.live and, when asked, preview+publish it.
 *
 * A publish failure must not read as a total failure: the content IS in DA.live
 * and a later publish will pick it up — so it is reported as `publishError` on
 * a result that still says `written: true`.
 */
export async function writePage(
    services: PageServices,
    webPath: string,
    content: string,
    publish: boolean,
): Promise<PageWriteResult> {
    const sourcePath = toSourcePath(webPath);
    const { daLiveOrg, daLiveSite } = services.target;
    let write;
    try {
        write = await services.ops.createSource(daLiveOrg, daLiveSite, sourcePath, content, { overwrite: true });
    } catch (err) {
        return { written: false, path: webPath, error: message(err) };
    }
    if (!write.success) {
        return { written: false, path: webPath, error: write.error };
    }
    if (!publish) return { written: true, published: false, path: webPath, sourcePath };
    try {
        await services.helix.previewAndPublishPage(daLiveOrg, daLiveSite, webPath);
        return { written: true, published: true, path: webPath, sourcePath };
    } catch (err) {
        return { written: true, published: false, path: webPath, sourcePath, publishError: message(err) };
    }
}

/** What one page removal did. */
export interface PageRemoveResult {
    deleted: boolean;
    unpublished: boolean;
    path: string;
    error?: string;
}

/**
 * Unpublish a page, then delete its DA.live source.
 *
 * Unpublish FIRST, and ABORT if it fails, because only this order fails
 * recoverably: source still present, page still live, retry works. Deleting
 * first and then failing to unpublish leaves a live page whose content is gone.
 *
 * NOT an auth constraint. An earlier comment claimed ADR-002's "delete not
 * allowed while source exists" 403 forced the order; that reads the ADR
 * backwards — the 403 fires while the source EXISTS, and `unpublishPage` sends
 * the DA.live Bearer, which ADR-002 measured as bypassing the restriction
 * entirely (`getDeleteAuthHeaders`). Auth does not care about the order; the
 * failure mode does.
 */
export async function removePage(services: PageServices, webPath: string): Promise<PageRemoveResult> {
    const { daLiveOrg, daLiveSite } = services.target;
    let unpublished = false;
    let unpublishError: string | undefined;
    try {
        unpublished = await services.helix.unpublishPage(daLiveOrg, daLiveSite, webPath);
    } catch (err) {
        unpublishError = message(err);
    }
    if (!unpublished) {
        return {
            deleted: false,
            unpublished: false,
            path: webPath,
            error:
                unpublishError ??
                'Unpublish failed. The DA.live source was left in place so the page can still be removed — retry, or check site access.',
        };
    }
    try {
        const result = await services.ops.deleteSource(daLiveOrg, daLiveSite, toSourcePath(webPath));
        return {
            deleted: result.success,
            unpublished,
            path: webPath,
            ...(result.error ? { error: result.error } : {}),
        };
    } catch (err) {
        return { deleted: false, unpublished, path: webPath, error: message(err) };
    }
}
