/**
 * run_commerce_rest — a GET against this project's Commerce REST API, signed with
 * the workspace credential the project's integrations already deploy with.
 *
 * ## Why it exists (AB-29, 2026-09-24)
 *
 * The extension's only Commerce read was `run_commerce_query`, the shopper-facing
 * GraphQL. It cannot see a B2B company, a company's credit, a customer record or
 * an order, so validating the ERP pair meant reading those in Commerce Admin by
 * hand — and on the day a customer sign-up created an account the storefront
 * then refused to sign in, nothing here could look at the record to say why.
 * The REST API can. The owner's word: "Can you not use the Commerce API to do
 * your work?"
 *
 * The signing, the URL and the refusals live in `commerceRestClient.ts`, shared
 * with `write_commerce_rest`. This tool sends only GET; it is the read half.
 *
 * @module features/ai/server/commerceRestTool
 */

import { z } from 'zod';
import { resolveRestTarget, sendRest, validateRestPath } from './commerceRestClient';
import { asRawText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import type { HandlerContext } from '@/types/handlers';

/**
 * Register `run_commerce_rest`.
 *
 * @param server - the tool server
 * @param ctxFactory - the headless handler context (project state + sign-in)
 * @param fetchImpl - injected so tests drive the real shaping without a network
 */
export function registerCommerceRestTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
    fetchImpl: typeof fetch = fetch,
): void {
    server.registerTool(
        'run_commerce_rest',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Run Commerce REST GET',
            description:
                "GET one path of this project's Commerce REST API (the /V1 endpoints: customers, " +
                'company, companyCredits, orders, products, inventory), signed with the workspace ' +
                'credential the ERP integration deploys with. Reads what GraphQL cannot: B2B ' +
                'companies and credit, customer records, orders. Read-only; ACCS backends only for now. ' +
                'To change data, use write_commerce_rest.',
            inputSchema: {
                path: z
                    .string()
                    .describe(
                        'The path under /V1 with its query string, e.g. "customers/43" or ' +
                            '"customers/search?searchCriteria[filter_groups][0][filters][0][field]=email' +
                            '&searchCriteria[filter_groups][0][filters][0][value]=a@b.c"',
                    ),
                storeView: z
                    .string()
                    .optional()
                    .describe("The store view code for the Store header; defaults to the project's"),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const checked = validateRestPath(args?.path);
            if ('error' in checked) return asRawText(`Error: ${checked.error}`);
            const target = await resolveRestTarget(ctxFactory(), args?.storeView, fetchImpl);
            if ('refusal' in target) return asRawText(target.refusal);
            return asRawText(await sendRest('GET', target, checked.path, undefined, fetchImpl));
        },
    );
}
