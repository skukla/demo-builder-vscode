/**
 * Event-provider tools (AB-6) — the agent can see a workspace's Adobe I/O event
 * providers and tear one down, so eventing a journey wired can return to zero
 * without deleting the whole Adobe project.
 *
 * Restored 2026-10-03 from the pulled surface (`086bdc41c`, removed in
 * `4a3889049`) as the AGENT half only: where a person would manage event providers
 * is AB-8's open question, and the owner chose not to wait on it. The create tools
 * did not come back — providers in this lane come from an app's own install.
 *
 * ## Targeting: the OPEN PROJECT's workspace, never a selection
 *
 * Events belong to the project. These tools read the org/project/workspace from the
 * open project's file and nothing else — not `select_project`, not the extension
 * UI's cached selection — so an agent standing in a project cannot reach into a
 * workspace a previous selection left behind. The project's org is checked against
 * the token (`detectProjectOrgMismatch`) before any Adobe call.
 */

import { z } from 'zod';
import { asRawText, asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { createTeardownDeps } from '@/features/authentication/handlers/deleteAdobeProjectHandler';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { detectProjectOrgMismatch } from '@/features/authentication/services/detectProjectOrgMismatch';
import {
    deleteWorkspaceEventProvider,
    listWorkspaceEventEntities,
    type EventWorkspaceTarget,
} from '@/features/authentication/services/eventProviderLifecycle';
import type { HandlerContext } from '@/types/handlers';

const NEEDS_ADOBE = {
    needsAuth: 'adobe',
    message:
        'Adobe sign-in required. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.',
};

const NO_WORKSPACE =
    'The open project has no Adobe Console workspace (org, project and workspace). Event ' +
    'providers belong to a project — open one that has finished its Adobe setup.';

const WRONG_ORG =
    'The project uses a different Adobe organization than the one you are signed in to. ' +
    'Ask the user to use "Switch IMS Org", then try again.';

type Preflight =
    | { ok: true; auth: AuthenticationService; target: EventWorkspaceTarget }
    | { ok: false; answer: Record<string, unknown> };

/** The open project's workspace, a signed-in manager, and an org the token reaches. */
async function preflight(ctx: HandlerContext): Promise<Preflight> {
    const project = await ctx.stateManager.getCurrentProject();
    const adobe = project?.adobe;
    if (!project || !adobe?.organization || !adobe.projectId || !adobe.workspace) {
        return { ok: false, answer: { error: NO_WORKSPACE } };
    }
    const auth = ctx.authManager;
    const signedIn = auth ? await auth.isAuthenticated().catch(() => false) : false;
    if (!auth || !signedIn) {
        return { ok: false, answer: NEEDS_ADOBE };
    }
    const org = await detectProjectOrgMismatch(auth, project, ctx.logger);
    if (org && !org.reachable) {
        return { ok: false, answer: { error: WRONG_ORG } };
    }
    const target = {
        orgId: adobe.organization,
        projectId: adobe.projectId,
        workspaceId: adobe.workspace,
    };
    return { ok: true, auth, target };
}

const errorOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function registerEventProviderTools(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'list_event_providers',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: true, destructiveHint: false },
            description:
                "List the Adobe I/O event providers and event registrations in the open project's " +
                'Console workspace. Use before delete_event_provider.',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const pre = await preflight(ctx);
            if (!pre.ok) return asText(pre.answer);
            try {
                return asText(await listWorkspaceEventEntities(createTeardownDeps(pre.auth), pre.target));
            } catch (error) {
                return asText({ error: errorOf(error) });
            }
        },
    );

    server.registerTool(
        'delete_event_provider',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Delete one Adobe I/O event provider from the open project's workspace, deleting " +
                'the named registrations first. Only providers list_event_providers shows. ' +
                'Requires confirm:true.',
            // .strict(): a raw shape would silently drop a misspelt key on a delete.
            inputSchema: z
                .object({
                    providerId: z.string().min(1).describe('Provider id from list_event_providers'),
                    providerLabel: z
                        .string()
                        .describe("The provider's label from list_event_providers — shown in the consent dialog"),
                    registrationIds: z
                        .array(z.string())
                        .optional()
                        .describe("Registrations to delete FIRST (this workspace's, from list_event_providers)"),
                    confirm: z.boolean().optional().describe('Must be true to proceed'),
                })
                .strict(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asRawText('delete_event_provider requires confirm:true to proceed.', {
                    isError: true,
                });
            }
            const ctx = ctxFactory();
            const pre = await preflight(ctx);
            if (!pre.ok) return asText(pre.answer);
            try {
                const result = await deleteWorkspaceEventProvider(createTeardownDeps(pre.auth), pre.target, {
                    providerId: String(args.providerId),
                    providerLabel: String(args.providerLabel ?? ''),
                    registrationIds: Array.isArray(args.registrationIds)
                        ? args.registrationIds.map(String)
                        : [],
                });
                if (result.refused) return asText({ deleted: false, error: result.refused });
                const failed = result.items
                    .filter((i) => i.outcome === 'failed')
                    .map((i) => ({ kind: i.kind, id: i.id, error: i.error }));
                return asText({
                    deleted: failed.length === 0,
                    items: result.items.map((i) => ({ kind: i.kind, id: i.id, outcome: i.outcome })),
                    ...(failed.length ? { failed } : {}),
                });
            } catch (error) {
                return asText({ deleted: false, error: errorOf(error) });
            }
        },
    );
}
