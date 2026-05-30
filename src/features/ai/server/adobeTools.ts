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
 */

import { z } from 'zod';
import type { HandlerContext } from '@/types/handlers';

function asText(value: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

const NEEDS_ADOBE_AUTH = asText({
    needsAuth: 'adobe',
    message: 'Adobe sign-in required. Check with get_auth_status, then sign_in(provider:"adobe", confirm:true).',
});

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
            return asText((await mgr.getProjects()).map(lean));
        },
    );

    server.registerTool(
        'list_workspaces',
        { title: 'List Workspaces', description: 'List Adobe Runtime workspaces in the currently selected project', inputSchema: {} },
        async () => {
            const mgr = await authedManager(ctxFactory());
            if (!mgr) return NEEDS_ADOBE_AUTH;
            return asText((await mgr.getWorkspaces()).map(lean));
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
            if (!orgs.some((o) => o.id === args.orgId)) {
                return asText({ error: `Unknown orgId: ${args.orgId}`, validOptions: orgs.map(lean) });
            }
            const success = await mgr.selectOrganization(args.orgId);
            return asText({ selected: { org: args.orgId }, success });
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
            const org = await mgr.getCurrentOrganization();
            if (!org) return asText({ error: 'No org selected — call select_org first.' });
            const projects = await mgr.getProjects();
            if (!projects.some((p) => p.id === args.projectId)) {
                return asText({ error: `Unknown projectId: ${args.projectId}`, validOptions: projects.map(lean) });
            }
            const success = await mgr.selectProject(args.projectId, org.id);
            return asText({ selected: { org: org.id, project: args.projectId }, success });
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
            const project = await mgr.getCurrentProject();
            if (!project) return asText({ error: 'No project selected — call select_project first.' });
            const workspaces = await mgr.getWorkspaces();
            if (!workspaces.some((w) => w.id === args.workspaceId)) {
                return asText({ error: `Unknown workspaceId: ${args.workspaceId}`, validOptions: workspaces.map(lean) });
            }
            const success = await mgr.selectWorkspace(args.workspaceId, project.id);
            return asText({ selected: { project: project.id, workspace: args.workspaceId }, success });
        },
    );
}
