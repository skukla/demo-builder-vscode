/**
 * Cloud-resource tools (Phase 4) — list and delete the external resources the
 * extension provisions (GitHub repos now; DA.live sites next). Thin adapters
 * over the existing EDS service layer (`getGitHubServices(...).repoOperations`),
 * reached with a fresh headless context per call — no webview, no modals.
 *
 * Gating: reads need no confirmation; an irreversible deletion uses an
 * EXTRA-STRICT gate — `confirm:true` AND a `confirmName` that must exactly match
 * the resource's `owner/repo`, mirroring GitHub's own "type the repo name to
 * delete" safeguard. Auth is pre-flighted silently and, when missing, returned
 * as a structured `needsAuth` handoff (the agent then offers `sign_in`), exactly
 * like `create_project`.
 *
 * Token efficiency: list output is paginated (`offset`/`limit`) and projected to
 * summary fields only — never the raw GitHub API shape.
 */

import { z } from 'zod';
import { runWithAdobeTarget } from './adobeTargetStore';
import { isOrgMismatchError, orgMismatchResult } from './adobeTools';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
import { DaLiveOrgOperations } from '@/features/eds/services/daLive/daLiveOrgOperations';
import type { HandlerContext } from '@/types/handlers';

/** Silent GitHub auth pre-flight → `true` when a valid token is present. */
async function githubAuthed(ctx: HandlerContext): Promise<boolean> {
    try {
        return (await getGitHubServices(ctx.context.secrets).tokenService.validateToken()).valid;
    } catch {
        return false;
    }
}

const NEEDS_GITHUB = {
    needsAuth: 'github',
    message:
        'GitHub sign-in required. Check get_auth_status, then sign_in(provider:"github", confirm:true) once the user agrees.',
};

const NEEDS_ADOBE = {
    needsAuth: 'adobe',
    message:
        'Adobe sign-in required for DA.live operations. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.',
};

/**
 * Build DA.live org + content operations from the Adobe IMS token, mirroring the
 * cleanup command's wiring. Returns null when the IMS token is missing/expired
 * (the caller turns that into a `needsAuth` handoff).
 */
async function buildDaLiveOps(
    ctx: HandlerContext,
): Promise<{ org: DaLiveOrgOperations; content: DaLiveContentOperations } | null> {
    try {
        const tokenManager = ServiceLocator.getAuthenticationService().getTokenManager();
        if (!(await tokenManager.inspectToken()).valid) {
            return null;
        }
        const tokenProvider = {
            getAccessToken: async () => (await tokenManager.inspectToken()).token ?? null,
        };
        return {
            org: new DaLiveOrgOperations(tokenProvider, ctx.logger),
            content: new DaLiveContentOperations(tokenProvider, ctx.logger),
        };
    } catch {
        return null;
    }
}

/**
 * Register the cloud-resource tools on `server`.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext for each invocation.
 */
