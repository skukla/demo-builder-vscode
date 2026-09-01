/**
 * Content-authoring tools (Phase 1) — author DA.live pages for the current
 * project's EDS storefront.
 *
 * Before these, an agent could `list_dalive_sites` and `cleanup_dalive_site` —
 * list and destroy — but could not write a page to one. For an EDS project that
 * is the wrong gap to have, because the storefront largely IS its content:
 * every page of the Bodea build went through raw `curl` with a hand-rolled IMS
 * token.
 *
 * ## One page, three path spellings
 *
 * This is what the tools are actually FOR; raw transport alone would just move
 * the trap to the caller. The same page is spelled differently on every surface:
 *
 *   DA source API        `about.html`   — extension REQUIRED (DA Admin API)
 *   Helix preview/publish `/about`      — extension is a 404
 *   da.live/canvas       `about`        — extensionless or the editor 404s
 *
 * So every tool here takes ONE canonical web path (`/about`, `/`,
 * `/products/shoes`) and derives the rest, reusing `resolveDaPath` — the same
 * helper the content-copy pipeline uses — rather than restating the rule.
 *
 * ## Two DA.live-capable tokens, only one of which is right
 *
 * `DaLiveAuthService` (its own sign-in and storage) backs the production content
 * path — `republishStorefrontContent`, `sync_content`. The extension's Adobe IMS
 * token backs org-level reads like `list_dalive_sites`. Both are IMS tokens, so
 * picking wrong fails as a 401 at runtime rather than a type error. Content
 * operations use the DA.live one, and once a site carries any `access.admin`
 * role — which storefront setup now pins at registration — the admin API accepts
 * nothing else.
 *
 * Preview/publish additionally sends `x-auth-token: <github>`, so the publishing
 * paths pre-flight BOTH credentials, exactly as `sync_content` does.
 */

import { z } from 'zod';
import { runWithAdobeTarget } from './adobeTargetStore';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { buildSourceUrl, resolveDaPath } from '@/features/eds/services/daLive/daLiveContentHelpers';
import {
    DaLiveContentOperations,
    createDaLiveServiceTokenProvider,
} from '@/features/eds/services/daLive/daLiveContentOperations';
import { HelixService } from '@/features/eds/services/helix/helixService';
import { aemLiveBaseUrl } from '@/features/eds/services/storefront/storefrontProbe';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { getEdsDaLiveTarget, getEdsRepoParts, isEdsProject } from '@/types/typeGuards';

/**
 * Cap for the published-CDN read. Same reasoning as the DA source cap: the body
 * is shipped to a model that pays for it as context.
 */
const MAX_PUBLISHED_READ_BYTES = 30_000;

/**
 * Page size for `list_content`.
 *
 * It had none. A normal site root measured 1,664 bytes live, which hid it — a
 * 900-entry directory is 67,304. Same shape as every other bloat finding in this
 * audit: a list whose size is the data's, not the tool's.
 */
const CONTENT_PAGE_SIZE = 100;

const NEEDS_DALIVE = {
    needsAuth: 'dalive',
    message:
        'DA.live sign-in required. Check get_auth_status, then sign_in(provider:"dalive", confirm:true) once the user agrees.',
};

const NEEDS_GITHUB = {
    needsAuth: 'github',
    message:
        'GitHub sign-in required to publish. Check get_auth_status, then sign_in(provider:"github", confirm:true) once the user agrees.',
};

