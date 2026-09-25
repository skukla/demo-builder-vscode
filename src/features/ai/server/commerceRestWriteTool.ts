/**
 * write_commerce_rest — a POST, PUT or DELETE against this project's Commerce
 * REST API, signed the way `run_commerce_rest` signs its reads.
 *
 * ## Why a second tool, and why it is gated (AB-29, owner 2026-09-24)
 *
 * "We need tools that allow you to do everything the Commerce REST API would
 * allow you to do in the instance configured for the project." Reads are cheap
 * and gate nothing. A write changes live store data and a DELETE cannot be
 * undone, so every call here requires `confirm: true` and, through
 * `AGENT_ALERT_COPY`, raises the consent dialog naming the method and the path.
 * Keeping writes in their own tool means the read tool can stay read-only by
 * construction, and the dry run can trust its `readOnlyHint`.
 *
 * Commerce is the master system a demo is prepared in (principle 1: what can be
 * done can be undone). The answer carries the server's body, so the caller can
 * read back what changed; a caller that deletes reads first, and says so.
 *
 * @module features/ai/server/commerceRestWriteTool
 */

import { z } from 'zod';
import { resolveRestTarget, sendRest, validateRestPath, type RestMethod } from './commerceRestClient';
import { asRawText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import type { HandlerContext } from '@/types/handlers';

const WRITE_METHODS = ['POST', 'PUT', 'DELETE'] as const;

/**
 * Register `write_commerce_rest`.
 *
 * @param server - the tool server
 * @param ctxFactory - the headless handler context (project state + sign-in)
 * @param fetchImpl - injected so tests drive the real shaping without a network
 */
export function registerCommerceRestWriteTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
    fetchImpl: typeof fetch = fetch,
): void {
    server.registerTool(
        'write_commerce_rest',
        {
            needsAuth: ['adobe'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            title: 'Write Commerce REST',
            description:
                "POST, PUT or DELETE one path of this project's Commerce REST API (/V1), signed with " +
                'the workspace credential the ERP integration deploys with: create or change customers, ' +
                'companies, credit limits, orders, products, stock, or delete a record. Changes LIVE ' +
                'store data; a DELETE cannot be undone. Requires confirm:true and raises a dialog for the ' +
                'user. Read the record first with run_commerce_rest (with fields= to keep it small). ' +
                'The answer is the record Commerce returns, cut at 30,000 characters. ACCS backends only for now.',
            inputSchema: {
                method: z.enum(WRITE_METHODS).describe('POST creates, PUT replaces or updates, DELETE removes'),
                path: z
                    .string()
                    .describe('The path under /V1, e.g. "companyCredits/12" or "customers/43"'),
                body: z
                    .record(z.unknown())
                    .optional()
                    .describe('The JSON body, as the REST reference shows it (omit for DELETE)'),
                storeView: z
                    .string()
                    .optional()
                    .describe("The store view code for the Store header; defaults to the project's"),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asRawText('write_commerce_rest requires confirm:true to proceed.', { isError: true });
            }
            const method = args?.method as RestMethod | undefined;
            if (!method || !WRITE_METHODS.includes(method as (typeof WRITE_METHODS)[number])) {
                return asRawText('Error: method must be POST, PUT or DELETE. For reads use run_commerce_rest.');
            }
            const checked = validateRestPath(args?.path);
            if ('error' in checked) return asRawText(`Error: ${checked.error}`);
            const target = await resolveRestTarget(ctxFactory(), args?.storeView, fetchImpl);
            if ('refusal' in target) return asRawText(target.refusal);
            const body = method === 'DELETE' ? undefined : args?.body;
            return asRawText(await sendRest(method, target, checked.path, body, fetchImpl));
        },
    );
}
