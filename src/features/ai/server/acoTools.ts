/**
 * The agent's way into a project's Adobe Commerce Optimizer (ACO) instance (PL-60, owner 2026-11-01:
 * "We should build MCP tooling to interact with ACO"). Five tools, the same split as the Commerce
 * REST pair: reads carry no gate, writes need `confirm: true` and raise the consent dialog.
 *
 * - `get_aco_status`: the settings, whether the credential reaches each surface, what Adobe's tenant
 *   service says, and whether Adobe's connector is on the backend;
 * - `run_aco_query`: the storefront GraphQL, as a shopper's browser asks it;
 * - `run_aco_admin` / `write_aco_admin`: catalog views, policies, access keys, price books;
 * - `write_aco_rows`: products, prices and the rest through the ingestion API, or deleted from it.
 *
 * `create_aco_access_key` and `delete_aco_access_key` make the keys a private view takes, and
 * `run_aco_query` signs with them, so the private half never leaves SecretStorage.
 *
 * All of it runs on the project's own credential (`set_up_aco_credential`) and never on the SC's
 * sign-in, so none declares `needsAuth`.
 *
 * @module features/ai/server/acoTools
 */

import { z } from 'zod';
import { isReadOnlyQuery } from './commerceQueryTool';
import { MAX_RESPONSE_CHARS } from './commerceRestClient';
import { asRawText, asRawTextMarkingErrors, asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { readAcoStatus } from './acoStatus';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { acoGraphqlUrl, acoSettingsProblem, readAcoInstance, readAcoSettings } from '@/features/components/services/acoSettings';
import { forgetAcoAccessKey, readAcoAccessKey, saveAcoAccessKey } from '@/features/components/services/acoAccessKeyStore';
import { readAcoCredential } from '@/features/components/services/acoCredentialStore';
import { generateAcoKeyPair, signAcoViewToken } from '@/features/data-installer/services/aco/acoAccessToken';
import { createAcoAdminClient } from '@/features/data-installer/services/aco/acoAdminClient';
import { createAcoClient } from '@/features/data-installer/services/aco/acoClient';
import { acoKind, ACO_KINDS, deletePathOf } from '@/features/data-installer/services/aco/acoKinds';
import { chunks } from '@/features/data-installer/services/aco/acoPackInstall';
import { acoHeaders } from '@/features/eds/services/acoStorefrontConfig';
import type { AcoCredential, AcoInstance, AcoStorefrontSettings } from '@/types/aco';
import type { HandlerContext } from '@/types/handlers';

/** The kinds' names, in the form `z.enum` takes. */
const KIND_NAMES = ACO_KINDS.map((kind) => kind.kind) as [string, ...string[]];

/** How long a new access key lasts unless told otherwise. */
const DEFAULT_KEY_DAYS = 30;

const NO_CREDENTIAL =
    'Error: Demo Builder holds no ACO credential for this project. Run set_up_aco_credential first.';

const NO_PROJECT = 'Error: no current project. Use list_projects then set the current project.';
const NO_ADDON = 'Error: this project does not have the ACO add-on on. configure_project can turn it on.';

type Settings = { settings: AcoStorefrontSettings } | { refusal: string };
type Access = { instance: AcoInstance; credential: AcoCredential } | { refusal: string };

/** The project's ACO settings, or the sentence saying why there are none. */
async function settingsOf(ctx: HandlerContext): Promise<Settings> {
    const project = await ctx.stateManager.getCurrentProject();
    if (!project) return { refusal: NO_PROJECT };
    const read = readAcoSettings(project);
    if (!read) return { refusal: NO_ADDON };
    if ('missing' in read) return { refusal: `Error: ${acoSettingsProblem(read)}` };
    return { settings: read.settings };
}

/**
 * The instance and the credential together, or why not. No catalog view is needed: listing and creating
 * views is how a project gets its first one.
 */
async function accessOf(ctx: HandlerContext): Promise<Access> {
    const project = await ctx.stateManager.getCurrentProject();
    if (!project) return { refusal: NO_PROJECT };
    const read = readAcoSettings(project);
    if (!read) return { refusal: NO_ADDON };
    const instance = readAcoInstance(project);
    if (!instance) return { refusal: `Error: ${acoSettingsProblem({ missing: ['ACO_TENANT_ID'] })}` };
    const credential = await readAcoCredential(ctx.context?.secrets, project.path);
    return credential ? { instance, credential } : { refusal: NO_CREDENTIAL };
}

/** An answer's text, cut and saying so when it is long. */
function bounded(text: string): string {
    if (text.length <= MAX_RESPONSE_CHARS) return text;
    return (
        `[truncated: ${text.length} chars, showing the first ${MAX_RESPONSE_CHARS}. Ask for fewer fields or a smaller page.]\n` +
        text.slice(0, MAX_RESPONSE_CHARS)
    );
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Run a call that answers text, turning a thrown refusal into the `Error:` sentence an agent reads. */
async function answering(call: () => Promise<string>) {
    try {
        return asRawTextMarkingErrors(bounded(await call()));
    } catch (error) {
        return asRawTextMarkingErrors(`Error: ${errorText(error)}`);
    }
}

/** A signed token for a key this project made, or a sentence beginning "Error:". */
async function tokenFor(ctx: HandlerContext, keyId: string): Promise<string> {
    const project = await ctx.stateManager.getCurrentProject();
    const privateKey = project ? await readAcoAccessKey(ctx.context?.secrets, project.path, keyId) : undefined;
    return privateKey ? signAcoViewToken(privateKey) : `Error: this project holds no private key for ${keyId}. create_aco_access_key makes one.`;
}

/** The date a key made today stops working, as ACO takes it. */
const expiryAfter = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

function registerAccessKeys(server: McpToolServer, ctxFactory: () => HandlerContext, fetchImpl: typeof fetch): void {
    server.registerTool(
        'create_aco_access_key',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Create ACO access key',
            description:
                "Make a restricted access key for a private catalog view on this project's ACO instance: an RSA key pair whose public half goes to ACO and whose " +
                'private half stays in SecretStorage, never in an answer. Answers the keyId: assign it to a view with write_aco_admin (restrictedAccessKeyIds, protectionEnabled), ' +
                'and read that view with run_aco_query signWithKey. delete_aco_access_key undoes it. Requires confirm:true.',
            inputSchema: {
                title: z.string().min(1).describe('What to call the key in ACO'),
                expiresInDays: z.number().int().positive().optional().describe('How long it lasts; 30 days if left out'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) return asRawText('create_aco_access_key requires confirm:true to proceed.', { isError: true });
            const ctx = ctxFactory();
            const access = await accessOf(ctx);
            const project = await ctx.stateManager.getCurrentProject();
            const secrets = ctx.context?.secrets;
            if ('refusal' in access) return asRawTextMarkingErrors(access.refusal);
            if (!project || !secrets) return asRawTextMarkingErrors('Error: SecretStorage is not available here, so the private key could not be kept.');
            const client = createAcoAdminClient({ instance: access.instance, credential: access.credential, fetch: fetchImpl });
            const { publicKey, privateKey } = generateAcoKeyPair();
            return answering(async () => {
                const answer = await client.graphql(
                    'mutation($key: CreateRestrictedAccessKeyRequest!) { createRestrictedAccessKey(keyRequest: $key) { keyId title } }',
                    { key: { title: args.title, publicKey, expirationDate: expiryAfter(args.expiresInDays ?? DEFAULT_KEY_DAYS) } },
                );
                const keyId = (JSON.parse(answer) as { data?: { createRestrictedAccessKey?: { keyId?: string } } }).data?.createRestrictedAccessKey?.keyId;
                if (keyId) await saveAcoAccessKey(secrets, project.path, keyId, privateKey);
                return answer;
            });
        },
    );
    server.registerTool(
        'delete_aco_access_key',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: true },
            title: 'Delete ACO access key',
            description:
                "Delete a restricted access key from this project's ACO instance and forget its private half. A view protected only by this key then answers nobody. Undoes create_aco_access_key. Requires confirm:true and raises a dialog.",
            inputSchema: {
                keyId: z.string().min(1).describe('The key id'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) return asRawText('delete_aco_access_key requires confirm:true to proceed.', { isError: true });
            const ctx = ctxFactory();
            const access = await accessOf(ctx);
            const project = await ctx.stateManager.getCurrentProject();
            const secrets = ctx.context?.secrets;
            if ('refusal' in access) return asRawTextMarkingErrors(access.refusal);
            const client = createAcoAdminClient({ instance: access.instance, credential: access.credential, fetch: fetchImpl });
            return answering(async () => {
                const answer = await client.graphql('mutation($keyId: String!) { deleteRestrictedAccessKey(keyId: $keyId) }', { keyId: args.keyId });
                if (project && secrets && !answer.includes('"errors"')) await forgetAcoAccessKey(secrets, project.path, args.keyId);
                return answer;
            });
        },
    );
}

function registerStatus(server: McpToolServer, ctxFactory: () => HandlerContext, fetchImpl: typeof fetch): void {
    server.registerTool(
        'get_aco_status',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Get ACO status',
            description:
                "Where this project stands with Adobe Commerce Optimizer (ACO): whether the add-on is on and which settings are " +
                "empty, whether its credential reaches ACO's ingestion and admin APIs, what Adobe's tenant service says about " +
                "the instance, and whether Adobe's connector feeds the backend's catalog into ACO. Use it first, before any other ACO tool. Writes nothing.",
            inputSchema: {},
        },
        async () => {
            try {
                return asText(await readAcoStatus(ctxFactory(), fetchImpl));
            } catch (error) {
                return asRawTextMarkingErrors(`Error: ${errorText(error)}`);
            }
        },
    );
}

