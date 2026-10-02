/**
 * The signed Commerce REST call the agent tools share: `run_commerce_rest` (GET)
 * and `write_commerce_rest` (POST, PUT, DELETE).
 *
 * ## The credential, read before writing (not guessed)
 *
 * ACCS REST accepts an IMS bearer from a server-to-server credential registered
 * with the instance and subscribed to `ACCS-REST-API`. The ERP integration's
 * workspace credential is one, and `resolveAppManagementEnv` already resolves
 * its full identity for deploys (`getS2SDeployCredentials`).
 *
 * The token request and the call headers follow Adobe's server-to-server guide
 * for Commerce as a Cloud Service (developer.adobe.com/commerce/webapi/rest/
 * authentication/server-to-server, read 2026-09-24): `POST /ims/token/v3` with
 * `grant_type=client_credentials`, the scopes `openid, AdobeID, email, profile,
 * additional_info.roles, additional_info.projectedProductContext, commerce.accs`
 * ("be sure to include the commerce.accs scope"), and on every REST call
 * `Authorization: Bearer`, `x-api-key: <client id>` and `x-gw-ims-org-id`. The
 * first version used aio-lib-ims's `/ims/token/v2` and fewer scopes and worked
 * live; it was moved to the documented shape the same day. The URL is the tenant
 * base plus `/V1/<path>` with a `Store` header (`getCommerceUrl` and
 * `buildCommerceHttpClientSaaS` in aio-commerce-lib-api). PaaS takes an admin
 * token from a username and password, which is a hand-back to the user, not a
 * parameter; it is refused here until AB-29 adds it.
 *
 * @module features/ai/server/commerceRestClient
 */

import { buildCommerceEndpoints } from './commerceEndpointsTool';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { deriveAccsTenantId } from '@/features/components/services/envVarHelpers';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** The same bound `run_commerce_query` holds, with the cut declared in the payload. */
export const MAX_RESPONSE_CHARS = 30_000;
/** Where a server-to-server token is minted (Adobe's Cloud Service server-to-server guide). */
const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
/** The scopes that guide lists for a Cloud Service REST token, in its order. */
const REST_SCOPES = [
    'openid',
    'AdobeID',
    'email',
    'profile',
    'additional_info.roles',
    'additional_info.projectedProductContext',
    'commerce.accs',
];
/** The Adobe API a credential must hold for ACCS REST to accept its token. */
const ACCS_REST_API = 'ACCS-REST-API';
/** A minted token is reused until this close to its expiry. */
const TOKEN_MARGIN_MS = 60_000;
/** A search with no page size answers 20 rows and says so; Commerce's own default is every row. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * A search path with no `searchCriteria[pageSize]` gets one, and the caller is told: a
 * `customers/search` or `orders` read with no page size answers the whole table, most of
 * it past the 30,000-character cut (measured 2026-09-25 on the orders list). Explicit is
 * untouched; only the bare search is bounded.
 */
export function boundSearch(path: string): { path: string; note?: string } {
    if (!/searchCriteria/u.test(path) || /searchCriteria\[pageSize\]/u.test(path)) {
        return { path };
    }
    const joiner = path.includes('?') ? '&' : '?';
    return {
        path: `${path}${joiner}searchCriteria[pageSize]=${DEFAULT_PAGE_SIZE}`,
        note: `[pageSize ${DEFAULT_PAGE_SIZE} applied; pass searchCriteria[pageSize] to change it]`,
    };
}

/** A relative REST path with a query string: no scheme, no leading slash, no parent hops. */
const PATH = /^[A-Za-z0-9_.\-/?=&%,:+@[\] ]{1,600}$/u;

export type RestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Everything a signed call needs, resolved from the project and the sign-in. */
export interface RestTarget {
    /** The tenant's REST base, e.g. https://na1-sandbox.api.commerce.adobe.com/<tenant> */
    base: string;
    token: string;
    /** The credential's client id and org: the `x-api-key` and `x-gw-ims-org-id` headers. */
    clientId: string;
    imsOrgCode: string;
    storeView?: string;
}

