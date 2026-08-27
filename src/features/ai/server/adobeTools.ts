/**
 * Adobe org/project/workspace tools (Phase 3a) — list + validated select.
 *
 * Curated adapters: the existing org/project/workspace handlers push results via
 * `sendMessage` (webview-coupled), so these call `AuthenticationService` directly
 * and return structured JSON.
 *
 * Every tool pre-flights Adobe auth silently and, if missing/expired, returns a
 * `needsAuth` handoff (the agent then uses `sign_in`). `select_*` validates the
 * id against the live list and, on a bad value, returns the valid options
 * instead of guessing (the "validate, agent may choose" rule).
 *
 * `select_*` do NOT mutate the shared `aio` global (no `aio console * select`).
 * They persist the chosen org/project/workspace into the per-server
 * `adobeTargetStore`; Adobe-touching tools then read it (via
 * `runWithAdobeTarget`) and target it per-invocation through `withOrgContext`
 * env. This keeps concurrent VS-Code windows / agents from clobbering each
 * other's selection.
 */

import { z } from 'zod';
import { getAdobeTarget, runWithAdobeTarget, setAdobeTarget } from './adobeTargetStore';
import { asText } from './mcpToolResult';
import { withOrgContext } from '@/core/shell';
import {
    isProjectOwnedBy,
    resolveCurrentImsUserId,
} from '@/features/authentication/services/projectOwnership';
import { ErrorCode } from '@/types/errorCodes';
import { hasErrorCode } from '@/types/errors';
import type { HandlerContext } from '@/types/handlers';


const NEEDS_ADOBE_AUTH = asText({
    needsAuth: 'adobe',
    message: 'Adobe sign-in required. Check with get_auth_status, then sign_in(provider:"adobe", confirm:true).',
});

/** Minimal org descriptor surfaced back to the agent on a mismatch. */
export interface OrgMismatchTarget {
    id: string;
    name?: string;
}

/**
 * The canonical org-mismatch tool result, serialized like every other STRUCTURED
 * tool result (`asText`; refusals answer prose via `asRawText` instead — see
 * `mcpToolResult.ts`). It is STRUCTURED and NON-RETRYABLE so the agent stops and
 * asks the user to pick the right org instead of retrying into the same 403
 * (which would burn tokens — the shared `aio` global is unchanged by a retry).
 *
 * Mirrors the `needsAuth` handoff convention: a single typed shape every
 * Adobe-touching tool returns when it detects ORG_MISMATCH.
 */
export function orgMismatchResult(targetOrg?: OrgMismatchTarget) {
    return asText({
        error_type: 'ORG_MISMATCH',
        action_required: 'Select the correct Adobe organization (or re-login to switch account), then retry.',
        non_retryable: true,
        ...(targetOrg ? { target_org: targetOrg } : {}),
    });
}

/** True when `err` is an ORG_MISMATCH-coded error (from ensureOrgContext / entity fetch). */
export function isOrgMismatchError(err: unknown): boolean {
    return hasErrorCode(err, ErrorCode.ORG_MISMATCH);
}

/** Resolve the auth service, or null if unavailable / not authenticated. */
async function authedManager(ctx: HandlerContext): Promise<HandlerContext['authManager'] | null> {
    const mgr = ctx.authManager;
    if (!mgr) return null;
    return (await mgr.isAuthenticated()) ? mgr : null;
}

/** Trim a Console entity to what an agent needs. */
const lean = (e: { id: string; name: string; title?: string }) => ({
    id: e.id,
    name: e.name,
    ...(e.title ? { title: e.title } : {}),
});

/**
 * A project row: {@link lean} plus the ownership ANSWER, not the raw input to it.
 *
 * `who_created` used to ride along, so an agent could see why a project offered
 * no delete affordance. Measured live 2026-08-16, that was the wrong shape twice
 * over. In a real org the list is **725 projects / 111,748 bytes**, and
 * `who_created` was **46% of it** — 35KB of other people's technical-account
 * addresses shipped into a model's context.
 *
 * And the agent could not use it: the comparison is against the token's
 * `user_id` claim, which only the extension can read. So it was 35KB of a field
 * whose recipient had no way to act on it.
 *
 * `deletable` is that comparison already made — strictly more useful, ~40x
 * smaller, and it keeps other users' account ids out of the transcript. The
 * fail-closed rule is preserved: a missing creator resolves to `false`, exactly
 * as `isProjectOwnedBy` specifies.
 */
