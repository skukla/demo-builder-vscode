/**
 * Whether Adobe's connector feeds a backend's catalog into ACO (PL-60). With it on, Commerce is the
 * catalog's system of record, so Demo Builder must not write to ACO's catalog as well.
 *
 * Nobody chooses this: it is read from the backend, differently per backend, because the obvious
 * signals lie (measured 2026-11-01):
 * - ACCS: only the tenant service's `acoEnabled` says. The schema cannot: a tenant with `acoEnabled`
 *   false already declares `commerceOptimizer` and `Company.catalogViewContext`.
 * - PaaS: there is no tenant to ask, and the fields come with the extension, so the schema is the
 *   signal. A public PaaS store on the base connector declares `commerceOptimizer` and not
 *   `catalogViewContext`, which is what the B2B connector adds.
 *
 * @module features/data-installer/services/aco/acoConnector
 */

import type { AcoAdminClient } from './acoAdminClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

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

export interface AcoConnectorQuestion {
    backend: string;
    /** The backend's GraphQL. */
    url: string | undefined;
    store: string | undefined;
    /** Asks the tenant service; an ACCS backend cannot answer without it. */
    admin: Pick<AcoAdminClient, 'tenant'> | undefined;
    fetch?: typeof fetch;
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
async function readSchema({ url, store, fetch: doFetch = fetch }: AcoConnectorQuestion) {
    if (!url) return undefined;
    try {
        const response = await doFetch(url, {
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
async function accsConnector({ url, admin }: AcoConnectorQuestion): Promise<Pick<AcoBackendStatus, 'connector' | 'because'>> {
    const tenant = tenantOfEndpoint(url);
    if (!tenant) return { connector: 'unknown', because: "The backend's endpoint names no tenant." };
    if (!admin) return { connector: 'unknown', because: 'Asking the tenant service needs the ACO credential.' };
    try {
        const { acoEnabled } = await admin.tenant(tenant);
        if (typeof acoEnabled !== 'boolean') return { connector: 'unknown', because: 'The tenant service did not say.' };
        return { connector: acoEnabled ? 'on' : 'off', because: `The tenant service says acoEnabled is ${acoEnabled}.` };
    } catch (error) {
        return { connector: 'unknown', because: errorText(error) };
    }
}

/** Read the backend. Never throws: what cannot be read is `unknown`, and says why. */
export async function readAcoConnector(question: AcoConnectorQuestion): Promise<AcoBackendStatus> {
    const schema = await readSchema(question);
    const backend = { backend: question.backend, ...(schema ?? {}) };
    if (question.backend === 'accs') return { ...backend, ...(await accsConnector(question)) };
    if (!schema) return { ...backend, connector: 'unknown', because: "The backend's schema could not be read." };
    return schema.answersPriceBook
        ? { ...backend, connector: 'on', because: 'The backend declares commerceOptimizer, which comes with the connector.' }
        : { ...backend, connector: 'off', because: 'The backend does not declare commerceOptimizer.' };
}