function registerQuery(server: McpToolServer, ctxFactory: () => HandlerContext, fetchImpl: typeof fetch): void {
    server.registerTool(
        'run_aco_query',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Run ACO storefront query',
            description:
                "Read this project's ACO catalog the way its storefront does: a GraphQL query against the Merchandising API, as " +
                'one catalog view, locale and price book would ask it. Use it to see what a shopper in a given price book gets. ' +
                'Note that a price book the view does not allow answers an error, and one that was never loaded answers a null price. ' +
                'Mutations are refused. Answers past 30,000 characters are cut.',
            inputSchema: {
                query: z.string().describe('The GraphQL query, e.g. { products(skus:["A"]) { sku } }'),
                variables: z.record(z.string(), z.unknown()).optional().describe('GraphQL variables, if the query takes any'),
                viewId: z.string().optional().describe("A catalog view id; defaults to the project's"),
                locale: z.string().optional().describe("The catalog source locale; defaults to the project's"),
                priceBookId: z.string().optional().describe('The price book to ask as (sent as AC-Price-Book-ID); leave out to send none'),
                signWithKey: z.string().optional().describe('For a private view: the key id from create_aco_access_key to sign a token with. The token is never in the answer'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const query = typeof args?.query === 'string' ? args.query : '';
            if (!query.trim()) return asRawTextMarkingErrors('Error: query is required.');
            if (!isReadOnlyQuery(query)) return asRawTextMarkingErrors('Error: run_aco_query only reads. Catalog writes go through write_aco_rows.');
            const read = await settingsOf(ctxFactory());
            if ('refusal' in read) return asRawTextMarkingErrors(read.refusal);
            const { settings } = read;
            const token = args.signWithKey ? await tokenFor(ctxFactory(), String(args.signWithKey)) : undefined;
            if (token?.startsWith('Error:')) return asRawTextMarkingErrors(token);
            return answering(async () => {
                const response = await fetchImpl(acoGraphqlUrl(settings), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...acoHeaders(settings).cs,
                        ...(args.viewId ? { 'AC-View-ID': args.viewId } : {}),
                        ...(args.locale ? { 'AC-Source-Locale': args.locale } : {}),
                        ...(args.priceBookId ? { 'AC-Price-Book-ID': args.priceBookId } : {}),
                        ...(token ? { 'AC-Catalog-View-Access-Token': token } : {}),
                    },
                    body: JSON.stringify({ query, ...(args.variables ? { variables: args.variables } : {}) }),
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });
                const text = await response.text();
                // A 403 here is ACO refusing a price book, and its words are the answer.
                return response.ok || text.includes('"errors"') ? text : `Error: ACO answered ${response.status}: ${text}`;
            });
        },
    );
}

