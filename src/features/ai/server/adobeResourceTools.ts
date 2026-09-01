/**
 * Adobe Console resource CREATION and deletion (Phase 4, Group 2).
 *
 * Separate from `adobeTools.ts`, which lists and selects. That file is at 302
 * lines and answers "what is there"; these three change what is there.
 *
 * ## Every tool here passes its target EXPLICITLY. That is the point.
 *
 * `AdobeEntityFetcher.createProject` / `createWorkspace` resolved their target
 * from `cacheManager.getCachedOrganization()` / `getCachedProject()` — the
 * selection made in the EXTENSION UI. The agent's selection lives somewhere
 * else entirely: `select_org` / `select_project` write only `adobeTargetStore`
 * (`adobeTools.ts:263`) and never touch that cache.
 *
 * So the obvious implementation was silently wrong:
 *
 *     select_project("Project A")     → writes adobeTargetStore
 *     create_adobe_workspace("dev")   → creates it in whatever the UI selected
 *
 * A workspace created in someone else's project, with no error. This is the
 * defect the phase-4 plan records as 0a, and its warning — "do not build more
 * Adobe tools on top of this until it is settled" — is why the fetcher now takes
 * an optional explicit target that overrides the cache. The webview passes
 * nothing and behaves exactly as before; these tools always pass one.
 *
 * `getWorkspaces` already took `target?: { orgId }` with the same
 * `?? cachedOrg?.id` fallback, so this follows a convention rather than adding
 * one.
 */

import { z } from 'zod';
import { getAdobeTarget } from './adobeTargetStore';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { createTeardownDeps } from '@/features/authentication/handlers/deleteAdobeProjectHandler';
import { teardownConsoleProject } from '@/features/authentication/services/consoleProjectTeardown';
import { isConsoleOpFailure } from '@/features/authentication/services/types';
import type { HandlerContext } from '@/types/handlers';

const NEEDS_ADOBE = {
    needsAuth: 'adobe',
    message:
        'Adobe sign-in required. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.',
};

/**
 * Silent auth pre-flight returning the MANAGER, not a boolean — never prompts;
 * the agent gets a handoff instead. Mirrors `authedManager` in `adobeTools.ts`,
 * and returning the manager is what lets callers avoid a non-null assertion.
 */
async function authedManager(ctx: HandlerContext): Promise<HandlerContext['authManager'] | null> {
    const mgr = ctx.authManager;
    if (!mgr) return null;
    try {
        return (await mgr.isAuthenticated()) ? mgr : null;
    } catch {
        return null;
    }
}

/**
 * The org the agent selected, or an instruction to select one.
 *
 * Never falls back to the cached UI selection. A fallback here is precisely the
 * bug: it would succeed against the wrong org rather than telling the agent to
 * choose.
 */
function requireOrg(): { orgId: string } | { error: string } {
    const target = getAdobeTarget();
    if (!target?.orgId) {
        return { error: 'No org selected. Call list_orgs, then select_org(orgId) first.' };
    }
    return { orgId: target.orgId };
}

function requireProject(): { orgId: string; projectId: string } | { error: string } {
    const target = getAdobeTarget();
    if (!target?.orgId) {
        return { error: 'No org selected. Call list_orgs, then select_org(orgId) first.' };
    }
    if (!target.projectId) {
        return {
            error: 'No project selected. Call list_adobe_projects, then select_project(projectId) first.',
        };
    }
    return { orgId: target.orgId, projectId: target.projectId };
}

