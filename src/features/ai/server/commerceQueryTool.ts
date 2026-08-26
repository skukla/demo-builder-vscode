/**
 * run_commerce_query — run a GraphQL query against this project's Commerce
 * backend, with the store-scope headers already attached.
 *
 * ## The agent wrote this specification
 *
 * Asked "how many products are in the catalog for this project?", an agent
 * searched, found `get_commerce_endpoints`, called it correctly, got the endpoint
 * and the headers — and then hand-wrote two `curl`s, because nothing here runs a
 * query. It reached the right answer by LEAVING our surface. That reproduced
 * identically across both full battery runs on 2026-08-26, so it is a stable gap
 * rather than one agent having a bad day.
 *
 * Everything before the `-d` in that curl is what `get_commerce_endpoints`
 * already returns. This tool is that call with the query as its only required
 * argument.
 *
 * ## Why the headers are the point
 *
 * An endpoint alone did not close the gap. A Commerce query sent without the
 * `Magento-*` store-scope headers reaches the wrong scope and comes back EMPTY
 * WITH NO ERROR — an afternoon of "why is the phones category empty?". The
 * agent's own first curl omitted them and it corrected itself on the second; the
 * tool simply never gets that wrong.
 *
 * ## Read-only, decided before the schema
 *
 * A query tool that can also mutate is a different risk conversation, and it is
 * one worth having deliberately rather than discovering later. Mutations are
 * refused. `fetch` is injected so the tests drive the real shaping code without a
 * network.
 *
 * @module features/ai/server/commerceQueryTool
 */

import { z } from 'zod';
import { buildCommerceEndpoints } from './commerceEndpointsTool';
import { asRawText, asText } from './mcpToolResult';
import type { StateManager } from '@/core/state';

/**
 * The response ceiling.
 *
 * A catalog query can return megabytes, and this is the one place this tool can
 * blow up an agent's context. Bounded, with the cut DECLARED in the payload —
 * a silently truncated JSON body is worse than a large one, because the agent
 * parses a fragment and believes it.
 */
const MAX_RESPONSE_CHARS = 30_000;

/** How long to wait before giving up on the backend. */
const QUERY_TIMEOUT_MS = 30_000;

/**
 * Does this read?
 *
 * GraphQL allows leading whitespace, comments and an operation name, so a bare
 * `startsWith('mutation')` is not enough. Anonymous queries (`{ ... }`) and
 * `query`-prefixed ones both read; anything declaring `mutation` or
 * `subscription` does not.
 */