export function registerCloudResourceTools(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'list_github_repos',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: true, destructiveHint: false },
            description: 'List GitHub repositories you can push to (paginated summary)',
            inputSchema: {
                offset: z.number().int().min(0).optional().describe('Start index for pagination (default 0)'),
                limit: z.number().int().min(1).max(100).optional().describe('Max repos to return (default 30)'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const ctx = ctxFactory();
            if (!(await githubAuthed(ctx))) {
                return asText(NEEDS_GITHUB);
            }
            const repos = await getGitHubServices(ctx.context.secrets).repoOperations.listUserRepositories();
            const offset = Math.max(0, Math.trunc(args?.offset ?? 0));
            const limit = Math.min(100, Math.max(1, Math.trunc(args?.limit ?? 30)));
            const page = repos.slice(offset, offset + limit).map((r) => ({
                fullName: r.fullName,
                isPrivate: r.isPrivate,
                updatedAt: r.updatedAt,
            }));
            return asText({ total: repos.length, offset, limit, repos: page });
        },
    );

    server.registerTool(
        'create_github_repo',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                'Create a GitHub repo from a template (the EDS storefront path). Returns the repo and whether its content has finished materialising.',
            inputSchema: {
                templateOwner: z.string().describe('Owner of the template repository'),
                templateRepo: z.string().describe('Name of the template repository'),
                name: z.string().describe('Name for the new repository'),
                targetOwner: z
                    .string()
                    .optional()
                    .describe(
                        'Namespace to create under — an org from get_auth_status.github.orgs. Omit for your personal account',
                    ),
                isPrivate: z.boolean().optional().describe('Create it private (default false)'),
                waitForContent: z
                    .boolean()
                    .optional()
                    .describe(
                        'Block until the template content is readable (default true). Set false to return as soon as the repo exists',
                    ),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const templateOwner = String(args?.templateOwner ?? '').trim();
            const templateRepo = String(args?.templateRepo ?? '').trim();
            const name = String(args?.name ?? '').trim();
            if (!templateOwner || !templateRepo || !name) {
                return asText({ error: 'templateOwner, templateRepo and name are required' });
            }

            const ctx = ctxFactory();
            if (!(await githubAuthed(ctx))) {
                return asText(NEEDS_GITHUB);
            }

            const { repoOperations } = getGitHubServices(ctx.context.secrets);
            let repo;
            try {
                repo = await repoOperations.createFromTemplate(
                    templateOwner,
                    templateRepo,
                    name,
                    args?.isPrivate === true,
                    args?.targetOwner ? String(args.targetOwner).trim() : undefined,
                );
            } catch (err) {
                return asText({
                    created: false,
                    error: err instanceof Error ? err.message : String(err),
                });
            }

            // The repo EXISTS before its template content does. Reporting success
            // at creation would hand the agent a repo whose files 404 for the next
            // few seconds, and the next step is always a push or a publish against
            // exactly those files. Waiting is the default for that reason.
            //
            // Reported separately from `created` rather than folded into it: the
            // repo is real either way, and a caller that stopped waiting needs to
            // know it exists so it does not retry creation and collide on the name.
            // `GitHubRepo` carries no `owner` — only `fullName` — so the owner is
            // taken from there rather than from `targetOwner`, which is optional
            // and absent whenever the repo went to the personal account.
            const createdOwner = repo.fullName.split('/')[0];

            let contentReady: boolean | undefined;
            if (args?.waitForContent !== false) {
                try {
                    contentReady = await repoOperations.waitForContent(createdOwner, repo.name);
                } catch {
                    contentReady = false;
                }
            }

            return asText({
                created: true,
                repo: repo.fullName,
                url: repo.htmlUrl,
                defaultBranch: repo.defaultBranch,
                isPrivate: repo.isPrivate,
                ...(contentReady === undefined ? {} : { contentReady }),
                ...(contentReady === false
                    ? { note: 'Repo created, but its template content is not readable yet. Retry the next operation shortly.' }
                    : {}),
            });
        },
    );

    server.registerTool(
        'delete_github_repo',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                'Permanently delete a GitHub repository (irreversible). Requires confirm:true and confirmName="owner/repo".',
            inputSchema: {
                owner: z.string().describe('Repository owner (GitHub username or org)'),
                repo: z.string().describe('Repository name (not the full owner/repo)'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
                confirmName: z
                    .string()
                    .optional()
                    .describe('Must equal "owner/repo" exactly — guards this irreversible deletion'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const owner = String(args?.owner ?? '').trim();
            const repo = String(args?.repo ?? '').trim();
            if (!owner || !repo) {
                return asText({ error: 'owner and repo are required' });
            }
            const fullName = `${owner}/${repo}`;
            if (args?.confirm !== true || args?.confirmName !== fullName) {
                return asText({
                    error: `delete_github_repo permanently deletes ${fullName}. To proceed, call again with confirm:true and confirmName:"${fullName}".`,
                    irreversible: true,
                });
            }
            const ctx = ctxFactory();
            if (!(await githubAuthed(ctx))) {
                return asText(NEEDS_GITHUB);
            }
            try {
                await getGitHubServices(ctx.context.secrets).repoOperations.deleteRepository(owner, repo);
                return asText({ deleted: true, repo: fullName });
            } catch (err) {
                return asText({
                    deleted: false,
                    repo: fullName,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        },
    );

    server.registerTool(
        'list_dalive_sites',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: true, destructiveHint: false },
            description: 'List DA.live sites in an organization (paginated summary)',
            inputSchema: {
                org: z.string().describe('DA.live organization name'),
                offset: z.number().int().min(0).optional().describe('Start index for pagination (default 0)'),
                limit: z.number().int().min(1).max(100).optional().describe('Max sites to return (default 30)'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const org = String(args?.org ?? '').trim();
            if (!org) {
                return asText({ error: 'org is required' });
            }
            const ops = await buildDaLiveOps(ctxFactory());
            if (!ops) {
                return asText(NEEDS_ADOBE);
            }
            try {
                // Run under the stored session org context (no global mutation).
                const sites = await runWithAdobeTarget(() => ops.org.listOrgSites(org));
                const offset = Math.max(0, Math.trunc(args?.offset ?? 0));
                const limit = Math.min(100, Math.max(1, Math.trunc(args?.limit ?? 30)));
                const page = sites.slice(offset, offset + limit).map((entry) => ({
                    name: entry.name,
                    lastModified: entry.lastModified,
                }));
                return asText({ org, total: sites.length, offset, limit, sites: page });
            } catch (err) {
                if (isOrgMismatchError(err)) return orgMismatchResult();
                throw err;
            }
        },
    );

    server.registerTool(
        'cleanup_dalive_site',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                'Delete all content for a DA.live site (irreversible). Requires confirm:true and confirmName="org/site".',
            inputSchema: {
                org: z.string().describe('DA.live organization name'),
                site: z.string().describe('DA.live site name'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
                confirmName: z
                    .string()
                    .optional()
                    .describe('Must equal "org/site" exactly — guards this irreversible deletion'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const org = String(args?.org ?? '').trim();
            const site = String(args?.site ?? '').trim();
            if (!org || !site) {
                return asText({ error: 'org and site are required' });
            }
            const fullName = `${org}/${site}`;
            if (args?.confirm !== true || args?.confirmName !== fullName) {
                return asText({
                    error: `cleanup_dalive_site permanently deletes all content for ${fullName}. To proceed, call again with confirm:true and confirmName:"${fullName}".`,
                    irreversible: true,
                });
            }
            const ops = await buildDaLiveOps(ctxFactory());
            if (!ops) {
                return asText(NEEDS_ADOBE);
            }
            try {
                const result = await runWithAdobeTarget(() => ops.content.deleteAllSiteContent(org, site));
                return asText({
                    deleted: result.success,
                    site: fullName,
                    deletedCount: result.deletedCount,
                    error: result.error,
                });
            } catch (err) {
                if (isOrgMismatchError(err)) return orgMismatchResult();
                throw err;
            }
        },
    );
}
