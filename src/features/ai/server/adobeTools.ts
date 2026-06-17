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
import { withOrgContext } from '@/core/shell';
import { ErrorCode } from '@/types/errorCodes';
import { hasErrorCode } from '@/types/errors';
import type { HandlerContext } from '@/types/handlers';

function asText(value: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

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
 * The canonical org-mismatch tool result, serialized like every other MCP tool
 * result (`asText`). It is STRUCTURED and NON-RETRYABLE so the agent stops and
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

const lean = (e: { id: string; name: string; title?: string }) => ({ id: e.id, name: e.name, ...(e.title ? { title: e.title } : {}) });

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
        { title: 'List Orgs', description: 'List Adobe organizations available to the signed-in user', inputSchema: {} },
        async () => {
            const mgr = await authedManager(ctxFactory());
            if (!mgr) return NEEDS_ADOBE_AUTH;
            return asText((await mgr.getOrganizations()).map(lean));
        },
    );

    server.registerTool(
        'list_adobe_projects',
        { title: 'List Adobe Projects', description: 'List Adobe Console projects in the currently selected org', inputSchema: {} },
        async () => {
            const mgr = await authedManager(ctxFactory());
            if (!mgr) return NEEDS_ADOBE_AUTH;
            // Honor the session-selected org so the list reflects select_org,
            // not the ambient global cache. Untargeted when nothing is stored.
            const stored = getAdobeTarget();
            const projects = stored?.orgId
                ? await mgr.getProjects({ orgId: stored.orgId })
                : await mgr.getProjects();
            return asText(projects.map(lean));
        },
    );

    server.registerTool(
        'list_workspaces',
        { title: 'List Workspaces', description: 'List Adobe Runtime workspaces in the currently selected project', inputSchema: {} },
        async () => {
            const mgr = await authedManager(ctxFactory());
            if (!mgr) return NEEDS_ADOBE_AUTH;
            // getWorkspaces has no org/project option, so run it under the stored
            // target's env (mirrors select_workspace). Untargeted when none set.
            const workspaces = await runWithAdobeTarget(() => mgr.getWorkspaces());
            return asText(workspaces.map(lean));
        },
    );

    // ── Selection (validated) ────────────────────────────────────────────────────
    server.registerTool(
        'select_org',
        {
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
                return asText({ error: `Unknown projectId: ${args.projectId}`, validOptions: projects.map(lean) });
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
