/**
 * Event-provider lifecycle — the GENERIC lane of AB-6.
 *
 * Create/list/delete Adobe I/O Events providers and registrations for a
 * project workspace, with the idempotency model the integration starter kit
 * proved out (research: .rptc/research/event-provider-lifecycle/research.md):
 * deterministic provider `instance_id` + find-before-create, registrations
 * found by deterministic name, deletes registrations-first with 404-as-success
 * (inherited from {@link IoEventsClient}).
 *
 * Two lanes exist and this is only one of them: apps built on the starter kit
 * manage their OWN eventing through App Management install/uninstall — that
 * lane must never be reimplemented here (`appManagementInstaller.ts` /
 * `appManagementUninstaller.ts`). This service is for providers the EXTENSION
 * owns: it pins `provider_metadata` to {@link THIRD_PARTY_PROVIDER_METADATA}
 * on every create, which is what keeps Console-teardown's ownership filter
 * true by construction.
 *
 * Access recovery: every call runs under `withEventsAccess` — a credential not
 * subscribed to the I/O Management API 401/403s everything, so on denial the
 * credential is subscribed and the call retried on propagation delays.
 *
 * @module features/authentication/services/eventProviderLifecycle
 */

import {
    PROPAGATION_RETRY_DELAYS,
    errorMessage,
    withEventsAccess,
} from './consoleProjectTeardownEvents';
import {
    THIRD_PARTY_PROVIDER_METADATA,
    parseProviderBinding,
    type EventsAuth,
    type EventRegistrationSummary,
    type IoEventsClient,
    type RawProvider,
} from './ioEventsClient';
import type { WorkspaceS2SCredentialIds } from './types';
import { withTimeout } from '@/core/utils/promiseUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// Re-exported so callers can size their own retry expectations against ours.
export { PROPAGATION_RETRY_DELAYS };

/** The client subset this service drives (object literals satisfy it in tests). */
export type LifecycleEventsClient = Pick<
    IoEventsClient,
    | 'listProviders'
    | 'listRegistrations'
    | 'createProvider'
    | 'createEventMetadata'
    | 'createRegistration'
    | 'deleteRegistration'
    | 'deleteEventMetadata'
    | 'deleteProvider'
>;

/** The workspace the lifecycle operates on. */
export interface EventWorkspaceTarget {
    orgId: string;
    projectId: string;
    workspaceId: string;
}

/** Narrow dependency surface — same adapter pattern as `TeardownDeps`. */
export interface EventLifecycleDeps {
    getAccessToken(): Promise<string>;
    getWorkspaceS2SCredential(
        orgId: string,
        projectId: string,
        workspaceId: string
    ): Promise<WorkspaceS2SCredentialIds | undefined>;
    createWorkspaceS2SCredentialFor(
        orgId: string,
        projectId: string,
        workspaceId: string
    ): Promise<WorkspaceS2SCredentialIds>;
    subscribeManagementApi(orgId: string, idIntegration: string): Promise<void>;
    createEventsClient(auth: EventsAuth): LifecycleEventsClient;
}

/** One declared event type on a provider being created. */
export interface EventDeclaration {
    event_code: string;
    label: string;
    description: string;
}

/** Per-entity outcome, collected — never thrown — on the delete path. */
export interface EventLifecycleItem {
    kind: 'registration' | 'provider';
    id: string;
    outcome: 'deleted' | 'failed';
    error?: string;
}

/**
 * Deterministic provider instance id — the find-before-create key. Embeds
 * project + workspace (the kit's model: same app re-run finds, never
 * duplicates), prefixed so extension-created providers are recognizable.
 */
export function providerInstanceId(target: EventWorkspaceTarget, providerKey: string): string {
    return `demo-builder.${target.projectId}.${target.workspaceId}.${providerKey}`;
}