export function registerAdobeResourceTools(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'create_adobe_project',
        {
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                'Create an Adobe Developer Console project in the selected org (select_org first). Returns the project, or why it could not be created.',
            inputSchema: {
                name: z.string().describe('Project title, max 200 characters'),
                description: z
                    .string()
                    .optional()
                    .describe('Project description, max 500 characters'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const target = requireOrg();
            if ('error' in target) return asText(target);

            const mgr = await authedManager(ctxFactory());
            if (!mgr) return asText(NEEDS_ADOBE);

            const project = await mgr.createProject(
                String(args?.name ?? ''),
                String(args?.description ?? ''),
                { orgId: target.orgId },
            );

            // The service carries the REAL reason now (the SDK's own message —
            // e.g. Console's "Project name length must be less than 20"). The
            // previous guessing-list here named three causes and the measured
            // failure was none of them.
            if (isConsoleOpFailure(project)) {
                return asText({ created: false, error: project.error });
            }
            return asText({ created: true, project: { id: project.id, name: project.name } });
        },
    );

    server.registerTool(
        'create_adobe_workspace',
        {
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                'Create a workspace in the SELECTED Adobe project (select_org and select_project first).',
            inputSchema: {
                name: z.string().describe('Workspace title, max 200 characters'),
                description: z
                    .string()
                    .optional()
                    .describe('Workspace description, max 500 characters'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const target = requireProject();
            if ('error' in target) return asText(target);

            const mgr = await authedManager(ctxFactory());
            if (!mgr) return asText(NEEDS_ADOBE);

            const workspace = await mgr.createWorkspace(
                String(args?.name ?? ''),
                String(args?.description ?? ''),
                { orgId: target.orgId, projectId: target.projectId },
            );

            if (isConsoleOpFailure(workspace)) {
                return asText({ created: false, error: workspace.error });
            }
            return asText({
                created: true,
                workspace: { id: workspace.id, name: workspace.name },
                projectId: target.projectId,
            });
        },
    );

    server.registerTool(
        'delete_adobe_project',
        {
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                'Permanently delete an Adobe Console project and everything in it (irreversible). Requires confirm:true and confirmName equal to the project name.',
            inputSchema: {
                projectId: z.string().describe('Project id from list_adobe_projects'),
                projectName: z.string().describe('Project name — echoed back as confirmName'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
                confirmName: z
                    .string()
                    .optional()
                    .describe('Must equal projectName exactly — guards this irreversible deletion'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const projectId = String(args?.projectId ?? '').trim();
            const projectName = String(args?.projectName ?? '').trim();
            if (!projectId || !projectName) {
                return asText({ error: 'projectId and projectName are required' });
            }

            // Same extra-strict gate as delete_github_repo: confirm AND an exact
            // name echo. Deleting a Console project destroys its workspaces and
            // credentials with it.
            if (args?.confirm !== true || args?.confirmName !== projectName) {
                return asText({
                    error:
                        `delete_adobe_project permanently deletes "${projectName}" and all of its workspaces and ` +
                        `credentials. To proceed, call again with confirm:true and confirmName:"${projectName}".`,
                    irreversible: true,
                });
            }

            const target = requireOrg();
            if ('error' in target) return asText(target);

            // Step-level debug lines: when this hung headless (AI-5) the args log
            // was the LAST line anywhere, so the hang site was unfindable.
            const ctx = ctxFactory();
            ctx.logger.debug('[delete_adobe_project] checking auth…');
            if (!(await authedManager(ctx))) return asText(NEEDS_ADOBE);
            ctx.logger.debug('[delete_adobe_project] auth ok — starting teardown');

            // TeardownTarget already takes orgId/projectId explicitly, so this path
            // never consulted the cache — no service change was needed for it.
            const result = await teardownConsoleProject(
                createTeardownDeps(ServiceLocator.getAuthenticationService()),
                { orgId: target.orgId, projectId, projectTitle: projectName },
                // Teardown removes event registrations and providers before the
                // project itself, and runs long enough that a silent wait reads
                // as a hang. Step count rides along for the same reason reset's
                // does.
                (p) => reportPhase(`${p.message} (${p.step}/${p.totalSteps})`),
            );

            // `items` is the per-step teardown log the dashboard renders. An agent
            // needs it only when something failed, so the FAILED steps ride along
            // on failure and the rest is dropped. `outcome` is a three-state
            // ('deleted' | 'skipped' | 'failed') — 'skipped' is a normal outcome
            // for a step with nothing to do, so only 'failed' is a problem.
            const failed = result.items
                .filter((i) => i.outcome === 'failed')
                .map((i) => ({ kind: i.kind, label: i.label ?? i.id, error: i.error }));

            return asText({
                deleted: result.projectDeleted,
                project: projectName,
                ...(failed.length ? { failedSteps: failed } : {}),
            });
        },
    );
}
