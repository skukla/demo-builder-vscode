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
import {
    resolveRestTarget,
    sendRest,
    validateRestPath,
    type RestMethod,
} from './commerceRestClient';
import { asRawText, asRawTextMarkingErrors } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { projectPath, readPackFile } from '@/features/data-installer/handlers/datapackFiles';
import type { HandlerContext } from '@/types/handlers';

const WRITE_METHODS = ['POST', 'PUT', 'DELETE'] as const;

/**
 * What the bulk API takes and this tool will not guess: a POST or PUT, with a
 * non-empty array body. A single record sent "in bulk" is the per-product loop
 * wearing a flag, so it is refused rather than wrapped.
 */
function refuseBadBulk(method: RestMethod, body: unknown): string | undefined {
    if (method === 'DELETE') return 'Error: bulk takes POST or PUT; delete records one at a time.';
    if (!Array.isArray(body) || body.length === 0) {
        return 'Error: bulk:true needs body to be a non-empty ARRAY of request bodies, e.g. [{"product":{…}}, …].';
    }
    return undefined;
}

/**
 * The call's body: `body` as given, or the JSON in `bodyPath`, a file inside the project (2026-11-06: an
 * Import API call of hundreds of rows was sent through a test probe, since pasting it was impractical).
 */
async function bodyOf(ctx: HandlerContext, args: { body?: unknown; bodyPath?: unknown }): Promise<{ body: unknown } | { error: string }> {
    if (args.bodyPath === undefined) return { body: args.body };
    if (args.body !== undefined) return { error: 'send body or bodyPath, not both' };
    try {
        return { body: JSON.parse((await readPackFile(ctx, await projectPath(ctx, String(args.bodyPath)))).toString('utf8')) as unknown };
    } catch (error) {
        return { error: `the body file could not be read as JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
}

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
                'the workspace credential the ERP integration deploys with (no Adobe workspace: the ' +
                "user's own sign-in): create or change customers, " +
                'companies, credit limits, orders, products, stock, or delete a record. Changes LIVE ' +
                'store data; a DELETE cannot be undone. Requires confirm:true and raises a dialog for the ' +
                'user. Read the record first with run_commerce_rest (with fields= to keep it small). ' +
                'The answer is the record Commerce returns, cut at 30,000 characters. ACCS backends only for now. ' +
                'MANY records at once: bulk:true sends the body — an ARRAY of request bodies — to the ' +
                'asynchronous bulk API (V1/async/bulk/<path>, e.g. "products" or "products/bySku"); Commerce ' +
                'answers a bulk_uuid to poll with run_commerce_rest "bulk/<uuid>/status". One call for a ' +
                'whole catalog instead of one per product. Settings (Stores > Configuration) are writable too: ' +
                'PUT system/config with { items: [{ path, value, scope, scope_code }] }, and its answer carries an errors ' +
                'list under HTTP 200 that MUST be read, since a refused path is reported there, not as a failure ' +
                '(set_commerce_config does that and records the previous values). A large body (an Import API call ' +
                'of hundreds of rows, POST import/json) can come from a JSON file in the project: bodyPath instead of body.',
            inputSchema: {
                method: z
                    .enum(WRITE_METHODS)
                    .describe('POST creates, PUT replaces or updates, DELETE removes'),
                path: z
                    .string()
                    .describe('The path under /V1, e.g. "companyCredits/12" or "customers/43"'),
                body: z
                    .union([z.record(z.unknown()), z.array(z.record(z.unknown()))])
                    .optional()
                    .describe(
                        'The JSON body, as the REST reference shows it; a DELETE usually takes none, ' +
                            'but some do (DELETE returns/{id} needs the return as rmaDataObject); ' +
                            'with bulk:true, an array of such bodies',
                    ),
                bodyPath: z
                    .string()
                    .optional()
                    .describe('A JSON file inside the project holding the body, instead of body: for one too large to send inline'),
                bulk: z
                    .boolean()
                    .optional()
                    .describe(
                        'Send the array body to the asynchronous bulk API, one call for all of them',
                    ),
                storeView: z
                    .string()
                    .optional()
                    .describe(
                        "The store view code for the Store header; defaults to the project's",
                    ),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asRawText('write_commerce_rest requires confirm:true to proceed.', {
                    isError: true,
                });
            }
            const method = args?.method as RestMethod | undefined;
            if (!method || !WRITE_METHODS.includes(method as (typeof WRITE_METHODS)[number])) {
                return asRawTextMarkingErrors(
                    'Error: method must be POST, PUT or DELETE. For reads use run_commerce_rest.',
                );
            }
            const checked = validateRestPath(args?.path);
            if ('error' in checked) return asRawTextMarkingErrors(`Error: ${checked.error}`);
            const ctx = ctxFactory();
            const given = await bodyOf(ctx, args);
            if ('error' in given) return asRawTextMarkingErrors(`Error: ${given.error}`);
            const body = given.body;
            const bulk = args?.bulk === true;
            if (bulk) {
                const refusal = refuseBadBulk(method, body);
                if (refusal) return asRawTextMarkingErrors(refusal);
            }
            const target = await resolveRestTarget(ctx, args?.storeView, fetchImpl);
            if ('refusal' in target) return asRawTextMarkingErrors(target.refusal);
            return asRawTextMarkingErrors(await sendRest(method, target, checked.path, body, fetchImpl, { bulk }));
        },
    );
}