function registerAdminRead(server: McpToolServer, ctxFactory: () => HandlerContext, fetchImpl: typeof fetch): void {
    server.registerTool(
        'run_aco_admin',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Read ACO admin',
            description:
                "Read this project's ACO instance setup: catalog views, policies, restricted access keys, price books. A GraphQL " +
                'query against the admin API, e.g. { catalogViews { viewId name allowedPriceBookIds defaultPriceBookId protectionEnabled } }, ' +
                '{ policies { policyId name } }, { restrictedAccessKeys { keyId title } }, { priceBooks { items { id } } }. The API has introspection off, so a wrong field ' +
                'answers an error that names the type: read it and adjust. Mutations are refused: use write_aco_admin.',
            inputSchema: {
                query: z.string().describe('The GraphQL query'),
                variables: z.record(z.string(), z.unknown()).optional().describe('GraphQL variables, if the query takes any'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const query = typeof args?.query === 'string' ? args.query : '';
            if (!query.trim()) return asRawTextMarkingErrors('Error: query is required.');
            if (!isReadOnlyQuery(query)) return asRawTextMarkingErrors('Error: run_aco_admin only reads. Mutations go through write_aco_admin.');
            const access = await accessOf(ctxFactory());
            if ('refusal' in access) return asRawTextMarkingErrors(access.refusal);
            const client = createAcoAdminClient({ instance: access.instance, credential: access.credential, fetch: fetchImpl });
            return answering(() => client.graphql(query, args.variables));
        },
    );
}

function registerAdminWrite(server: McpToolServer, ctxFactory: () => HandlerContext, fetchImpl: typeof fetch): void {
    server.registerTool(
        'write_aco_admin',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: true },
            title: 'Change ACO admin',
            description:
                "Change this project's ACO instance setup: create, update or delete catalog views, policies and restricted access " +
                'keys. A GraphQL mutation against the admin API, e.g. createCatalogView(viewRequest:{…}), createPolicy(policyRequest:{…}), ' +
                'deleteCatalogView(viewId:"…"). A view that references a policy needs the policy first. Read what is there with run_aco_admin first. ' +
                'Changes the live instance. Requires confirm:true and raises a dialog for the user.',
            inputSchema: {
                mutation: z.string().describe('The GraphQL mutation'),
                variables: z.record(z.string(), z.unknown()).optional().describe('GraphQL variables, if it takes any'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) return asRawText('write_aco_admin requires confirm:true to proceed.', { isError: true });
            const mutation = typeof args?.mutation === 'string' ? args.mutation : '';
            if (isReadOnlyQuery(mutation)) return asRawTextMarkingErrors('Error: mutation must be a GraphQL mutation. Reads go through run_aco_admin.');
            const access = await accessOf(ctxFactory());
            if ('refusal' in access) return asRawTextMarkingErrors(access.refusal);
            const client = createAcoAdminClient({ instance: access.instance, credential: access.credential, fetch: fetchImpl });
            return answering(() => client.graphql(mutation, args.variables));
        },
    );
}

