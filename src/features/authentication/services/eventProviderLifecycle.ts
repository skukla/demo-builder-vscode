/**
 * Event-provider lifecycle (AB-6) — list one workspace's Adobe I/O event entities,
 * and tear one provider down.
 *
 * Console teardown already removes EVERY event entity of a project before deleting
 * it. This is the same capability one provider at a time, so an agent can return a
 * workspace's eventing to zero without deleting the project. It reuses teardown's
 * deps adapter (`createTeardownDeps`), its access recovery and its ownership filter,
 * rather than keeping a second copy of any of them.
 *
 * Two rules decide the shape:
 *
 * - **The list is a read, so it never writes.** No credential is created on a miss
 *   and the credential is never subscribed to the I/O Management API on a 403 —
 *   either would be a write hiding in a read. It says what is missing instead.
 * - **The delete deletes only what this workspace owns.** The provider must be a
 *   3rd-party custom provider whose binding names this project AND workspace (the
 *   same test teardown uses), its label must match what the consent dialog showed,
 *   and every registration id must be one of this workspace's. Anything else is
 *   refused before the first DELETE. Registrations go first, then the provider —
 *   the safe order while Adobe leaves delete-with-live-registrations undocumented.
 *
 * Creation was removed with the rest of the pulled surface (`4a3889049`) and is not
 * back: providers in this lane come from an app's own install
 * (`appManagementInstaller.ts`), which is also what recreates them.
 *
 * @module features/authentication/services/eventProviderLifecycle
 */

import type { TeardownDeps, TeardownEventsClient } from './consoleProjectTeardown';
import {
    ensureManagementApiSubscribed,
    errorMessage,
    partitionProjectProviders,
    withEventsAccess,
} from './consoleProjectTeardownEvents';
import { isEventsAccessDenied, type EventRegistrationSummary } from './ioEventsClient';

/** The teardown deps this service drives — the same adapter, a narrower view. */
type EventLifecycleDeps = Pick<
    TeardownDeps,
    | 'getAccessToken'
    | 'getWorkspaceS2SCredential'
    | 'createWorkspaceS2SCredentialFor'
    | 'subscribeManagementApi'
    | 'createEventsClient'
>;

/** The one Console workspace the lifecycle operates on. */
export interface EventWorkspaceTarget {
    orgId: string;
    projectId: string;
    workspaceId: string;
}

/** What the workspace holds, or why it could not be read without writing. */
type EventEntitiesListing =
    | {
          available: true;
          providers: Array<{ id: string; label?: string }>;
          registrations: EventRegistrationSummary[];
      }
    | { available: false; reason: string };

/** Per-entity delete outcome — collected, never thrown. */
interface EventLifecycleItem {
    kind: 'registration' | 'provider';
    id: string;
    label?: string;
    outcome: 'deleted' | 'failed';
    error?: string;
}

/** A delete's answer: a refusal (nothing deleted), or the collected outcomes. */
interface DeleteProviderResult {
    refused: string | undefined;
    items: EventLifecycleItem[];
}

const NO_CREDENTIAL =
    'This workspace has no server-to-server credential, so its event providers cannot be ' +
    'read without creating one. A workspace with no credential has no event registrations.';
const NOT_SUBSCRIBED =
    "This workspace's credential is not subscribed to the I/O Management API, so its event " +
    'providers cannot be read. Listing does not subscribe it — that would be a write.';

/** This workspace's providers, by the ownership test Console teardown uses. */
async function ownProviders(
    client: TeardownEventsClient,
    target: EventWorkspaceTarget,
    run: <T>(op: () => Promise<T>) => Promise<T>,
): Promise<Array<{ id: string; label?: string }>> {
    const all = await run(() => client.listProviders(target.orgId));
    const bindings = partitionProjectProviders(all, target.projectId).get(target.workspaceId) ?? [];
    return bindings.map((b) => ({ id: b.providerId, label: b.label }));
}

/**
 * List the workspace's own event providers and its registrations. READ-ONLY:
 * a missing credential or an unsubscribed one is reported, never repaired.
 */
