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
}

/** Tokens by workspace id; a workspace has one credential, so one token serves it. */
const tokens = new Map<string, MintedToken>();

/** Test seam. */
export function resetCommerceRestTokens(): void {
    tokens.clear();
}

/** A path that reaches only the REST API under the tenant, or why not. */
export function validateRestPath(raw: unknown): { path: string } | { error: string } {
    const path = String(raw ?? '').trim();
    if (!path) return { error: '`path` is required, e.g. customers/search?searchCriteria[pageSize]=20' };
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
export function restWorkspaceId(project: Pick<Project, 'adobe' | 'appBuilderComponents'>): string | undefined {
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

async function mintToken(
    workspaceId: string,
    credentials: { clientId: string; clientSecret: string; imsOrgCode: string },
    fetchImpl: typeof fetch,
): Promise<string> {
    const cached = tokens.get(workspaceId);
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) return cached.token;
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
    if (!res.ok) throw new Error(`IMS refused the credential (HTTP ${res.status}): ${text.slice(0, 300)}`);
    const answer = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!answer.access_token) throw new Error('IMS answered without an access token.');
    tokens.set(workspaceId, {
        token: answer.access_token,
        expiresAt: Date.now() + (answer.expires_in ?? 0) * 1000,
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
    if (!project) return { refusal: 'Error: no current project. Use list_projects then set the current project.' };
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
    const signedIn = await ctx.authManager?.isAuthenticated().catch(() => false);
    if (!ctx.authManager || !signedIn) return { refusal: SIGN_IN_TEXT };
    const { organization, projectId } = project.adobe ?? {};
    const workspaceId = restWorkspaceId(project);
    if (!organization || !projectId || !workspaceId) {
        return { refusal: 'Error: the project has no Adobe org, project and workspace to take a credential from.' };
    }
    try {
        const credentials = await ctx.authManager.getS2SDeployCredentials(organization, projectId, workspaceId);
        const token = await mintToken(workspaceId, credentials, fetchImpl);
        const storeView = typeof storeViewArg === 'string' && storeViewArg ? storeViewArg : facts.headers.all?.Store;
        return { base, token, clientId: credentials.clientId, imsOrgCode: credentials.imsOrgCode, storeView };
    } catch (error) {
        return { refusal: `Error: could not sign the request — ${error instanceof Error ? error.message : String(error)}` };
    }
}

function explainStatus(status: number, body: string): string {
    if (status === 401 || status === 403) {
        return (
            `Error: Commerce REST answered HTTP ${status}. The workspace credential is not accepted ` +
            `by this instance — it needs the ${ACCS_REST_API} API subscribed and the instance must ` +
            'know it (installing the ERP integration does both). ' +
            body.slice(0, 300)
        );
    }
    return `Error: Commerce REST answered HTTP ${status}. ${body.slice(0, 500)}`;
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
): Promise<string> {
    const controller = new AbortController();
    // A read answers in seconds. A write can take Commerce far longer: creating a
    // company on the sandbox ran past 30s while it tried to send welcome mail no
    // server delivers (measured 2026-09-24, aborted twice at NORMAL), and an
    // aborted write may still land server-side, so a retry risks a duplicate.
    const timer = setTimeout(() => controller.abort(), method === 'GET' ? TIMEOUTS.NORMAL : TIMEOUTS.LONG);
    let res: Response;
    try {
        res = await fetchImpl(`${target.base}/V1/${path}`, {
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
    } catch (error) {
        return `Error: the request failed — ${error instanceof Error ? error.message : String(error)}`;
    } finally {
        clearTimeout(timer);
    }
    const text = await res.text();
    if (!res.ok) return explainStatus(res.status, text);
    if (text.length > MAX_RESPONSE_CHARS) {
        return (
            `[truncated: ${text.length} chars, showing the first ${MAX_RESPONSE_CHARS}. ` +
            'Narrow the read — a smaller pageSize, or a fields= filter.]\n' +
            text.slice(0, MAX_RESPONSE_CHARS)
        );
    }
    return text || `{"ok":true,"status":${res.status}}`;
}
