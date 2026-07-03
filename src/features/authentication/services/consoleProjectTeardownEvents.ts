/**
 * Console-project teardown — step 3 internals (event-entity removal).
 *
 * Everything needed to clear a project's I/O Events footprint before the
 * Console delete: subscribe-on-403 access recovery, the single org-wide
 * provider discovery pass, credential escalation for provider-bearing
 * credential-less workspaces, and per-workspace registration/provider
 * deletion. Consumed only by `consoleProjectTeardown.ts` and the teardown
 * tests (which import `PROPAGATION_RETRY_DELAYS` from here directly); imports
 * from the orchestrator module are type-only, so there is no runtime cycle.
 */

import type {
    ConsoleWorkspace,
    TeardownContext,
    TeardownDeps,
    TeardownEventsClient,
} from './consoleProjectTeardown';
import {
    isEventsAccessDenied,
    parseProviderBinding,
    THIRD_PARTY_PROVIDER_METADATA,
    type ProviderBinding,
    type RawProvider,
} from './ioEventsClient';
import type { WorkspaceS2SCredentialIds } from './types';
import { withTimeout } from '@/core/utils/promiseUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Delays between events-API retries after subscribing a credential to the
 * I/O Management API — subscription entitlement propagates asynchronously
 * (spike: the 403 usually clears within seconds).
 */
export const PROPAGATION_RETRY_DELAYS: readonly number[] = [2_000, 5_000, 10_000];

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Human-readable message for a collected item; never includes auth material. */
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Subscribe a credential to the I/O Management API, with a hard timeout and
 * exactly one retry — the spike observed the call hanging >2 min once before
 * succeeding on retry.
 */
async function ensureManagementApiSubscribed(
    deps: TeardownDeps,
    orgId: string,
    idIntegration: string,
): Promise<void> {
    const subscribeOnce = (): Promise<void> =>
        withTimeout(deps.subscribeManagementApi(orgId, idIntegration), {
            timeoutMs: TIMEOUTS.LONG,
            timeoutMessage: 'Subscribing credential to the I/O Management API',
        });
    try {
        await subscribeOnce();
    } catch {
        await subscribeOnce();
    }
}

/**
 * Run an events-API call with subscribe-on-403 recovery: on access denial,
 * `ensureAccess` (subscribe) then retry on {@link PROPAGATION_RETRY_DELAYS}.
 * Non-access errors and exhausted retries propagate to the caller.
 */
async function withEventsAccess<T>(
    operation: () => Promise<T>,
    ensureAccess: () => Promise<void>,
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isEventsAccessDenied(error)) {
            throw error;
        }
    }
    await ensureAccess();
    let lastError: unknown;
    for (const delayMs of PROPAGATION_RETRY_DELAYS) {
        await sleep(delayMs);
        try {
            return await operation();
        } catch (error) {
            if (!isEventsAccessDenied(error)) {
                throw error;
            }
            lastError = error;
        }
    }
    throw lastError;
}

/**
 * Keep only this project's 3rd-party providers with a parseable binding,
 * partitioned by workspace. Unparseable bindings are dropped — a provider
 * whose binding cannot be parsed must never be deleted.
 */
function partitionProjectProviders(
    providers: RawProvider[],
    projectId: string,
): Map<string, ProviderBinding[]> {
    const partitions = new Map<string, ProviderBinding[]>();
    for (const provider of providers) {
        if (provider.provider_metadata !== THIRD_PARTY_PROVIDER_METADATA) {
            continue;
        }
        const binding = parseProviderBinding(provider._links?.['rel:update']?.href ?? '');
        if (!binding || binding.projectId !== projectId) {
            continue;
        }
        const bindings = partitions.get(binding.workspaceId) ?? [];
        bindings.push({ ...binding, label: provider.label });
        partitions.set(binding.workspaceId, bindings);
    }
    return partitions;
}

/**
 * Single org-wide discovery pass on the first usable credential. Returns the
 * per-workspace provider partitions, or `undefined` after collecting a failed
 * item when discovery is impossible (teardown must then abort).
 */
async function discoverProviderPartitions(
    ctx: TeardownContext,
    firstCredential: WorkspaceS2SCredentialIds,
): Promise<Map<string, ProviderBinding[]> | undefined> {
    const client = ctx.deps.createEventsClient({
        accessToken: ctx.accessToken,
        apiKey: firstCredential.clientId,
    });
    try {
        const providers = await withEventsAccess(
            () => client.listProviders(ctx.target.orgId),
            () =>
                ensureManagementApiSubscribed(
                    ctx.deps,
                    ctx.target.orgId,
                    firstCredential.idIntegration,
                ),
        );
        return partitionProjectProviders(providers, ctx.target.projectId);
    } catch (error) {
        ctx.items.push({
            kind: 'provider',
            id: 'provider-discovery',
            label: 'Event provider discovery',
            outcome: 'failed',
            error: errorMessage(error),
        });
        return undefined;
    }
}

/**
 * Create + subscribe a credential for every provider-bearing workspace that
 * has none. On failure the workspace AND its providers are collected as
 * failed (they will block the project delete — never silently skipped).
 */
