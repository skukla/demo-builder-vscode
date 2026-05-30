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
import { ServiceLocator } from '@/core/di';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import { DaLiveOrgOperations } from '@/features/eds/services/daLiveOrgOperations';
import type { HandlerContext } from '@/types/handlers';

/** Wrap a JSON-serializable value as an MCP text result. */
function asText(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/** Silent GitHub auth pre-flight → `true` when a valid token is present. */
async function githubAuthed(ctx: HandlerContext): Promise<boolean> {
    try {
        return (await getGitHubServices(ctx).tokenService.validateToken()).valid;
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
            getAccessToken: async () => (await tokenManager.getAccessToken()) ?? null,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'list_github_repos',
        {
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
            const repos = await getGitHubServices(ctx).repoOperations.listUserRepositories();
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
        'delete_github_repo',
        {
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
                await getGitHubServices(ctx).repoOperations.deleteRepository(owner, repo);
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
            const sites = await ops.org.listOrgSites(org);
            const offset = Math.max(0, Math.trunc(args?.offset ?? 0));
            const limit = Math.min(100, Math.max(1, Math.trunc(args?.limit ?? 30)));
            const page = sites.slice(offset, offset + limit).map((entry) => ({
                name: entry.name,
                lastModified: entry.lastModified,
            }));
            return asText({ org, total: sites.length, offset, limit, sites: page });
        },
    );

    server.registerTool(
        'cleanup_dalive_sites',
        {
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
                    error: `cleanup_dalive_sites permanently deletes all content for ${fullName}. To proceed, call again with confirm:true and confirmName:"${fullName}".`,
                    irreversible: true,
                });
            }
            const ops = await buildDaLiveOps(ctxFactory());
            if (!ops) {
                return asText(NEEDS_ADOBE);
            }
            const result = await ops.content.deleteAllSiteContent(org, site);
            return asText({
                deleted: result.success,
                site: fullName,
                deletedCount: result.deletedCount,
                error: result.error,
            });
        },
    );
}
