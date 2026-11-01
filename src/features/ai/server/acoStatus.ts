/**
 * What `get_aco_status` reports: where a project stands with Adobe Commerce Optimizer (PL-60). Every
 * part answers on its own, so a credential that cannot reach one surface still reports the others.
 *
 * @module features/ai/server/acoStatus
 */

import { buildCommerceEndpoints } from './commerceEndpointsTool';
import { readAcoCredential } from '@/features/components/services/acoCredentialStore';
import { readAcoSettings, usesAco } from '@/features/components/services/acoSettings';
import { type AcoAdminClient, type AcoTenantFacts, createAcoAdminClient } from '@/features/data-installer/services/aco/acoAdminClient';
import { type AcoBackendStatus, readAcoConnector } from '@/features/data-installer/services/aco/acoConnector';
import { ACO_INGESTION_SCOPES } from '@/features/data-installer/services/aco/acoClient';
import { createAcoTokenSource } from '@/features/data-installer/services/aco/acoToken';
import type { AcoCredential } from '@/types/aco';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

export interface AcoStatus {
    addon: 'on' | 'off';
    missingSettings: string[];
    instance?: { tenantId: string; region: string; environment: string; catalogViewId: string; locale: string };
    credential: { held: boolean; ingestion?: string; admin?: string };
    tenant?: AcoTenantFacts | { problem: string };
    backend: AcoBackendStatus;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function readBackend(project: Project, admin: AcoAdminClient | undefined, fetchImpl: typeof fetch): Promise<AcoBackendStatus> {
    const facts = buildCommerceEndpoints(project);
    return readAcoConnector({
        backend: facts.backend,
        url: facts.endpoints.commerceGraphQl ?? facts.endpoints.mesh,
        store: facts.headers.all?.Store,
        admin,
        fetch: fetchImpl,
    });
}

/** Whether the credential's ingestion token carries the ingestion scope. */
async function ingestionReach(credential: AcoCredential, fetchImpl: typeof fetch): Promise<string> {
    try {
        const token = createAcoTokenSource({ credential, scopes: ACO_INGESTION_SCOPES, fetch: fetchImpl });
        return (await token.granted('commerce.aco.ingestion')) ? 'ok' : 'The credential was not granted the ingestion scope.';
    } catch (error) {
        return errorText(error);
    }
}

/** Whether the admin API answers this credential, by reading something harmless from it. */
async function adminReach(admin: AcoAdminClient): Promise<string> {
    try {
        const answer = JSON.parse(await admin.graphql('{ restrictedAccessKeys { keyId } }')) as { errors?: Array<{ message?: string }> };
        return answer.errors?.[0]?.message ?? 'ok';
    } catch (error) {
        return errorText(error);
    }
}

async function readTenant(admin: AcoAdminClient, tenantId: string): Promise<AcoTenantFacts | { problem: string }> {
    try {
        return await admin.tenant(tenantId);
    } catch (error) {
        return { problem: errorText(error) };
    }
}

/**
 * @throws Error when no project is open
 */
export async function readAcoStatus(ctx: HandlerContext, fetchImpl: typeof fetch = fetch): Promise<AcoStatus> {
    const project = await ctx.stateManager.getCurrentProject();
    if (!project) throw new Error('no current project. Use list_projects then set the current project.');
    const read = readAcoSettings(project);
    const settings = read && 'settings' in read ? read.settings : undefined;
    const credential = await readAcoCredential(ctx.context?.secrets, project.path);
    const admin = settings && credential ? createAcoAdminClient({ instance: settings, credential, fetch: fetchImpl }) : undefined;
    return {
        addon: usesAco(project) ? 'on' : 'off',
        missingSettings: read && 'missing' in read ? read.missing : [],
        ...(settings ? { instance: settings } : {}),
        credential: {
            held: Boolean(credential),
            ...(credential ? { ingestion: await ingestionReach(credential, fetchImpl) } : {}),
            ...(admin ? { admin: await adminReach(admin) } : {}),
        },
        ...(admin && settings ? { tenant: await readTenant(admin, settings.tenantId) } : {}),
        backend: await readBackend(project, admin, fetchImpl),
    };
}