async function escalateCredentialLessWorkspaces(
    ctx: TeardownContext,
    partitions: Map<string, ProviderBinding[]>,
): Promise<void> {
    for (const [workspaceId, bindings] of partitions) {
        if (ctx.credentials.has(workspaceId)) {
            continue;
        }
        const workspaceName = ctx.workspaceNames.get(workspaceId);
        try {
            const credential = await ctx.deps.createWorkspaceS2SCredentialFor(
                ctx.target.orgId,
                ctx.target.projectId,
                workspaceId,
            );
            await ensureManagementApiSubscribed(ctx.deps, ctx.target.orgId, credential.idIntegration);
            ctx.credentials.set(workspaceId, credential);
        } catch (error) {
            ctx.items.push({
                kind: 'workspace',
                id: workspaceId,
                workspaceName,
                outcome: 'failed',
                error: `Could not create a workspace credential: ${errorMessage(error)}`,
            });
            for (const binding of bindings) {
                ctx.items.push({
                    kind: 'provider',
                    id: binding.providerId,
                    label: binding.label,
                    workspaceName,
                    outcome: 'failed',
                    error: 'No usable workspace credential to delete this provider',
                });
            }
        }
    }
}

/** List + delete the workspace's registrations, collecting per-outcome items. */
async function deleteWorkspaceRegistrations(
    ctx: TeardownContext,
    client: TeardownEventsClient,
    workspaceId: string,
    credential: WorkspaceS2SCredentialIds,
): Promise<void> {
    const { orgId, projectId } = ctx.target;
    const workspaceName = ctx.workspaceNames.get(workspaceId);
    let registrations;
    try {
        registrations = await withEventsAccess(
            () => client.listRegistrations(orgId, projectId, workspaceId),
            () => ensureManagementApiSubscribed(ctx.deps, orgId, credential.idIntegration),
        );
    } catch (error) {
        ctx.items.push({
            kind: 'workspace',
            id: workspaceId,
            workspaceName,
            outcome: 'failed',
            error: `Could not list event registrations: ${errorMessage(error)}`,
        });
        return;
    }
    for (const registration of registrations) {
        try {
            await client.deleteRegistration(orgId, projectId, workspaceId, registration.id);
            ctx.items.push({
                kind: 'registration',
                id: registration.id,
                label: registration.name,
                workspaceName,
                outcome: 'deleted',
            });
        } catch (error) {
            ctx.items.push({
                kind: 'registration',
                id: registration.id,
                label: registration.name,
                workspaceName,
                outcome: 'failed',
                error: errorMessage(error),
            });
        }
    }
}

/** Delete the workspace's partitioned providers, collecting per-outcome items. */
async function deleteWorkspaceProviders(
    ctx: TeardownContext,
    client: TeardownEventsClient,
    workspaceId: string,
    bindings: ProviderBinding[],
): Promise<void> {
    const workspaceName = ctx.workspaceNames.get(workspaceId);
    for (const binding of bindings) {
        try {
            await client.deleteProvider(
                ctx.target.orgId,
                binding.projectId,
                binding.workspaceId,
                binding.providerId,
            );
            ctx.items.push({
                kind: 'provider',
                id: binding.providerId,
                label: binding.label,
                workspaceName,
                outcome: 'deleted',
            });
        } catch (error) {
            ctx.items.push({
                kind: 'provider',
                id: binding.providerId,
                label: binding.label,
                workspaceName,
                outcome: 'failed',
                error: errorMessage(error),
            });
        }
    }
}

/** Tear down one workspace: registrations first, then its bound providers. */
async function teardownWorkspace(
    ctx: TeardownContext,
    workspaceId: string,
    bindings: ProviderBinding[],
): Promise<void> {
    const credential = ctx.credentials.get(workspaceId);
    if (!credential) {
        if (bindings.length === 0) {
            ctx.items.push({
                kind: 'workspace',
                id: workspaceId,
                workspaceName: ctx.workspaceNames.get(workspaceId),
                outcome: 'skipped',
            });
        }
        // Provider-bearing credential-less workspaces were already collected
        // as failures during escalation — nothing more to do here.
        return;
    }
    const client = ctx.deps.createEventsClient({
        accessToken: ctx.accessToken,
        apiKey: credential.clientId,
    });
    await deleteWorkspaceRegistrations(ctx, client, workspaceId, credential);
    await deleteWorkspaceProviders(ctx, client, workspaceId, bindings);
}

/**
 * Step 3: discovery → escalation → per-workspace teardown.
 * Returns false when discovery is impossible (caller must abort).
 */
export async function teardownEventEntities(
    ctx: TeardownContext,
    workspaces: ConsoleWorkspace[],
    firstCredential: WorkspaceS2SCredentialIds,
): Promise<boolean> {
    const partitions = await discoverProviderPartitions(ctx, firstCredential);
    if (!partitions) {
        return false;
    }
    await escalateCredentialLessWorkspaces(ctx, partitions);
    for (const workspace of workspaces) {
        const bindings = partitions.get(workspace.id) ?? [];
        partitions.delete(workspace.id);
        await teardownWorkspace(ctx, workspace.id, bindings);
    }
    // Defensive: bindings for workspaces the Console listing did not include.
    for (const [workspaceId, bindings] of partitions) {
        await teardownWorkspace(ctx, workspaceId, bindings);
    }
    return true;
}