export async function listWorkspaceEventEntities(
    deps: EventLifecycleDeps,
    target: EventWorkspaceTarget,
): Promise<EventEntitiesListing> {
    const { orgId, projectId, workspaceId } = target;
    const credential = await deps.getWorkspaceS2SCredential(orgId, projectId, workspaceId);
    if (!credential) {
        return { available: false, reason: NO_CREDENTIAL };
    }
    const accessToken = await deps.getAccessToken();
    const client = deps.createEventsClient({ accessToken, apiKey: credential.clientId });
    const direct = <T>(op: () => Promise<T>): Promise<T> => op();
    try {
        const providers = await ownProviders(client, target, direct);
        const registrations = await client.listRegistrations(orgId, projectId, workspaceId);
        return { available: true, providers, registrations };
    } catch (error) {
        if (isEventsAccessDenied(error)) {
            return { available: false, reason: NOT_SUBSCRIBED };
        }
        throw error;
    }
}

/** Why a delete request names something this workspace does not own, if it does. */
function refusalFor(
    providers: Array<{ id: string; label?: string }>,
    registrations: EventRegistrationSummary[],
    input: { providerId: string; providerLabel: string; registrationIds: string[] },
): string | undefined {
    const provider = providers.find((p) => p.id === input.providerId);
    if (!provider) {
        return (
            `"${input.providerId}" is not an event provider of this workspace — ` +
            'list_event_providers shows the ones that are. Nothing was deleted.'
        );
    }
    if ((provider.label ?? '') !== input.providerLabel) {
        return (
            `Provider "${input.providerId}" is labelled "${provider.label ?? ''}", not ` +
            `"${input.providerLabel}". Nothing was deleted.`
        );
    }
    const known = new Set(registrations.map((r) => r.id));
    const foreign = input.registrationIds.filter((id) => !known.has(id));
    if (foreign.length > 0) {
        return (
            `Not registrations of this workspace: ${foreign.join(', ')}. ` +
            'Nothing was deleted.'
        );
    }
    return undefined;
}

/** Run one delete and collect its outcome. */
async function collect(
    items: EventLifecycleItem[],
    item: Omit<EventLifecycleItem, 'outcome' | 'error'>,
    op: () => Promise<void>,
): Promise<void> {
    try {
        await op();
        items.push({ ...item, outcome: 'deleted' });
    } catch (error) {
        items.push({ ...item, outcome: 'failed', error: errorMessage(error) });
    }
}

/**
 * Delete one of this workspace's event providers, after the named registrations.
 * A WRITE, so it may create the workspace credential and subscribe it to get
 * access — exactly as Console teardown does.
 */
export async function deleteWorkspaceEventProvider(
    deps: EventLifecycleDeps,
    target: EventWorkspaceTarget,
    input: { providerId: string; providerLabel: string; registrationIds: string[] },
): Promise<DeleteProviderResult> {
    const { orgId, projectId, workspaceId } = target;
    const credential =
        (await deps.getWorkspaceS2SCredential(orgId, projectId, workspaceId)) ??
        (await deps.createWorkspaceS2SCredentialFor(orgId, projectId, workspaceId));
    const accessToken = await deps.getAccessToken();
    const client = deps.createEventsClient({ accessToken, apiKey: credential.clientId });
    const run = <T>(op: () => Promise<T>): Promise<T> =>
        withEventsAccess(op, () =>
            ensureManagementApiSubscribed(deps, orgId, credential.idIntegration),
        );

    const providers = await ownProviders(client, target, run);
    const registrations = await run(() => client.listRegistrations(orgId, projectId, workspaceId));
    const refused = refusalFor(providers, registrations, input);
    if (refused) {
        return { refused, items: [] };
    }

    const items: EventLifecycleItem[] = [];
    for (const id of input.registrationIds) {
        await collect(items, { kind: 'registration', id }, () =>
            client.deleteRegistration(orgId, projectId, workspaceId, id),
        );
    }
    await collect(
        items,
        { kind: 'provider', id: input.providerId, label: input.providerLabel },
        () => client.deleteProvider(orgId, projectId, workspaceId, input.providerId),
    );
    return { refused: undefined, items };
}
