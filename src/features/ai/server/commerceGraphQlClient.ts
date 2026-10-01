/**
 * One Commerce GraphQL request, with the project's store-scope headers attached.
 *
 * Extracted from `run_commerce_query` (2026-10-01) when a second caller needed the
 * same request: the category-page generator reads the store's category tree, and a
 * second copy of the header rule below is exactly the bug that rule documents — a
 * query sent without the `Magento-*` headers comes back EMPTY WITH NO ERROR.
 *
 * What stays in the tool: refusing mutations, the response ceiling, and the
 * answer's prose. What lives here: which endpoint, which headers, the timeout and
 * the POST.
 *
 * @module features/ai/server/commerceGraphQlClient
 */

import { createHash } from 'crypto';
import { buildCommerceEndpoints } from './commerceEndpointsTool';
import type { Project } from '@/types/base';

/** How long to wait before giving up on the backend. */
const QUERY_TIMEOUT_MS = 30_000;

type CommerceEndpointKey = 'commerceGraphQl' | 'catalogService' | 'mesh';

/** One request: the query and, optionally, where to send it and as whom. */
interface CommerceGraphQlRequest {
    query: string;
    variables?: Record<string, unknown>;
    /** Defaults to the endpoint the storefront itself uses. */
    endpoint?: CommerceEndpointKey;
    /** Ask Catalog Service as this customer group (its numeric id). */
    customerGroupId?: number;
}

/** The backend's answer, uncut, or the reason no request was sent or answered. */
type CommerceGraphQlAnswer =
    | { chosen: CommerceEndpointKey; status: number; ok: boolean; body: string }
    | { error: string };

/**
 * The `Magento-Customer-Group` value for a customer group: the SHA-1 of its numeric id.
 *
 * Adobe's productSearch reference calls the value "the customer group code", which does not
 * work. Measured 2026-09-26 on an ACCS sandbox: a company's shared-catalog price (49 against
 * a catalog 55) came back only for SHA-1("16"); the id `16`, the group's name and an empty
 * header all returned 55.
 */
function customerGroupHeader(groupId: number): string {
    return createHash('sha1').update(String(groupId)).digest('hex');
}

/**
 * The headers for one request, or the refusal when a customer group is asked of an endpoint
 * that does not read it.
 *
 * WHICH HEADERS, and why it is not "cs only for the catalogService endpoint": that was the
 * first implementation and the live backend refused it (`productSearch` on bodea came back
 * "Missing Magento-Website-Code Header"). ACCS serves Commerce Core AND Catalog Service from
 * ONE endpoint, so an endpoint-driven rule can never send the `cs` headers there. The rule is
 * about what the endpoint SERVES: send `cs` when the chosen endpoint is the Catalog Service
 * one, or when the project has no separate one and this endpoint is therefore both. Sending
 * them to a Core query is harmless; omitting them is a hard error or a silent empty result.
 */
function requestHeaders(
    facts: ReturnType<typeof buildCommerceEndpoints>,
    chosen: CommerceEndpointKey,
    groupId: number | undefined,
): Record<string, string> | string {
    const hasSeparateCatalogService = Boolean(facts.endpoints.catalogService);
    const needsCatalogHeaders = chosen === 'catalogService' || !hasSeparateCatalogService;
    if (groupId !== undefined && !needsCatalogHeaders) {
        return (
            `Error: customerGroupId applies to Catalog Service queries only; \`${chosen}\` ` +
            "takes the group from a signed-in customer, not a header. Use endpoint 'catalogService'."
        );
    }
    return {
        'Content-Type': 'application/json',
        ...(facts.headers.all ?? {}),
        ...(needsCatalogHeaders ? (facts.headers.cs ?? {}) : {}),
        ...(groupId !== undefined ? { 'Magento-Customer-Group': customerGroupHeader(groupId) } : {}),
    };
}

/**
 * Which endpoint answers. Defaults to what the storefront queries, so results match
 * the live site.
 *
 * Asking for `catalogService` on ACCS is CORRECT, not a mistake: ACCS serves Commerce
 * Core and Catalog Service from one endpoint, so there is no separate `catalogService`
 * to name. Measured 2026-08-26: an agent asked for the catalog service, was refused
 * "this project has no catalogService endpoint", and spent a round trip recovering.
 * Route by what an endpoint SERVES, not by what it is called.
 */
function chooseEndpoint(
    facts: ReturnType<typeof buildCommerceEndpoints>,
    requested: CommerceEndpointKey | undefined,
): CommerceEndpointKey {
    const chosen: CommerceEndpointKey =
        requested ?? (facts.storefrontUses === 'none' ? 'commerceGraphQl' : facts.storefrontUses);
    if (chosen === 'catalogService' && !facts.endpoints.catalogService && facts.endpoints.commerceGraphQl) {
        return 'commerceGraphQl';
    }
    return chosen;
}

/**
 * Send one GraphQL request for `project` and answer the status and WHOLE body.
 *
 * The endpoint and headers are the SAME assembly `get_commerce_endpoints` reports,
 * so the endpoint an agent is told about and the one queried cannot disagree.
 *
 * @param project   - the project whose backend and store scope to use
 * @param request   - the query, its variables, and optionally the endpoint and group
 * @param fetchImpl - injected so tests drive the real shaping without a network
 * @returns the answer, or `{ error }` (prose starting "Error: ") when nothing answered
 */
export async function postCommerceGraphQl(
    project: Project,
    request: CommerceGraphQlRequest,
    fetchImpl: typeof fetch,
): Promise<CommerceGraphQlAnswer> {
    const facts = buildCommerceEndpoints(project);
    const chosen = chooseEndpoint(facts, request.endpoint);
    const url = facts.endpoints[chosen];
    if (!url) {
        const have = Object.keys(facts.endpoints);
        return {
            error:
                `Error: this project has no \`${chosen}\` endpoint. ` +
                (have.length ? `Available: ${have.join(', ')}.` : 'It has no Commerce endpoints configured at all.'),
        };
    }

    const headers = requestHeaders(facts, chosen, request.customerGroupId);
    if (typeof headers === 'string') return { error: headers };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetchImpl(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: request.query,
                ...(request.variables ? { variables: request.variables } : {}),
            }),
            signal: controller.signal,
        });
    } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        return { error: `Error: the request to ${chosen} failed — ${why}` };
    } finally {
        clearTimeout(timer);
    }
    return { chosen, status: res.status, ok: res.ok, body: await res.text() };
}
