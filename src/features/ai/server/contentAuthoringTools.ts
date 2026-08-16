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
import { COMPONENT_IDS } from '@/core/constants';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { DA_LIVE_BASE_URL } from '@/features/eds/services/daLiveConstants';
import { resolveDaPath } from '@/features/eds/services/daLiveContentHelpers';
import {
    DaLiveContentOperations,
    createDaLiveServiceTokenProvider,
} from '@/features/eds/services/daLiveContentOperations';
import { HelixService } from '@/features/eds/services/helixService';
import type { Project } from '@/types';
import type { HandlerContext } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

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

/** Pull the DA.live + GitHub coordinates off the project's storefront metadata. */
function storefrontTarget(project: Project): StorefrontTarget | null {
    const meta = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata as
        | { githubRepo?: string; daLiveOrg?: string; daLiveSite?: string }
        | undefined;
    const [repoOwner, repoName] = (meta?.githubRepo ?? '').split('/');
    if (!repoOwner || !repoName) return null;
    return {
        repoOwner,
        repoName,
        daLiveOrg: meta?.daLiveOrg || repoOwner,
        daLiveSite: meta?.daLiveSite || repoName,
    };
}

/**
 * Canonical WEB path: leading slash, no `.html`, no trailing slash.
 *
 * This is the spelling Helix wants and the one every tool takes as input.
 * Accepts a caller's `.html` and strips it rather than rejecting — an agent that
 * has just read a DA listing will naturally have the source spelling in hand.
 */
function toWebPath(raw: string): string {
    let p = raw.trim();
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.endsWith('.html')) p = p.slice(0, -'.html'.length);
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
}

/**
 * DA source path for a web path — `/about` → `about.html`, `/` → `index.html`.
 * Delegates to the content pipeline's own helper so the two cannot drift.
 */