const leanProject = (
    e: { id: string; name: string; title?: string; who_created?: string },
    userId: string | undefined,
) => ({
    ...lean(e),
    deletable: isProjectOwnedBy(e.who_created, userId),
});

/**
 * Page size for Console listings.
 *
 * `list_adobe_projects` had no paging at all and returned every project in the
 * org — 725 of them in a real Adobe org, 111,748 bytes, ~28,000 tokens for one
 * call. That is not a list an agent can read; it is one it must search.
 */
const CONSOLE_PAGE_SIZE = 20;

/** Case-insensitive substring match over the fields an agent would search by. */
function matchesSearch(e: { id: string; name: string; title?: string }, term: string): boolean {
    const t = term.toLowerCase();
    return (
        e.name.toLowerCase().includes(t) ||
        (e.title ?? '').toLowerCase().includes(t) ||
        e.id.toLowerCase().includes(t)
    );
}

/**
 * Register list_orgs / list_adobe_projects / list_workspaces and
 * select_org / select_project / select_workspace.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext per call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerAdobeTools(server: any, ctxFactory: () => HandlerContext): void {
    // ── Listing ────────────────────────────────────────────────────────────────
    server.registerTool(
        'list_orgs',
        { annotations: { readOnlyHint: true, destructiveHint: false }, title: 'List Orgs', description: 'List Adobe organizations available to the signed-in user', inputSchema: {} },
        async () => {
            const mgr = await authedManager(ctxFactory());
            if (!mgr) return NEEDS_ADOBE_AUTH;
            return asText((await mgr.getOrganizations()).map(lean));
        },
    );

    server.registerTool(
        'list_adobe_projects',
        {
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'List Adobe Projects',
            description:
                'List Adobe Console projects in the currently selected org. Paged — a real org ' +
                'has hundreds. Pass search to find one by name, title or id; `deletable` says ' +
                'whether you created it and may delete it.',
            inputSchema: {
                search: z
                    .string()
                    .optional()
                    .describe('Case-insensitive substring match on name, title or id'),
                limit: z
                    .number()
                    .default(CONSOLE_PAGE_SIZE)
                    .describe(`Maximum rows to return (default ${CONSOLE_PAGE_SIZE})`),
                skip: z.number().optional().describe('Rows to skip, for paging'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const ctx = ctxFactory();
            const mgr = await authedManager(ctx);
            if (!mgr) return NEEDS_ADOBE_AUTH;
            // Honor the session-selected org so the list reflects select_org,
            // not the ambient global cache. Untargeted when nothing is stored.
            const stored = getAdobeTarget();
            const all = stored?.orgId
                ? await mgr.getProjects({ orgId: stored.orgId })
                : await mgr.getProjects();

            const search = typeof args?.search === 'string' ? args.search.trim() : '';
            const matched = search ? all.filter((p) => matchesSearch(p, search)) : all;
            const skip = Math.max(0, Math.trunc(args?.skip ?? 0));
            const limit = Math.max(1, Math.trunc(args?.limit ?? CONSOLE_PAGE_SIZE));
            const page = matched.slice(skip, skip + limit);

            // One token read for the whole page, not one per row.
            const userId = await resolveCurrentImsUserId(ctx.authManager);
            return asText({
                items: page.map((p) => leanProject(p, userId)),
                count: page.length,
                total: matched.length,
                ...(search ? { search, totalUnfiltered: all.length } : {}),
                limit,
                skip,
            });
        },
    );

    server.registerTool(
        'list_workspaces',
        { annotations: { readOnlyHint: true, destructiveHint: false }, title: 'List Workspaces', description: 'List Adobe Runtime workspaces in the currently selected project', inputSchema: {} },
        async () => {
            const mgr = await authedManager(ctxFactory());
            if (!mgr) return NEEDS_ADOBE_AUTH;
            // getWorkspaces has no org/project option, so run it under the stored
            // target's env (mirrors select_workspace). Untargeted when none set.
            try {
                const workspaces = await runWithAdobeTarget(() => mgr.getWorkspaces());
                return asText(workspaces.map(lean));
            } catch (err) {
                // A deleted target answers a bare 404, and a bare 404 is a
                // dead end: watched live 2026-08-27, the selected Console
                // project no longer existed and the agent had to diagnose the
                // stale pointer itself with the aio CLI. Name the situation
                // and the way out instead.
                const msg = err instanceof Error ? err.message : String(err);
                if (/404|not.?found/i.test(msg)) {
                    const stored = getAdobeTarget();
                    return asText({
                        error:
                            'The selected Adobe Console project was not found — it may have ' +
                            'been deleted since it was selected.',
                        selected: stored?.projectName ?? stored?.projectId ?? '(none recorded)',
                        recovery:
                            'Call list_adobe_projects to see what exists now, then ' +
                            'select_project to repoint, and try again.',
                    });
                }
                throw err;
            }
        },
    );

    // ── Selection (validated) ────────────────────────────────────────────────────
    server.registerTool(
        'select_org',
        {
            // Session targeting only — `setAdobeTarget` is an in-memory module variable,
            // so nothing outlives this process. Blocking these would stop an agent
            // navigating during an evaluation, for no safety gain.
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Select Org',
            description: 'Select the active Adobe organization by id',
            inputSchema: { orgId: z.string().describe('Organization id (from list_orgs)') },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const mgr = await authedManager(ctxFactory());
            if (!mgr) return NEEDS_ADOBE_AUTH;
            const orgs = await mgr.getOrganizations();
            const org = orgs.find((o) => o.id === args.orgId);
            if (!org) {
                return asText({ error: `Unknown orgId: ${args.orgId}`, validOptions: orgs.map(lean) });
            }
            // Persist the new org target; switching orgs drops any prior
            // project/workspace (no global mutation — no `aio console org select`).
            setAdobeTarget({ orgId: org.id, orgCode: org.code, orgName: org.name });
            return asText({ selected: { org: org.id } });
        },
    );

    server.registerTool(
        'select_project',
        {
            // Session targeting only — see select_org.
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Select Project',
            description: 'Select the active Adobe Console project by id (within the selected org)',
            inputSchema: { projectId: z.string().describe('Project id (from list_adobe_projects)') },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const mgr = await authedManager(ctxFactory());
            if (!mgr) return NEEDS_ADOBE_AUTH;
            const stored = getAdobeTarget();
            if (!stored?.orgId) return asText({ error: 'No org selected — call select_org first.' });
            // List projects within the stored org via env targeting (no global mutation).
            const projects = await mgr.getProjects({ orgId: stored.orgId });
            const project = projects.find((p) => p.id === args.projectId);
            if (!project) {
                // NEVER enumerate here. This path used to return every project in
                // the org as `validOptions` — 725 rows / 111,748 bytes measured in
                // a real org, so a single mistyped id cost more than the entire
                // tool catalogue. Name the tool that can search instead.
                return asText({
                    error: `Unknown projectId: ${args.projectId}. Use list_adobe_projects with a search term to find the right id.`,
                    projectsInOrg: projects.length,
                });
            }
            // Merge the project into the stored target; switching projects drops
            // any prior workspace.
            setAdobeTarget({
                orgId: stored.orgId,
                orgCode: stored.orgCode,
                orgName: stored.orgName,
                projectId: project.id,
                projectName: project.name,
            });
            return asText({ selected: { org: stored.orgId, project: project.id } });
        },
    );

    server.registerTool(
        'select_workspace',
        {
            // Session targeting only — see select_org.
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Select Workspace',
            description: 'Select the active Adobe Runtime workspace by id (within the selected project)',
            inputSchema: { workspaceId: z.string().describe('Workspace id (from list_workspaces)') },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const mgr = await authedManager(ctxFactory());
            if (!mgr) return NEEDS_ADOBE_AUTH;
            const stored = getAdobeTarget();
            if (!stored?.projectId) return asText({ error: 'No project selected — call select_project first.' });
            // List workspaces within the stored org/project via env targeting
            // (getWorkspaces has no orgId/projectId option, so wrap it).
            const workspaces = await withOrgContext(stored, () => mgr.getWorkspaces());
            const workspace = workspaces.find((w) => w.id === args.workspaceId);
            if (!workspace) {
                return asText({ error: `Unknown workspaceId: ${args.workspaceId}`, validOptions: workspaces.map(lean) });
            }
            setAdobeTarget({
                ...stored,
                workspaceId: workspace.id,
                workspaceName: workspace.name,
            });
            return asText({ selected: { project: stored.projectId, workspace: workspace.id } });
        },
    );
}
