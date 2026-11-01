/**
 * ACO's admin side (PL-60): catalog views, policies, restricted access keys and price books, and
 * what Adobe's tenant service says about an instance. Adobe's connector works through the same two
 * endpoints with the same kind of credential.
 *
 * Measured against a real sandbox, 2026-11-01:
 * - the admin GraphQL is `{api base}/admin/graphql`; a token with `commerce.aco.admin` and the
 *   client id as `x-api-key` reads and writes it. Introspection is off, so the answer to a wrong
 *   field is the only schema there is;
 * - the tenant service answers `GET {host}/api/v1/tenants/{tenant}/owner/{org}`, for an ACO tenant
 *   and an ACCS one alike, with the instance's name, state, service URLs and `acoEnabled`.
 *   The URL is the one Adobe's connector setup page names.
 *
 * @module features/data-installer/services/aco/acoAdminClient
 */

import { AcoApiError, createAcoTokenSource, readText, sendAco, theirWords } from './acoToken';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { acoApiBase } from '@/features/components/services/acoSettings';
import type { AcoCredential, AcoInstance } from '@/types/aco';

/** The scopes the admin API takes. */
export const ACO_ADMIN_SCOPES = 'openid,AdobeID,profile,email,commerce.aco.admin';

const TENANT_SERVICE = 'https://ccm.api.commerce.adobe.com/api/v1/tenants';

/** What the tenant service says about one instance, reduced to what Demo Builder reads. */
export interface AcoTenantFacts {
    name?: string;
    product?: string;
    type?: string;
    state?: string;
    /** Whether Commerce feeds this tenant's catalog into ACO: Adobe's connector is on. */
    acoEnabled?: boolean;
    /** The names of the service URLs it lists. */
    services: string[];
}

export interface AcoAdminClient {
    /**
     * Send one GraphQL document to the admin API.
     *
     * @returns the answer's text, GraphQL errors included: they are how this API explains itself
     * @throws AcoApiError when the token is refused or the HTTP call itself fails
     */
    graphql(query: string, variables?: Record<string, unknown>): Promise<string>;
    /**
     * What the tenant service says about a tenant in this credential's org.
     *
     * @throws AcoApiError when it refuses or cannot read the org off the token
     */
    tenant(tenantId: string): Promise<AcoTenantFacts>;
}

export interface AcoAdminDeps {
    instance: AcoInstance;
    credential: AcoCredential;
    fetch?: typeof fetch;
    now?: () => number;
}

/** Whether an admin answer is only saying the request was malformed: its words matter, not the 400. */
const isGraphqlRefusal = (status: number, text: string) => status === 400 && text.includes('"errors"');

export function createAcoAdminClient(deps: AcoAdminDeps): AcoAdminClient {
    const doFetch = deps.fetch ?? fetch;
    const token = createAcoTokenSource({ credential: deps.credential, scopes: ACO_ADMIN_SCOPES, fetch: doFetch, now: deps.now });
    const headers = async () => ({
        Authorization: `Bearer ${await token.bearer()}`,
        'x-api-key': deps.credential.clientId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    });

    return {
        async graphql(query, variables) {
            const url = `${acoApiBase(deps.instance)}/admin/graphql`;
            const init: RequestInit = {
                method: 'POST',
                headers: await headers(),
                body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
                signal: AbortSignal.timeout(TIMEOUTS.LONG),
            };
            const response = await sendAco(doFetch, url, init, 'admin', 'the admin request');
            const text = await readText(response);
            if (!response.ok && !isGraphqlRefusal(response.status, text)) {
                throw new AcoApiError(`ACO's admin API answered ${response.status}: ${theirWords(text)}`, 'admin', response.status);
            }
            return text;
        },
        async tenant(tenantId) {
            const org = await token.org();
            if (!org) throw new AcoApiError('The ACO token names no org, so the tenant service cannot be asked.', 'tenant');
            const url = `${TENANT_SERVICE}/${encodeURIComponent(tenantId)}/owner/${encodeURIComponent(org)}`;
            const init: RequestInit = { headers: await headers(), signal: AbortSignal.timeout(TIMEOUTS.NORMAL) };
            const response = await sendAco(doFetch, url, init, 'tenant', 'the tenant lookup');
            const text = await readText(response);
            if (!response.ok) {
                throw new AcoApiError(`Adobe's tenant service answered ${response.status}: ${theirWords(text)}`, 'tenant', response.status);
            }
            const tenant = JSON.parse(text) as Partial<AcoTenantFacts> & { serviceURLs?: Record<string, unknown> };
            return {
                name: tenant.name,
                product: tenant.product,
                type: tenant.type,
                state: tenant.state,
                acoEnabled: tenant.acoEnabled,
                services: Object.keys(tenant.serviceURLs ?? {}),
            };
        },
    };
}