function isReadOnlyQuery(query: string): boolean {
    const stripped = query.replace(/#[^\n]*/g, '').trim();
    return !/^\s*(mutation|subscription)\b/i.test(stripped);
}

type EndpointKey = 'commerceGraphQl' | 'catalogService' | 'mesh';

/**
 * Register `run_commerce_query`.
 *
 * @param server       McpServer (typed `any`; see registerProjectTools docstring).
 * @param stateManager Resolves the current project.
 * @param fetchImpl    Injected so tests exercise the real shaping without a network.
 */
export function registerCommerceQueryTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    stateManager: StateManager,
    fetchImpl: typeof fetch = fetch,
): void {
    server.registerTool(
        'run_commerce_query',
        {
            // Read-only: it refuses mutations, so it cannot change the backend.
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Run Commerce Query',
            description:
                "Run a read-only GraphQL query against this project's Commerce backend, Catalog Service or API Mesh, with the store-scope headers already attached. Use instead of assembling a curl — a query without those headers silently returns nothing. Mutations are refused.",
            inputSchema: {
                query: z.string().describe('The GraphQL query. Read-only; mutations are refused.'),
                variables: z
                    .record(z.unknown())
                    .optional()
                    .describe('GraphQL variables, if the query takes any'),
                endpoint: z
                    .enum(['commerceGraphQl', 'catalogService', 'mesh'])
                    .optional()
                    .describe(
                        'Which endpoint to query. Defaults to the one the storefront itself uses, so results match the live site.',
                    ),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const query = String(args?.query ?? '');
            if (!query.trim()) {
                return asRawText('Error: `query` is required.');
            }
            if (!isReadOnlyQuery(query)) {
                return asRawText(
                    'Error: run_commerce_query is read-only and this looks like a mutation. ' +
                        'It runs queries against a demo backend; changing data is deliberately not ' +
                        'available here.',
                );
            }

            const project = await stateManager.getCurrentProject();
            if (!project) {
                return asRawText(
                    'Error: no current project. Use list_projects then set the current project.',
                );
            }

            // The SAME assembly `get_commerce_endpoints` reports, so the endpoint an
            // agent is told about and the one queried cannot disagree. If they ever
            // do, that is one bug rather than two.
            const facts = buildCommerceEndpoints(project);

            // Default to what the storefront queries: an agent reproducing what the
            // site does must hit the same endpoint, and `storefrontUses` is already
            // the answer to that.
            const requested: EndpointKey | undefined = args?.endpoint;
            let chosen: EndpointKey =
                requested ??
                (facts.storefrontUses === 'none' ? 'commerceGraphQl' : facts.storefrontUses);

            // Asking for `catalogService` on ACCS is CORRECT, not a mistake.
            //
            // ACCS serves Commerce Core and Catalog Service from one endpoint, so
            // there is no separate `catalogService` to name — and the first version
            // answered "this project has no catalogService endpoint", which is true
            // of the NAME and false of the capability. Measured 2026-08-26: an agent
            // asked for the catalog service (the obvious read of "how many products
            // are in the catalog"), was refused, and spent a round trip recovering
            // from an error that should never have been one.
            //
            // Same shape as the header rule, and I fixed that one and not this one:
            // route by what an endpoint SERVES, not by what it is called.
            if (chosen === 'catalogService' && !facts.endpoints.catalogService
                && facts.endpoints.commerceGraphQl) {
                chosen = 'commerceGraphQl';
            }

            const url = facts.endpoints[chosen];
            if (!url) {
                const have = Object.keys(facts.endpoints);
                return asRawText(
                    `Error: this project has no \`${chosen}\` endpoint. ` +
                        (have.length
                            ? `Available: ${have.join(', ')}.`
                            : 'It has no Commerce endpoints configured at all.'),
                );
            }

            // WHICH HEADERS, and why it is not "cs only for the catalogService
            // endpoint".
            //
            // That was the first implementation and the live backend refused it:
            // `productSearch` on bodea came back "Missing Magento-Website-Code
            // Header" while every unit test passed. The reason is a shape no
            // fixture showed — **ACCS serves Commerce Core AND Catalog Service from
            // ONE endpoint**, so there is no separate `catalogService` to target and
            // an endpoint-driven rule can never send the `cs` headers at all. PaaS
            // has two endpoints; ACCS has one.
            //
            // So the rule is about what the endpoint SERVES, not what it is called:
            // send `cs` when the chosen endpoint is the Catalog Service one, or when
            // the project has no separate one and this endpoint is therefore both.
            // Sending them to a Commerce Core query that does not need them is
            // harmless; omitting them is a hard error on one path and a silent empty
            // result on the other.
            const hasSeparateCatalogService = Boolean(facts.endpoints.catalogService);
            const needsCatalogHeaders = chosen === 'catalogService' || !hasSeparateCatalogService;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(facts.headers.all ?? {}),
                ...(needsCatalogHeaders ? (facts.headers.cs ?? {}) : {}),
            };

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
            let res: Response;
            try {
                res = await fetchImpl(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        query,
                        ...(args?.variables ? { variables: args.variables } : {}),
                    }),
                    signal: controller.signal,
                });
            } catch (err) {
                const why = err instanceof Error ? err.message : String(err);
                return asRawText(`Error: the request to ${chosen} failed — ${why}`);
            } finally {
                clearTimeout(timer);
            }

            const body = await res.text();
            if (!res.ok) {
                // Status first: a 401 here is an expired session, not a bad query,
                // and the two need completely different fixes.
                return asRawText(
                    `Error: ${chosen} returned HTTP ${res.status}. ${body.slice(0, 500)}`,
                );
            }

            if (body.length > MAX_RESPONSE_CHARS) {
                return asRawText(
                    `[truncated: ${body.length} chars, showing the first ${MAX_RESPONSE_CHARS}. ` +
                        'Narrow the query — ask for fewer fields or a smaller pageSize.]\n' +
                        body.slice(0, MAX_RESPONSE_CHARS),
                );
            }

            try {
                // GraphQL reports failure IN a 200 body; returning it as data is what
                // lets the agent see `errors` and fix its own query.
                return asText(JSON.parse(body));
            } catch {
                return asRawText(body);
            }
        },
    );
}
