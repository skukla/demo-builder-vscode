/**
 * Event-provider lifecycle tools (AB-6) — the agent surface for I/O Events
 * providers and registrations, scoped to the CURRENT PROJECT's Console
 * workspace (eventing belongs to the project; there is no select-chain here
 * on purpose — an agent standing in a project must not create providers in
 * whatever org a previous selection left behind).
 *
 * Two lanes, and these tools are ONE of them: apps built on the integration
 * starter kit manage their own eventing through App Management
 * install/uninstall — for those, deploy/remove the integration instead. These
 * tools are for extension-owned (generic) providers, e.g. wiring custom
 * eventing for a shell-based app. The service pins the ownership metadata so
 * Console teardown keeps recognizing what it may delete.
 *
 * Deletes are destructive: they require `confirm: true` and carry consent
 * copy (`agentAlertCopy`), same contract as `remove_integration`.
 */

import { z } from 'zod';
import { asRawText, asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { createEventLifecycleDeps } from '@/features/authentication/handlers/eventLifecycleDeps';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import {
    createEventProvider,
    createEventRegistration,
    deleteEventEntities,
    listEventEntities,
    type EventWorkspaceTarget,
} from '@/features/authentication/services/eventProviderLifecycle';
import type { HandlerContext } from '@/types/handlers';

const NEEDS_ADOBE = {
    needsAuth: 'adobe',
    message:
        'Adobe sign-in required. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.',
};

/**
 * The current project's Console coordinates, or the reason there are none.
 * Events always target the project's own org/project/workspace.
 */
async function projectTarget(
    ctx: HandlerContext,
): Promise<EventWorkspaceTarget | { error: string }> {
    const project = await ctx.stateManager.getCurrentProject();
    const adobe = project?.adobe;
    if (!adobe?.organization || !adobe.projectId || !adobe.workspace) {
        return {
            error:
                'The current project has no Adobe Console context (org/project/workspace). ' +
                'Events are scoped to the project — open a project that has completed Adobe setup.',
        };
    }
    return {
        orgId: adobe.organization,
        projectId: adobe.projectId,
        workspaceId: adobe.workspace,
    };
}

/** The auth pre-flight, mirroring `adobeResourceTools.authedManager`. */
async function authed(ctx: HandlerContext): Promise<boolean> {
    const mgr = ctx.authManager;
    if (!mgr) return false;
    try {
        return await mgr.isAuthenticated();
    } catch {
        return false;
    }
}

export function registerEventProviderTools(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
    authServiceFactory: () => AuthenticationService,
): void {
    server.registerTool(
        'list_event_providers',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: true },
            description:
                "List the current project's Adobe I/O event providers and event registrations " +
                '(the ones eventing tools here manage — starter-kit apps manage their own). ' +
                'Use before creating or deleting event entities.',
            inputSchema: {},
        },
        async () => {
            const ctx = ctxFactory();
            const target = await projectTarget(ctx);
            if ('error' in target) return asText(target);
            if (!(await authed(ctx))) return asText(NEEDS_ADOBE);

            const listing = await listEventEntities(createEventLifecycleDeps(authServiceFactory()), target);
            return asText({
                ...listing,
                note:
                    'Providers listed are extension-owned (3rd-party custom) ones bound to this ' +
                    "workspace. A starter-kit app's eventing is managed by the app itself — " +
                    'deploy/remove the integration instead.',
            });
        },
    );

    server.registerTool(
        'create_event_provider',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                'Create an Adobe I/O event provider (with its event types) in the current ' +
                "project's workspace. Idempotent: re-running with the same providerKey finds " +
                'the existing provider instead of duplicating it.',
            inputSchema: {
                providerKey: z
                    .string()
                    .regex(/^[a-z0-9-]{2,40}$/)
                    .describe(
                        'Short stable key for this provider (e.g. "erp"). Part of the ' +
                            'deterministic instance id — reuse the same key to find-not-duplicate.',
                    ),
                label: z.string().min(1).max(100).describe('Human-readable provider label'),
                description: z.string().max(500).optional(),
                events: z
                    .array(
                        z.object({
                            event_code: z
                                .string()
                                .describe('Reverse-DNS event code, e.g. com.example.order.created'),
                            label: z.string(),
                            description: z.string(),
                        }),
                    )
                    .describe('Event types this provider emits (at least one is typical)'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const ctx = ctxFactory();
            const target = await projectTarget(ctx);
            if ('error' in target) return asText(target);
            if (!(await authed(ctx))) return asText(NEEDS_ADOBE);

            const result = await createEventProvider(createEventLifecycleDeps(authServiceFactory()), target, {
                providerKey: String(args.providerKey),
                label: String(args.label),
                description: args.description ? String(args.description) : undefined,
                events: Array.isArray(args.events) ? args.events : [],
            });
            return asText({
                ...result,
                verify:
                    'Confirmed — list_event_providers shows it. Deleting it later: ' +
                    'delete_event_provider (registrations first).',
            });
        },
    );

    server.registerTool(
        'create_event_registration',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                "Create an event registration (journal or webhook) in the current project's " +
                'workspace, subscribing to provider event types. Idempotent by name: an ' +
                'existing registration with this name is returned instead of duplicated.',
            inputSchema: {
                name: z
                    .string()
                    .min(1)
                    .max(80)
                    .describe('Deterministic registration name — the find-before-create key'),
                description: z.string().max(500).optional(),
                deliveryType: z
                    .enum(['journal', 'webhook', 'webhook_batch'])
                    .optional()
                    .describe('Default journal (no endpoint needed; poll the journal API)'),
                webhookUrl: z
                    .string()
                    .url()
                    .optional()
                    .describe('Required for webhook delivery; must be public HTTPS'),
                events: z
                    .array(z.object({ provider_id: z.string(), event_code: z.string() }))
                    .min(1)
                    .describe('The (provider_id, event_code) pairs to subscribe to'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const ctx = ctxFactory();
            const target = await projectTarget(ctx);
            if ('error' in target) return asText(target);
            if (!(await authed(ctx))) return asText(NEEDS_ADOBE);

            const result = await createEventRegistration(
                createEventLifecycleDeps(authServiceFactory()),
                target,
                {
                    name: String(args.name),
                    description: args.description ? String(args.description) : '',
                    deliveryType: args.deliveryType ?? 'journal',
                    webhookUrl: args.webhookUrl ? String(args.webhookUrl) : undefined,
                    events: args.events,
                },
            );
            return asText({
                ...result,
                verify: 'Confirmed — list_event_providers shows it under registrations.',
            });
        },
    );

    server.registerTool(
        'delete_event_registration',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Delete one event registration from the current project's workspace. " +
                'Stops event delivery for it. Requires confirm:true.',
            inputSchema: {
                registrationId: z.string().describe('From list_event_providers'),
                confirm: z.boolean().optional(),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asRawText('delete_event_registration requires confirm:true to proceed.');
            }
            const ctx = ctxFactory();
            const target = await projectTarget(ctx);
            if ('error' in target) return asText(target);
            if (!(await authed(ctx))) return asText(NEEDS_ADOBE);

            const items = await deleteEventEntities(createEventLifecycleDeps(authServiceFactory()), target, {
                registrationIds: [String(args.registrationId)],
            });
            return asText({ items });
        },
    );

    server.registerTool(
        'delete_event_provider',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            description:
                "Delete an event provider from the current project's workspace, deleting the " +
                'named registrations FIRST (the safe order — provider deletion with live ' +
                'registrations is undocumented upstream). Requires confirm:true.',
            inputSchema: {
                providerId: z.string().describe('From list_event_providers'),
                registrationIds: z
                    .array(z.string())
                    .optional()
                    .describe('Registrations to delete first (from list_event_providers)'),
                confirm: z.boolean().optional(),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asRawText('delete_event_provider requires confirm:true to proceed.');
            }
            const ctx = ctxFactory();
            const target = await projectTarget(ctx);
            if ('error' in target) return asText(target);
            if (!(await authed(ctx))) return asText(NEEDS_ADOBE);

            const items = await deleteEventEntities(createEventLifecycleDeps(authServiceFactory()), target, {
                registrationIds: Array.isArray(args.registrationIds)
                    ? args.registrationIds.map(String)
                    : [],
                providerId: String(args.providerId),
            });
            return asText({ items });
        },
    );
}