/** The first row a kind's own check refuses, as a sentence. */
function firstProblem(kindName: string, rows: readonly unknown[]): string | undefined {
    const kind = acoKind(kindName);
    if (!kind) return `Error: "${kindName}" is not an ACO kind.`;
    for (const [index, row] of rows.entries()) {
        const problem = kind.problem(row);
        if (problem) return `Error: row ${index + 1} of ${kindName} cannot be sent: ${problem}`;
    }
    return undefined;
}

function registerRows(server: McpToolServer, ctxFactory: () => HandlerContext, fetchImpl: typeof fetch): void {
    server.registerTool(
        'write_aco_rows',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: true },
            title: 'Write ACO rows',
            description:
                "Send rows to this project's ACO instance through the ingestion API, or delete them with remove:true: products, " +
                'attribute metadata, categories, price books, prices, product layers. For a whole pack use start_datapack_import, which keeps ' +
                "a record so it can be removed; this tool keeps none, so whoever writes here removes it. ACO accepts rows and applies " +
                'them a little later, about two minutes on a sandbox. Changes the live instance. Requires confirm:true and raises a dialog for the user.',
            inputSchema: {
                kind: z.enum(KIND_NAMES).describe('Which rows these are'),
                rows: z.array(z.record(z.string(), z.unknown())).min(1).describe('The rows, in the shape the ingestion API takes; to remove, each row needs only its key'),
                remove: z.boolean().optional().describe('Delete these rows instead of writing them'),
                confirm: z.boolean().optional().describe('Must be true to proceed'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) return asRawText('write_aco_rows requires confirm:true to proceed.', { isError: true });
            const kind = acoKind(args?.kind);
            if (!kind) return asRawTextMarkingErrors(`Error: "${String(args?.kind)}" is not an ACO kind.`);
            const rows: Record<string, unknown>[] = Array.isArray(args?.rows) ? args.rows : [];
            if (rows.length === 0) return asRawTextMarkingErrors('Error: rows must not be empty.');
            const remove = args?.remove === true;
            const problem = remove ? undefined : firstProblem(kind.kind, rows);
            if (problem) return asRawTextMarkingErrors(problem);
            const access = await accessOf(ctxFactory());
            if ('refusal' in access) return asRawTextMarkingErrors(access.refusal);
            const client = createAcoClient({ instance: access.instance, credential: access.credential, fetch: fetchImpl });
            return answering(async () => {
                let accepted = 0;
                for (const batch of chunks(rows, kind.batch)) accepted += await client.post(remove ? deletePathOf(kind) : kind.path, batch);
                return JSON.stringify({ kind: kind.kind, removed: remove, sent: rows.length, accepted });
            });
        },
    );
}

/**
 * Register the ACO tools.
 *
 * @param server - the tool server
 * @param ctxFactory - the headless handler context (project state + SecretStorage)
 * @param fetchImpl - injected so tests drive the real shaping without a network
 */
export function registerAcoTools(server: McpToolServer, ctxFactory: () => HandlerContext, fetchImpl: typeof fetch = fetch): void {
    registerStatus(server, ctxFactory, fetchImpl);
    registerQuery(server, ctxFactory, fetchImpl);
    registerAdminRead(server, ctxFactory, fetchImpl);
    registerAdminWrite(server, ctxFactory, fetchImpl);
    registerRows(server, ctxFactory, fetchImpl);
    registerAccessKeys(server, ctxFactory, fetchImpl);
}
