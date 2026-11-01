/**
 * What `get_aco_status` reports: where a project stands with Adobe Commerce Optimizer (PL-60). Every
 * part answers on its own, so a credential that cannot reach one surface still reports the others.
 *
 * Whether Adobe's connector is on is read differently per backend, because the obvious signals lie:
 * - ACCS: only the tenant service's `acoEnabled` says. The schema cannot: a tenant with `acoEnabled`
 *   false already declares `commerceOptimizer` and `Company.catalogViewContext` (measured 2026-11-01).
 * - PaaS: there is no tenant to ask, and the fields come with the extension, so the schema is the
 *   signal. Adobe's own reference store (base connector) declares `commerceOptimizer` and not
 *   `catalogViewContext`, which is what the B2B connector adds (measured 2026-11-01).
 *
 * @module features/ai/server/acoStatus
 */

import { buildCommerceEndpoints } from './commerceEndpointsTool';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { readAcoCredential } from '@/features/components/services/acoCredentialStore';
import { readAcoSettings, usesAco } from '@/features/components/services/acoSettings';
import { type AcoAdminClient, type AcoTenantFacts, createAcoAdminClient } from '@/features/data-installer/services/aco/acoAdminClient';
import { ACO_INGESTION_SCOPES } from '@/features/data-installer/services/aco/acoClient';
import { createAcoTokenSource } from '@/features/data-installer/services/aco/acoToken';
import type { AcoCredential } from '@/types/aco';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** Whether Adobe's connector feeds this backend's catalog into ACO. */
export type AcoConnectorState = 'on' | 'off' | 'unknown';

export interface AcoBackendStatus {
    backend: string;
    connector: AcoConnectorState;
    /** How the connector state was read, or why it could not be. */
    because: string;
    /** Whether the backend answers each shopper's price book. */
    answersPriceBook?: boolean;
    /** Whether the backend's schema has the field a private view needs. Declared is not the same as filled in. */
    declaresCatalogView?: boolean;
}

export interface AcoStatus {
    addon: 'on' | 'off';
    missingSettings: string[];
    instance?: { tenantId: string; region: string; environment: string; catalogViewId: string; locale: string };
    credential: { held: boolean; ingestion?: string; admin?: string };
    tenant?: AcoTenantFacts | { problem: string };
    backend: AcoBackendStatus;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The tenant id in an `…api.commerce.adobe.com/{tenant}/…` endpoint. */
export function tenantOfEndpoint(url: string | undefined): string | undefined {
    return url?.match(/\.api\.commerce\.adobe\.com\/([A-Za-z0-9_-]+)(?:\/|$)/u)?.[1];
}

const SCHEMA_QUERY =
    '{ query: __type(name: "Query") { fields { name } } company: __type(name: "Company") { fields { name } } }';

interface SchemaFields {
    data?: { query?: { fields?: Array<{ name: string }> }; company?: { fields?: Array<{ name: string }> } };
}

/** What the backend's schema declares, or undefined when it cannot be read. */
async function readSchema(url: string, store: string | undefined, fetchImpl: typeof fetch) {
    try {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(store ? { Store: store } : {}) },
            body: JSON.stringify({ query: SCHEMA_QUERY }),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });
        const { data } = (await response.json()) as SchemaFields;
        if (!data?.query?.fields) return undefined;
        return {
            answersPriceBook: data.query.fields.some((field) => field.name === 'commerceOptimizer'),
            declaresCatalogView: (data.company?.fields ?? []).some((field) => field.name === 'catalogViewContext'),
        };
    } catch {
        return undefined;
    }
}

/** The connector state on an ACCS backend: only the tenant service knows. */
async function accsConnector(url: string | undefined, admin: AcoAdminClient | undefined): Promise<Pick<AcoBackendStatus, 'connector' | 'because'>> {
    const tenant = tenantOfEndpoint(url);
    if (!tenant) return { connector: 'unknown', because: "The backend's endpoint names no tenant." };
    if (!admin) return { connector: 'unknown', because: 'Asking the tenant service needs the ACO credential.' };
    try {
        const { acoEnabled } = await admin.tenant(tenant);
        return typeof acoEnabled === 'boolean'
            ? { connector: acoEnabled ? 'on' : 'off', because: `The tenant service says acoEnabled is ${acoEnabled}.` }
            : { connector: 'unknown', because: 'The tenant service did not say.' };
    } catch (error) {
        return { connector: 'unknown', because: errorText(error) };
    }
}

async function readBackend(project: Project, admin: AcoAdminClient | undefined, fetchImpl: typeof fetch): Promise<AcoBackendStatus> {
    const facts = buildCommerceEndpoints(project);
    const url = facts.endpoints.commerceGraphQl ?? facts.endpoints.mesh;
    const schema = url ? await readSchema(url, facts.headers.all?.Store, fetchImpl) : undefined;
    const backend = { backend: facts.backend, ...(schema ?? {}) };
    if (facts.backend === 'accs') return { ...backend, ...(await accsConnector(url, admin)) };
    if (!schema) return { ...backend, connector: 'unknown', because: "The backend's schema could not be read." };
    return schema.answersPriceBook
        ? { ...backend, connector: 'on', because: 'The backend declares commerceOptimizer, which comes with the connector.' }
        : { ...backend, connector: 'off', because: 'The backend does not declare commerceOptimizer.' };
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