interface MintedToken {
    token: string;
    expiresAt: number;
    /** The credential's public half, which every request's headers carry. */
    clientId: string;
    imsOrgCode: string;
}

/**
 * Tokens by workspace id; a workspace has one credential, so one token serves it. Checked
 * BEFORE the credential is read: reading it is three Adobe Console calls (about 12s, measured
 * 2026-10-01), and doing that on every request made each Commerce call take 12s while the
 * cached token it then found was all the request needed.
 */
const tokens = new Map<string, MintedToken>();

/** Test seam. */
export function resetCommerceRestTokens(): void {
    tokens.clear();
    signing.clear();
}

/** A path that reaches only the REST API under the tenant, or why not. */
export function validateRestPath(raw: unknown): { path: string } | { error: string } {
    const path = String(raw ?? '').trim();
    if (!path)
        return { error: '`path` is required, e.g. customers/search?searchCriteria[pageSize]=20' };
    if (path.startsWith('/') || /^[a-z]+:\/\//i.test(path)) {
        return { error: 'Give the path under /V1 only, without a leading slash or a host.' };
    }
    if (path.split('?')[0].split('/').includes('..') || !PATH.test(path)) {
        return { error: 'That path has characters the REST API does not take.' };
    }
    return { path };
}

/**
 * The workspace whose credential can call ACCS REST: the first integration whose
 * catalog row requires the API and that has a workspace of its own, else the
 * project's workspace. Deterministic and stated, rather than probing credentials.
 */
export function restWorkspaceId(
    project: Pick<Project, 'adobe' | 'appBuilderComponents'>,
): string | undefined {
    const catalog = getAppBuilderComponentCatalog();
    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
        if (state.kind !== 'integration' || !state.workspace?.id) continue;
        // The catalog row by its id (a re-keyed second copy names its catalog id);
        // a custom integration has no row and is skipped rather than rebuilt.
        const catalogId = state.catalogId ?? id;
        const entry = catalog.find((row) => row.id === catalogId);
        if (entry?.requiredApis?.includes(ACCS_REST_API)) {
            return state.workspace.id;
        }
    }
    return project.adobe?.workspace;
}

/** The workspace's minted token, while it has a minute left; undefined otherwise. */
function cachedToken(workspaceId: string): MintedToken | undefined {
    const cached = tokens.get(workspaceId);
    return cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now() ? cached : undefined;
}

async function mintToken(
    workspaceId: string,
    credentials: { clientId: string; clientSecret: string; imsOrgCode: string },
    fetchImpl: typeof fetch,
): Promise<string> {
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        org_id: credentials.imsOrgCode,
        scope: REST_SCOPES.join(','),
    });
    const res = await fetchImpl(IMS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok)
        throw new Error(`IMS refused the credential (HTTP ${res.status}): ${text.slice(0, 300)}`);
    const answer = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!answer.access_token) throw new Error('IMS answered without an access token.');
    tokens.set(workspaceId, {
        token: answer.access_token,
        expiresAt: Date.now() + (answer.expires_in ?? 0) * 1000,
        clientId: credentials.clientId,
        imsOrgCode: credentials.imsOrgCode,
    });
    return answer.access_token;
}

/** The tenant's REST base from its GraphQL endpoint: the same host and tenant, no `/graphql`. */
function restBase(commerceGraphQl: string): string | undefined {
    if (!deriveAccsTenantId(commerceGraphQl)) return undefined;
    return commerceGraphQl.replace(/\/graphql\/?$/i, '');
}

const SIGN_IN_TEXT =
    'Error: Adobe sign-in required. Check get_auth_status, then sign_in(provider:"adobe", confirm:true) once the user agrees.';

/**
 * Resolve where a call goes and what signs it, or the refusal that stops it.
 * Every refusal is prose starting "Error: " so both tools answer the same way.
 */
