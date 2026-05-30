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
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
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
}