function toSourcePath(webPath: string): string {
    return resolveDaPath(webPath === '/' ? '/' : webPath, true);
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
    opts: { needsGitHub?: boolean } = {},
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
        return { ok: false, body: { error: 'Project is missing GitHub repo metadata' } };
    }
    if (!(await getDaLiveAuthService(ctx.context).isAuthenticated())) {
        return { ok: false, body: NEEDS_DALIVE };
    }
    if (opts.needsGitHub) {
        let githubOk = false;
        try {
            githubOk = (await getGitHubServices(ctx).tokenService.validateToken()).valid;
        } catch {
            githubOk = false;
        }
        if (!githubOk) {
            return { ok: false, body: NEEDS_GITHUB };
        }
    }
    return { ok: true, target, ctx };
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
        getGitHubServices(ctx).tokenService,
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
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerContentAuthoringTools(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    ctxFactory: () => HandlerContext,
): void {
    // ─── read_page ───────────────────────────────────────────────────────────
    // The only genuinely new transport here: nothing in the codebase read DA
    // source before this. GET /source/{org}/{site}/{path} per the DA Admin API.
    server.registerTool(
        'read_page',
        {
            description: "Read a page's DA.live source HTML from the current project's storefront",
            inputSchema: { path: pathField },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const raw = String(args?.path ?? '').trim();
            if (!raw) return asText({ error: 'path is required' });
            const r = await resolveTarget(ctxFactory);
            if (!r.ok) return asText(r.body);

            const webPath = toWebPath(raw);
            const sourcePath = toSourcePath(webPath);
            const token = await getDaLiveAuthService(r.ctx.context).getAccessToken();
            const url = `${DA_LIVE_BASE_URL}/source/${r.target.daLiveOrg}/${r.target.daLiveSite}/${sourcePath}`;

            try {
                const response = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (response.status === 404) {
                    return asText({
                        error: `Page not found in DA.live source: ${webPath} (looked for ${sourcePath})`,
                        path: webPath,
                    });
                }
                if (!response.ok) {
                    return asText({
                        error: `Failed to read page: ${response.status} ${response.statusText}`,
                        path: webPath,
                    });
                }
                return asText({ path: webPath, sourcePath, content: await response.text() });
            } catch (err) {
                return asText({ error: message(err), path: webPath });
            }
        },
    );

    // ─── write_page ──────────────────────────────────────────────────────────
    server.registerTool(
        'write_page',
        {
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
            const r = await resolveTarget(ctxFactory, { needsGitHub: publish });
            if (!r.ok) return asText(r.body);

            const webPath = toWebPath(raw);
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
                    helixFor(r.ctx).previewAndPublishPage(daLiveOrg, daLiveSite, webPath),
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
            description: 'Preview and publish an existing DA.live page to the live CDN',
            inputSchema: { path: pathField },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const raw = String(args?.path ?? '').trim();
            if (!raw) return asText({ error: 'path is required' });
            const r = await resolveTarget(ctxFactory, { needsGitHub: true });
            if (!r.ok) return asText(r.body);

            const webPath = toWebPath(raw);
            try {
                await runWithAdobeTarget(() =>
                    helixFor(r.ctx).previewAndPublishPage(
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
            description:
                "List pages and folders in the current project's DA.live storefront (defaults to the site root)",
            inputSchema: {
                path: z
                    .string()
                    .optional()
                    .describe('Directory to list, e.g. "/products"; defaults to the site root'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const r = await resolveTarget(ctxFactory);
            if (!r.ok) return asText(r.body);

            const dir = String(args?.path ?? '/').trim() || '/';
            try {
                const entries = await runWithAdobeTarget(() =>
                    daLiveOps(r.ctx).listDirectory(r.target.daLiveOrg, r.target.daLiveSite, dir),
                );
                return asText({
                    path: dir,
                    // Report each entry as the WEB path, since that is what every
                    // other tool here takes. A non-html file keeps its extension:
                    // publishing a JSON as a page is a content-bus error, so the
                    // type has to be visible.
                    entries: entries.map((e) => {
                        const withinSite = stripSitePrefix(
                            e.path,
                            r.target.daLiveOrg,
                            r.target.daLiveSite,
                        );
                        if (!e.ext) return { name: e.name, type: 'folder', path: withinSite };
                        return e.ext === 'html'
                            ? { name: e.name, type: 'page', path: toWebPath(withinSite) }
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
            if (args?.confirm !== true) {
                return asText({
                    error: `delete_page permanently removes ${toWebPath(raw)} from DA.live and unpublishes it. To proceed, call again with confirm:true.`,
                    irreversible: true,
                });
            }
            const r = await resolveTarget(ctxFactory, { needsGitHub: true });
            if (!r.ok) return asText(r.body);

            const webPath = toWebPath(raw);
            const sourcePath = toSourcePath(webPath);
            const { daLiveOrg, daLiveSite } = r.target;

            // Unpublish FIRST. The Helix admin API refuses `DELETE /live` with
            // "delete not allowed while source exists" once the source is gone
            // from under it, so the reverse order strands a published page with
            // no source to remove it by (ADR-002).
            let unpublished = false;
            let unpublishError: string | undefined;
            try {
                unpublished = await runWithAdobeTarget(() =>
                    helixFor(r.ctx).unpublishPage(daLiveOrg, daLiveSite, webPath),
                );
            } catch (err) {
                unpublishError = message(err);
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
            description:
                "Fetch a page as published on the live CDN (.plain.html) — the way to verify a publish actually landed",
            inputSchema: { path: pathField },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const raw = String(args?.path ?? '').trim();
            if (!raw) return asText({ error: 'path is required' });
            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) return asText({ error: 'No current project is open' });
            if (!isEdsProject(project)) {
                return asText({ error: 'Content authoring applies only to EDS storefront projects' });
            }
            const target = storefrontTarget(project);
            if (!target) return asText({ error: 'Project is missing GitHub repo metadata' });

            const webPath = toWebPath(raw);
            const base = `https://main--${target.repoName}--${target.repoOwner}.aem.live`;
            const url = webPath === '/' ? `${base}/index.plain.html` : `${base}${webPath}.plain.html`;

            try {
                const response = await fetch(url);
                const body = await response.text();
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
                    bytes: Buffer.byteLength(body, 'utf8'),
                    ...(response.ok ? { content: body } : {}),
                });
            } catch (err) {
                return asText({ path: webPath, url, published: false, error: message(err) });
            }
        },
    );
}