export async function resolveRestTarget(
    ctx: HandlerContext,
    storeViewArg: unknown,
    fetchImpl: typeof fetch,
): Promise<RestTarget | { refusal: string }> {
    const project = await ctx.stateManager.getCurrentProject();
    if (!project)
        return {
            refusal: 'Error: no current project. Use list_projects then set the current project.',
        };
    return resolveRestTargetFor(project, ctx.authManager, storeViewArg, fetchImpl);
}

/**
 * The same, for a project already in hand (the ERP fill runs inside an add, where the
 * project is the one being changed, not necessarily the current one).
 */
export async function resolveRestTargetFor(
    project: Project,
    authManager: HandlerContext['authManager'],
    storeViewArg: unknown,
    fetchImpl: typeof fetch,
): Promise<RestTarget | { refusal: string }> {
    const facts = buildCommerceEndpoints(project);
    if (facts.backend !== 'accs') {
        return {
            refusal:
                'Error: the Commerce REST tools reach ACCS backends only for now. A PaaS backend takes an ' +
                'admin username and password, which is not a tool parameter (AB-29).',
        };
    }
    const base = facts.endpoints.commerceGraphQl && restBase(facts.endpoints.commerceGraphQl);
    if (!base) return { refusal: 'Error: this project has no ACCS Commerce endpoint configured.' };
    const signedIn = await authManager?.isAuthenticated().catch(() => false);
    if (!authManager || !signedIn) return { refusal: SIGN_IN_TEXT };
    const { organization, projectId } = project.adobe ?? {};
    const workspaceId = restWorkspaceId(project);
    if (!organization || !projectId || !workspaceId) {
        return {
            refusal:
                'Error: the project has no Adobe org, project and workspace to take a credential from.',
        };
    }
    const storeView =
        typeof storeViewArg === 'string' && storeViewArg ? storeViewArg : facts.headers.all?.Store;
    try {
        const signed = cachedToken(workspaceId) ?? (await signOnce(workspaceId, () => authManager
            .getS2SDeployCredentials(organization, projectId, workspaceId)
            .then((credentials) => mintToken(workspaceId, credentials, fetchImpl))));
        return { base, token: signed.token, clientId: signed.clientId, imsOrgCode: signed.imsOrgCode, storeView };
    } catch (error) {
        return {
            refusal: `Error: could not sign the request — ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Mints in flight, by workspace. Two callers that find no token at once share one
 * credential read and mint rather than starting two: the setup guide warms the token when
 * it opens, and a check pressed during that wait joins it (2026-10-01).
 */
const signing = new Map<string, Promise<MintedToken>>();

async function signOnce(workspaceId: string, mint: () => Promise<string>): Promise<MintedToken> {
    const inFlight = signing.get(workspaceId);
    if (inFlight) return inFlight;
    const started = mint()
        .then(() => {
            const minted = tokens.get(workspaceId);
            if (!minted) throw new Error('IMS answered without a token for this workspace.');
            return minted;
        })
        .finally(() => signing.delete(workspaceId));
    signing.set(workspaceId, started);
    return started;
}

/** Commerce's ACL refusal — the one 403 that IS about the credential. */
const ACL_REFUSAL = /isn't authorized to access/u;

function explainStatus(status: number, body: string): string {
    // A 403 is only a credential problem when Commerce says so. Its other 403s carry
    // their own reason — "Adding a new gallery entry has been disabled by AEM Assets
    // Integration" (2026-09-30) — and blaming the credential for those sent the reader
    // to reinstall an integration that was fine.
    if (status === 401 || (status === 403 && ACL_REFUSAL.test(body))) {
        return (
            `Error: Commerce REST answered HTTP ${status}. The workspace credential is not accepted ` +
            `by this instance — it needs the ${ACCS_REST_API} API subscribed and the instance must ` +
            'know it (installing the ERP integration does both). ' +
            body.slice(0, 300)
        );
    }
    return `Error: Commerce REST answered HTTP ${status}. ${body.slice(0, 500)}`;
}

/** One signed call's whole answer, or why it never answered. */
export type RestAnswer = { ok: boolean; status: number; text: string } | { failed: string };

/**
 * Send one signed call and answer its status and WHOLE body, uncut: for a caller that
 * parses the answer (the ERP fill), where `sendRest`'s cut would break the JSON.
 */
/**
 * Where a call goes: the synchronous `/V1` API, or the asynchronous bulk API, which
 * takes an ARRAY of requests in one call and answers a `bulk_uuid` to poll
 * (`GET V1/bulk/{uuid}/status`). The bulk API is what makes a catalog load one call
 * instead of one per product (owner, 2026-09-30: 96 products at 13–25 s each
 * "doesn't bode well for a quick action for an end user").
 *
 * The prefix is the ACCS one: "In Adobe Commerce as a Cloud Service, the /async/bulk
 * segment occurs after the V1 segment of the route" —
 * developer.adobe.com/commerce/webapi/rest/use-rest/bulk-endpoints/. PaaS puts it
 * before (`/rest/async/bulk/V1/…`); this client reaches ACCS only. Measured
 * 2026-09-30: the PaaS order answered an empty 404 from the gateway on the sandbox.
 */
export interface RestRoute {
    bulk?: boolean;
}

/** The path prefix under the tenant for the route. */
export function restPrefix(route: RestRoute | undefined): string {
    return route?.bulk ? 'V1/async/bulk' : 'V1';
}

export async function requestRest(
    method: RestMethod,
    target: RestTarget,
    path: string,
    body: unknown,
    fetchImpl: typeof fetch,
    route?: RestRoute,
): Promise<RestAnswer> {
    const controller = new AbortController();
    // Commerce on the sandbox can take far longer than 30s to answer anything:
    // a company POST ran past it while sending welcome mail no server delivers,
    // and by evening plain GETs (eventing/supportedList, companyCredits) were
    // aborted at NORMAL three times over (measured 2026-09-24). An aborted write
    // may still land server-side, so a retry risks a duplicate; an aborted read
    // is a wasted minute. Both wait LONG; the caller's probe sets its own ceiling.
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.LONG);
    try {
        const res = await fetchImpl(`${target.base}/${restPrefix(route)}/${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${target.token}`,
                'x-api-key': target.clientId,
                'x-gw-ims-org-id': target.imsOrgCode,
                Accept: 'application/json',
                ...(target.storeView ? { Store: target.storeView } : {}),
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            signal: controller.signal,
        });
        return { ok: res.ok, status: res.status, text: await res.text() };
    } catch (error) {
        return { failed: error instanceof Error ? error.message : String(error) };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Send one signed call and answer its body as text: an error line on a failure,
 * the body (cut and declared past the ceiling) on success.
 */
export async function sendRest(
    method: RestMethod,
    target: RestTarget,
    path: string,
    body: unknown,
    fetchImpl: typeof fetch,
    route?: RestRoute,
): Promise<string> {
    const bounded = method === 'GET' ? boundSearch(path) : { path };
    const answer = await requestRest(method, target, bounded.path, body, fetchImpl, route);
    if ('failed' in answer) return `Error: the request failed — ${answer.failed}`;
    const { text } = answer;
    if (!answer.ok) return explainStatus(answer.status, text);
    const notes = [bounded.note];
    if (route?.bulk) {
        notes.push(
            '[accepted, not yet applied: poll run_commerce_rest "bulk/<bulk_uuid>/status" ' +
                'until every request_item is complete]',
        );
    }
    const prefix = notes.filter(Boolean).length ? `${notes.filter(Boolean).join('\n')}\n` : '';
    if (text.length > MAX_RESPONSE_CHARS) {
        return (
            `${prefix}[truncated: ${text.length} chars, showing the first ${MAX_RESPONSE_CHARS}. ` +
            'Narrow the read — a smaller pageSize, or a fields= filter.]\n' +
            text.slice(0, MAX_RESPONSE_CHARS)
        );
    }
    return `${prefix}${text || `{"ok":true,"status":${answer.status}}`}`;
}
