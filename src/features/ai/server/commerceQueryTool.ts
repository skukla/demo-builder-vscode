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
import { postCommerceGraphQl } from './commerceGraphQlClient';
import { asRawText, asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import type { StateManager } from '@/types/state';

/**
 * The response ceiling.
 *
 * A catalog query can return megabytes, and this is the one place this tool can
 * blow up an agent's context. Bounded, with the cut DECLARED in the payload —
 * a silently truncated JSON body is worse than a large one, because the agent
 * parses a fragment and believes it.
 */
const MAX_RESPONSE_CHARS = 30_000;

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

/**
 * Register `run_commerce_query`.
 *
 * @param server       McpServer (typed `any`; see registerProjectTools docstring).
 * @param stateManager Resolves the current project.
 * @param fetchImpl    Injected so tests exercise the real shaping without a network.
 */
export function registerCommerceQueryTool(
    server: McpToolServer,
    stateManager: StateManager,
    fetchImpl: typeof fetch = fetch,
): void {
    server.registerTool(
        'run_commerce_query',
        {
            needsAuth: false,
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
                customerGroupId: z
                    .number()
                    .int()
                    .nonnegative()
                    .optional()
                    .describe(
                        "Ask Catalog Service as this customer group (its numeric id, e.g. a company's shared-catalog group from GET company/{id}), so prices come back as that company sees them. Omit for the guest view.",
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

            // Which endpoint, which headers, the POST: see commerceGraphQlClient.
            const answer = await postCommerceGraphQl(
                project,
                {
                    query,
                    ...(args?.variables ? { variables: args.variables } : {}),
                    endpoint: args?.endpoint,
                    customerGroupId: args?.customerGroupId,
                },
                fetchImpl,
            );
            if ('error' in answer) return asRawText(answer.error);
            const { chosen, body } = answer;
            if (!answer.ok) {
                // Status first: a 401 here is an expired session, not a bad query,
                // and the two need completely different fixes.
                return asRawText(
                    `Error: ${chosen} returned HTTP ${answer.status}. ${body.slice(0, 500)}`,
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