/** Resolved per-call context: an authenticated client + its credential. */
interface ResolvedClient {
    client: LifecycleEventsClient;
    credential: WorkspaceS2SCredentialIds;
    run<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Detect-or-create the workspace S2S credential, build the client, and wrap
 * every call in subscribe-on-403 recovery (one subscribe attempt with a hard
 * timeout, then propagation-delay retries — the teardown-proven policy).
 */
async function resolveClient(
    deps: EventLifecycleDeps,
    target: EventWorkspaceTarget,
): Promise<ResolvedClient> {
    const credential =
        (await deps.getWorkspaceS2SCredential(
            target.orgId,
            target.projectId,
            target.workspaceId,
        )) ??
        (await deps.createWorkspaceS2SCredentialFor(
            target.orgId,
            target.projectId,
            target.workspaceId,
        ));
    const accessToken = await deps.getAccessToken();
    const client = deps.createEventsClient({ accessToken, apiKey: credential.clientId });
    const ensureAccess = async (): Promise<void> => {
        await withTimeout(deps.subscribeManagementApi(target.orgId, credential.idIntegration), {
            timeoutMs: TIMEOUTS.LONG,
            timeoutMessage: 'Subscribing credential to the I/O Management API',
        });
    };
    return {
        client,
        credential,
        run: (operation) => withEventsAccess(operation, ensureAccess),
    };
}

/**
 * Find-before-create an event provider (plus its event metadata).
 * Idempotent: a provider with this target's deterministic `instance_id`
 * short-circuits with `created: false` and no writes.
 */
export async function createEventProvider(
    deps: EventLifecycleDeps,
    target: EventWorkspaceTarget,
    input: {
        providerKey: string;
        label: string;
        description?: string;
        events: EventDeclaration[];
    },
): Promise<{ providerId: string; created: boolean }> {
    const { client, run } = await resolveClient(deps, target);
    const instanceId = providerInstanceId(target, input.providerKey);

    const existing = await run(() => client.listProviders(target.orgId, { instanceId }));
    const found = existing.find((p) => Boolean(p.id));
    if (found?.id) {
        return { providerId: found.id, created: false };
    }

    const created = await run(() =>
        client.createProvider(target.orgId, target.projectId, target.workspaceId, {
            label: input.label,
            ...(input.description ? { description: input.description } : {}),
            instance_id: instanceId,
            provider_metadata: THIRD_PARTY_PROVIDER_METADATA,
        }),
    );
    const providerId = created.id as string;
    for (const event of input.events) {
        await run(() =>
            client.createEventMetadata(
                target.orgId,
                target.projectId,
                target.workspaceId,
                providerId,
                event,
            ),
        );
    }
    return { providerId, created: true };
}

/**
 * Find-before-create an event registration in the workspace, matched by its
 * deterministic NAME (the kit's `(client_id, name)` key — client_id is always
 * this workspace's credential here).
 */
export async function createEventRegistration(
    deps: EventLifecycleDeps,
    target: EventWorkspaceTarget,
    input: {
        name: string;
        description: string;
        deliveryType: 'webhook' | 'webhook_batch' | 'journal';
        webhookUrl?: string;
        events: Array<{ provider_id: string; event_code: string }>;
    },
): Promise<{ registrationId: string; created: boolean }> {
    const { client, credential, run } = await resolveClient(deps, target);

    const existing = await run(() =>
        client.listRegistrations(target.orgId, target.projectId, target.workspaceId),
    );
    const found = existing.find((r) => r.name === input.name);
    if (found) {
        return { registrationId: found.id, created: false };
    }

    const created = await run(() =>
        client.createRegistration(target.orgId, target.projectId, target.workspaceId, {
            client_id: credential.clientId,
            name: input.name,
            description: input.description,
            delivery_type: input.deliveryType,
            ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
            events_of_interest: input.events,
        }),
    );
    return { registrationId: created.id, created: true };
}

/** What the workspace currently holds: our providers + all its registrations. */
export interface EventEntitiesListing {
    providers: Array<{ id: string; label?: string }>;
    registrations: EventRegistrationSummary[];
}

/**
 * List the target workspace's event entities. Providers are the org list
 * filtered to THIS workspace's 3rd-party providers via each provider's
 * `rel:update` binding (there is no per-project list endpoint); an
 * unparseable binding excludes the provider — same safety rule as teardown.
 */
export async function listEventEntities(
    deps: EventLifecycleDeps,
    target: EventWorkspaceTarget,
): Promise<EventEntitiesListing> {
    const { client, run } = await resolveClient(deps, target);
    const [providers, registrations] = [
        await run(() => client.listProviders(target.orgId)),
        await run(() =>
            client.listRegistrations(target.orgId, target.projectId, target.workspaceId),
        ),
    ];
    const ours = providers.filter((p: RawProvider) => {
        if (p.provider_metadata !== THIRD_PARTY_PROVIDER_METADATA) {
            return false;
        }
        const binding = parseProviderBinding(p._links?.['rel:update']?.href ?? '');
        return (
            binding?.projectId === target.projectId && binding.workspaceId === target.workspaceId
        );
    });
    return {
        providers: ours.map((p) => ({ id: p.id as string, label: p.label })),
        registrations,
    };
}

/**
 * Delete registrations FIRST, then the provider — the safe order while
 * Adobe's docs leave delete-with-live-registrations behavior undocumented
 * (research §6). Outcomes are collected, never thrown; 404s resolve as
 * deleted (the client's already-gone semantics).
 */
export async function deleteEventEntities(
    deps: EventLifecycleDeps,
    target: EventWorkspaceTarget,
    input: { registrationIds: string[]; providerId?: string },
): Promise<EventLifecycleItem[]> {
    const { client, run } = await resolveClient(deps, target);
    const items: EventLifecycleItem[] = [];

    for (const registrationId of input.registrationIds) {
        try {
            await run(() =>
                client.deleteRegistration(
                    target.orgId,
                    target.projectId,
                    target.workspaceId,
                    registrationId,
                ),
            );
            items.push({ kind: 'registration', id: registrationId, outcome: 'deleted' });
        } catch (error) {
            items.push({
                kind: 'registration',
                id: registrationId,
                outcome: 'failed',
                error: errorMessage(error),
            });
        }
    }

    const providerId = input.providerId;
    if (providerId) {
        try {
            await run(() =>
                client.deleteProvider(
                    target.orgId,
                    target.projectId,
                    target.workspaceId,
                    providerId,
                ),
            );
            items.push({ kind: 'provider', id: providerId, outcome: 'deleted' });
        } catch (error) {
            items.push({
                kind: 'provider',
                id: providerId,
                outcome: 'failed',
                error: errorMessage(error),
            });
        }
    }

    return items;
}