/** Where a page lives, in all the spellings the three surfaces need. */
interface StorefrontTarget {
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
function storefrontTarget(project: Project): StorefrontTarget | null {
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
 * **This is a security boundary, not a formatter.** These tools deliberately
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
function toWebPath(raw: string): string | null {
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

const INVALID_PATH = {
    error:
        'path must be a simple page path such as "/about" or "/products/shoes" — no "." or ".." segments, ' +
        'no scheme, no backslashes. These tools only reach the current project\'s storefront.',
};

/**
 * Final containment check before a request leaves: the built URL must still
 * address the intended site. Belt-and-braces behind {@link toWebPath}, because
 * this is the assertion that survives someone "simplifying" the path rules.
 */
function urlStaysWithin(url: string, prefix: string): boolean {
    try {
        return new URL(url).href.startsWith(prefix);
    } catch {
        return false;
    }
}

/**
 * DA source path for a web path — `/about` → `about.html`, `/` → `index.html`.
 * Delegates to the content pipeline's own helper so the two cannot drift;
 * `resolveDaPath` already maps the root to `index.html`.
 */
function toSourcePath(webPath: string): string {
    return resolveDaPath(webPath, true);
}

/**
 * Strip the `/{org}/{site}` prefix DA.live puts on every listed entry's `path`.
 *
 * MEASURED, not assumed: a real listing of `skukla/demo-builder-test` returns
 * `/skukla/demo-builder-test/apparel`, i.e. BOTH segments. An earlier version
 * stripped only the site and shipped org-prefixed paths that no other tool here
 * accepts — its fixtures used a site-only prefix and agreed with it. Falls back
 * to the raw path if the prefix is absent, rather than mangling it.
 */
function stripSitePrefix(entryPath: string, org: string, site: string): string {
    const prefix = `/${org}/${site}`;
    if (entryPath === prefix) return '/';
    return entryPath.startsWith(`${prefix}/`) ? entryPath.slice(prefix.length) : entryPath;
}

/** Resolved project + target + auth, or the structured refusal to return instead. */
type Resolved =
    | { ok: true; target: StorefrontTarget; ctx: HandlerContext }
    | { ok: false; body: Record<string, unknown> };

/**
 * Shared pre-flight: current project → EDS check → target metadata → DA.live
 * auth. `needsGitHub` adds the GitHub check the publishing paths require.
 */
async function resolveTarget(
    ctxFactory: () => HandlerContext,
    opts: { needsGitHub?: boolean; needsDaLive?: boolean } = {},
): Promise<Resolved> {
    const ctx = ctxFactory();
    const project = await ctx.stateManager.getCurrentProject();
    if (!project) {
        return { ok: false, body: { error: 'No current project is open' } };
    }
    if (!isEdsProject(project)) {
        return { ok: false, body: { error: 'Content authoring applies only to EDS storefront projects' } };
    }
    const target = storefrontTarget(project);
    if (!target) {
        return { ok: false, body: { error: 'Project is missing or has malformed GitHub repo metadata' } };
    }
    // read_published_page reads public CDN content and needs no DA.live session.
    if (opts.needsDaLive !== false && !(await getDaLiveAuthService(ctx.context).isAuthenticated())) {
        return { ok: false, body: NEEDS_DALIVE };
    }
    if (opts.needsGitHub) {
        let githubOk = false;
        try {
            githubOk = (await getGitHubServices(ctx.context.secrets).tokenService.validateToken()).valid;
        } catch {
            githubOk = false;
        }
        if (!githubOk) {
            return { ok: false, body: NEEDS_GITHUB };
        }
    }
    return { ok: true, target, ctx };
}

/**
 * The path-taking tools' shared opener: parse + validate the `path` argument,
 * then resolve the storefront target with {@link resolveTarget}. One home for
 * what was the same four-line prologue in read_page / write_page /
 * publish_page / read_published_page (2026-08-27 dedup sweep, PL-8 item 2).
 * delete_page deliberately does NOT use it: its confirm gate sits between the
 * parse and the resolve, and moving the resolve ahead of the gate would change
 * which refusal an unconfirmed call sees.
 */
async function openPathCall(
    ctxFactory: () => HandlerContext,
    args: unknown,
    opts: { needsGitHub?: boolean; needsDaLive?: boolean } = {},
): Promise<
    | { ok: true; webPath: string; target: StorefrontTarget; ctx: HandlerContext }
    | { ok: false; body: unknown }
> {
    const raw = String((args as { path?: unknown } | undefined)?.path ?? '').trim();
    if (!raw) return { ok: false, body: { error: 'path is required' } };
    const webPath = toWebPath(raw);
    if (!webPath) return { ok: false, body: INVALID_PATH };
    const r = await resolveTarget(ctxFactory, opts);
    if (!r.ok) return { ok: false, body: r.body };
    return { ok: true, webPath, target: r.target, ctx: r.ctx };
}


/** DA.live content operations bound to the DA.live (not Adobe) token. */
function daLiveOps(ctx: HandlerContext): DaLiveContentOperations {
    return new DaLiveContentOperations(
        createDaLiveServiceTokenProvider(getDaLiveAuthService(ctx.context)),
        ctx.logger,
    );
}

/** Helix service carrying both credentials preview/publish sends on one request. */
function helixFor(ctx: HandlerContext): HelixService {
    return new HelixService(
        ctx.logger,
        getGitHubServices(ctx.context.secrets).tokenService,
        createDaLiveServiceTokenProvider(getDaLiveAuthService(ctx.context)),
    );
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const pathField = z
    .string()
    .describe('Page path as it appears on the site, e.g. "/about" or "/" for the home page');

/**
 * Register the content-authoring tools on `server`.
 *
 * All six operate on the CURRENT project's storefront and take no org/site
 * arguments. An override would hand an agent a way to write into, and unpublish
 * from, any DA.live site the user's token can reach — with no confirmation on
 * the non-destructive paths. `list_dalive_sites` already covers cross-site reads.
 *
 * That control lives or dies on {@link toWebPath}: a `..` segment in `path`
 * escapes the org/site entirely once the URL parser collapses it, which is why
 * the path is REJECTED rather than normalized.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerContentAuthoringTools(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
    /**
     * Helix factory seam. Defaults to `helixFor`, which builds a service carrying
     * both credentials a preview/publish request needs. Production never passes it.
     *
     * A FACTORY rather than an instance, because each tool call builds its Helix from
     * that call's context — a single instance would outlive the context it was made
     * from. This is the seam that lets the suites stop mocking the module: they were
     * intercepting the constructor purely to reach the instance.
     */
    helixFactory: (ctx: HandlerContext) => HelixService = helixFor,
): void {
    // ─── read_page ───────────────────────────────────────────────────────────
    server.registerTool(
        'read_page',
        {
            annotations: { readOnlyHint: true, destructiveHint: false },
            description: "Read a page's DA.live source HTML from the current project's storefront",
            inputSchema: { path: pathField },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const r = await openPathCall(ctxFactory, args);
            if (!r.ok) return asText(r.body);
            const { webPath } = r;

            const sourcePath = toSourcePath(webPath);
            try {
                // Through the service, not a hand-rolled fetch: it carries the
                // retry/429 handling, the timeout, and the size cap this response
                // needs because a model pays for the body as context.
                const res = await runWithAdobeTarget(() =>
                    daLiveOps(r.ctx).readSource(r.target.daLiveOrg, r.target.daLiveSite, sourcePath),
                );
                if (res.status === 404) {
                    return asText({
                        error: `Page not found in DA.live source: ${webPath} (looked for ${sourcePath})`,
                        path: webPath,
                    });
                }
                if (res.status < 200 || res.status >= 300) {
                    return asText({
                        error: `Failed to read page: HTTP ${res.status}`,
                        path: webPath,
                    });
                }
                return asText({
                    path: webPath,
                    sourcePath,
                    bytes: res.bytes,
                    ...(res.truncated ? { truncated: true } : {}),
                    content: res.body,
                });
            } catch (err) {
                return asText({ error: message(err), path: webPath });
            }
        },
    );

    // ─── write_page ──────────────────────────────────────────────────────────
    server.registerTool(
        'write_page',
        {
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                "Write a page's HTML to the current project's DA.live storefront; set publish:true to preview+publish it in the same call",
            inputSchema: {
                path: pathField,
                content: z.string().describe('Full page HTML (EDS block markup)'),
                publish: z
                    .boolean()
                    .optional()
                    .describe('Preview and publish immediately after writing (default false)'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const raw = String(args?.path ?? '').trim();
            if (!raw) return asText({ error: 'path is required' });
            const content = args?.content;
            if (typeof content !== 'string' || content.length === 0) {
                return asText({ error: 'content is required' });
            }
            const publish = args?.publish === true;
            const webPath = toWebPath(raw);
            if (!webPath) return asText(INVALID_PATH);
            const r = await resolveTarget(ctxFactory, { needsGitHub: publish });
            if (!r.ok) return asText(r.body);

            const sourcePath = toSourcePath(webPath);
            const { daLiveOrg, daLiveSite } = r.target;

            let write;
            try {
                write = await runWithAdobeTarget(() =>
                    daLiveOps(r.ctx).createSource(daLiveOrg, daLiveSite, sourcePath, content, {
                        overwrite: true,
                    }),
                );
            } catch (err) {
                return asText({ written: false, path: webPath, error: message(err) });
            }
            if (!write.success) {
                return asText({ written: false, path: webPath, error: write.error });
            }
            if (!publish) {
                return asText({ written: true, published: false, path: webPath, sourcePath });
            }

            // A publish failure must not read as a total failure: the content IS
            // in DA.live and a later publish_page will pick it up.
            try {
                await runWithAdobeTarget(() =>
                    helixFactory(r.ctx).previewAndPublishPage(daLiveOrg, daLiveSite, webPath),
                );
                return asText({ written: true, published: true, path: webPath, sourcePath });
            } catch (err) {
                return asText({
                    written: true,
                    published: false,
                    path: webPath,
                    sourcePath,
                    publishError: message(err),
                });
            }
        },
    );

    // ─── publish_page ────────────────────────────────────────────────────────
    server.registerTool(
        'publish_page',
        {
            annotations: { readOnlyHint: false, destructiveHint: false },
            description: 'Preview and publish an existing DA.live page to the live CDN',
            inputSchema: { path: pathField },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const r = await openPathCall(ctxFactory, args, { needsGitHub: true });
            if (!r.ok) return asText(r.body);
            const { webPath } = r;

            try {
                await runWithAdobeTarget(() =>
                    helixFactory(r.ctx).previewAndPublishPage(
                        r.target.daLiveOrg,
                        r.target.daLiveSite,
                        webPath,
                    ),
                );
                return asText({ published: true, path: webPath });
            } catch (err) {
                return asText({ published: false, path: webPath, error: message(err) });
            }
        },
    );

    // ─── list_content ────────────────────────────────────────────────────────
    server.registerTool(
        'list_content',
        {
            annotations: { readOnlyHint: true, destructiveHint: false },
            description:
                "List pages and folders in the current project's DA.live storefront (defaults to " +
                'the site root). Paged — a content-heavy directory has hundreds of entries.',
            inputSchema: {
                path: z
                    .string()
                    .optional()
                    .describe('Directory to list, e.g. "/products"; defaults to the site root'),
                limit: z
                    .number()
                    .default(CONTENT_PAGE_SIZE)
                    .describe(`Maximum entries to return (default ${CONTENT_PAGE_SIZE})`),
                skip: z.number().optional().describe('Entries to skip, for paging'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            // The directory goes into the same /list/{org}/{site}/… URL a page
            // path goes into, so it needs the same traversal guard — it is not
            // exempt for being a "read".
            const dir = toWebPath(String(args?.path ?? '/').trim() || '/');
            if (!dir) return asText(INVALID_PATH);
            const r = await resolveTarget(ctxFactory);
            if (!r.ok) return asText(r.body);

            try {
                const entries = await runWithAdobeTarget(() =>
                    daLiveOps(r.ctx).listDirectory(r.target.daLiveOrg, r.target.daLiveSite, dir),
                );
                const skip = Math.max(0, Math.trunc(args?.skip ?? 0));
                const limit = Math.max(1, Math.trunc(args?.limit ?? CONTENT_PAGE_SIZE));
                const page = entries.slice(skip, skip + limit);
                return asText({
                    path: dir,
                    count: page.length,
                    total: entries.length,
                    limit,
                    skip,
                    // Report each entry as the WEB path, since that is what every
                    // other tool here takes. A non-html file keeps its extension:
                    // publishing a JSON as a page is a content-bus error, so the
                    // type has to be visible.
                    entries: page.map((e) => {
                        const withinSite = stripSitePrefix(
                            e.path,
                            r.target.daLiveOrg,
                            r.target.daLiveSite,
                        );
                        if (!e.ext) return { name: e.name, type: 'folder', path: withinSite };
                        return e.ext === 'html'
                            ? { name: e.name, type: 'page', path: toWebPath(withinSite) ?? withinSite }
                            : { name: e.name, type: 'file', path: withinSite };
                    }),
                });
            } catch (err) {
                return asText({ path: dir, error: message(err) });
            }
        },
    );

    // ─── delete_page ─────────────────────────────────────────────────────────
    server.registerTool(
        'delete_page',
        {
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                'Unpublish and delete a page from the current project\'s DA.live storefront (irreversible). Requires confirm:true.',
            inputSchema: {
                path: pathField,
                confirm: z.boolean().optional().describe('Must be true to proceed'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const raw = String(args?.path ?? '').trim();
            if (!raw) return asText({ error: 'path is required' });
            const webPath = toWebPath(raw);
            if (!webPath) return asText(INVALID_PATH);
            if (args?.confirm !== true) {
                return asText({
                    error: `delete_page permanently removes ${webPath} from DA.live and unpublishes it. To proceed, call again with confirm:true.`,
                    irreversible: true,
                });
            }
            const r = await resolveTarget(ctxFactory, { needsGitHub: true });
            if (!r.ok) return asText(r.body);

            const sourcePath = toSourcePath(webPath);
            const { daLiveOrg, daLiveSite } = r.target;

            // Unpublish FIRST, and ABORT if it fails, because only this order
            // fails recoverably: source still present, page still live, retry
            // works. Deleting first and then failing to unpublish leaves a live
            // page whose content is gone.
            //
            // NOT an auth constraint. An earlier version of this comment claimed
            // ADR-002's "delete not allowed while source exists" 403 forced the
            // order; that reads the ADR backwards — the 403 fires while the
            // source EXISTS, and `unpublishPage` sends the DA.live Bearer, which
            // ADR-002 measured as bypassing the restriction entirely
            // (`getDeleteAuthHeaders`). Auth does not care about the order; the
            // failure mode does.
            let unpublished = false;
            let unpublishError: string | undefined;
            try {
                unpublished = await runWithAdobeTarget(() =>
                    helixFactory(r.ctx).unpublishPage(daLiveOrg, daLiveSite, webPath),
                );
            } catch (err) {
                unpublishError = message(err);
            }
            if (!unpublished) {
                return asText({
                    deleted: false,
                    unpublished: false,
                    path: webPath,
                    error:
                        unpublishError ??
                        'Unpublish failed. The DA.live source was left in place so the page can still be removed — retry, or check site access.',
                });
            }

            try {
                const result = await runWithAdobeTarget(() =>
                    daLiveOps(r.ctx).deleteSource(daLiveOrg, daLiveSite, sourcePath),
                );
                return asText({
                    deleted: result.success,
                    unpublished,
                    path: webPath,
                    ...(result.error ? { error: result.error } : {}),
                    ...(unpublishError ? { unpublishError } : {}),
                });
            } catch (err) {
                return asText({
                    deleted: false,
                    unpublished,
                    path: webPath,
                    error: message(err),
                    ...(unpublishError ? { unpublishError } : {}),
                });
            }
        },
    );

    // ─── read_published_page ─────────────────────────────────────────────────
    // The verification primitive: what the CDN actually serves, which is the only
    // proof a publish landed. Public content, so no auth pre-flight.
    server.registerTool(
        'read_published_page',
        {
            annotations: { readOnlyHint: true, destructiveHint: false },
            description:
                "Fetch a page as published on the live CDN (.plain.html) — the way to verify a publish actually landed",
            inputSchema: { path: pathField },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const r = await openPathCall(ctxFactory, args, { needsDaLive: false });
            if (!r.ok) return asText(r.body);
            const { webPath } = r;

            const base = aemLiveBaseUrl(r.target.repoOwner, r.target.repoName);
            const url = buildSourceUrl(base, webPath, true);
            // The host is built from project metadata, so re-assert where the
            // request is going before it leaves (see SAFE_COORDINATE).
            if (!urlStaysWithin(url, `${base}/`)) {
                return asText({ path: webPath, error: 'Refusing to fetch outside the storefront host' });
            }

            try {
                const response = await fetch(url, {
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });
                const body = await response.text();
                const bytes = Buffer.byteLength(body, 'utf8');
                return asText({
                    path: webPath,
                    url,
                    status: response.status,
                    published: response.ok,
                    // Byte size is the litmus that separates a CDN rejection
                    // (bare ~13-byte "404 Not Found") from a storefront 404 (the
                    // styled ~5KB page). An agent has no other way to see it.
                    //
                    // Buffer.byteLength, NOT body.length: a JS string's length is
                    // UTF-16 code units, so a page with any multi-byte character
                    // under-reports. Measured against curl on a real storefront
                    // 404 — 5039 by .length, 5043 actual — which is the kind of
                    // quiet mismatch a field named "bytes" must not have.
                    bytes,
                    ...(response.ok
                        ? {
                              content:
                                  bytes > MAX_PUBLISHED_READ_BYTES
                                      ? body.slice(0, MAX_PUBLISHED_READ_BYTES)
                                      : body,
                              ...(bytes > MAX_PUBLISHED_READ_BYTES ? { truncated: true } : {}),
                          }
                        : {}),
                });
            } catch (err) {
                return asText({ path: webPath, url, published: false, error: message(err) });
            }
        },
    );
}
