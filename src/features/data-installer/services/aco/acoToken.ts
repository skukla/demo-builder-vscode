/**
 * The IMS token for an Adobe Commerce Optimizer (ACO) credential, and the error every ACO call
 * answers with (PL-60). Shared by the ingestion client (`acoClient.ts`) and the admin client
 * (`acoAdminClient.ts`), which ask for different scopes from one credential.
 *
 * The token call is Adobe's documented one (`commerce/services/optimizer/data-ingestion/
 * authentication/`, read 2026-10-31). The secret is sent to IMS and nowhere else; no message or log
 * line carries it.
 *
 * @module features/data-installer/services/aco/acoToken
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AcoCredential } from '@/types/aco';

/** Adobe IMS's token endpoint, as the ingestion docs name it. */
export const ACO_IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

/** A token this close to expiring is renewed first (the SDK's own margin, five minutes). */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

/** Which call failed. */
export type AcoCallStage = 'token' | 'ingestion' | 'admin' | 'tenant';

/** ACO or IMS refused a call, or never answered it. */
export class AcoApiError extends Error {
    constructor(
        message: string,
        readonly stage: AcoCallStage,
        /** The HTTP status; undefined when nothing answered. */
        readonly status?: number,
    ) {
        super(message);
        this.name = 'AcoApiError';
    }
}

/** A response's text, or nothing when it cannot be read. */
export async function readText(response: Response): Promise<string> {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

/** ACO's own words from a refusal: a JSON `message` or `error`, else the body as sent. */
export function theirWords(text: string): string {
    try {
        const body = JSON.parse(text) as { message?: unknown; error?: unknown; error_description?: unknown };
        const said = body.message ?? body.error_description ?? body.error;
        if (typeof said === 'string' && said !== '') return said;
    } catch {
        // not JSON: the text is the answer
    }
    return text.trim() || 'no reason given';
}

/** One call, with "nothing answered" turned into an `AcoApiError`. */
export async function sendAco(doFetch: typeof fetch, url: string, init: RequestInit, stage: AcoCallStage, what: string): Promise<Response> {
    try {
        return await doFetch(url, init);
    } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        throw new AcoApiError(`ACO did not answer ${what}: ${why}`, stage);
    }
}

/** What a token source is built from. */
export interface AcoTokenDeps {
    credential: AcoCredential;
    /** The scopes to ask for, comma separated. */
    scopes: string;
    fetch?: typeof fetch;
    now?: () => number;
}

/** A credential's token for one set of scopes, fetched when asked for and kept until close to expiring. */
export interface AcoTokenSource {
    bearer(): Promise<string>;
    /** The IMS org the token belongs to, from its own claims; undefined when it does not say. */
    org(): Promise<string | undefined>;
    /** Whether the token was granted a scope. A credential not entitled to one still gets a token, without it. */
    granted(scope: string): Promise<boolean>;
}

/** A token's claims. They are read to address a request and report on it, never trusted to prove anything. */
function claimsOf(token: string): { org?: unknown; scope?: unknown } {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { org?: unknown; scope?: unknown };
    } catch {
        return {};
    }
}

/**
 * @throws AcoApiError when IMS refuses the credential or does not answer
 */
export function createAcoTokenSource(deps: AcoTokenDeps): AcoTokenSource {
    const doFetch = deps.fetch ?? fetch;
    const now = deps.now ?? Date.now;
    let token: { value: string; expiresAt: number } | undefined;

    async function bearer(): Promise<string> {
        if (token && token.expiresAt - TOKEN_MARGIN_MS > now()) return token.value;
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: deps.credential.clientId,
            client_secret: deps.credential.clientSecret,
            scope: deps.scopes,
        });
        const init: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        };
        const response = await sendAco(doFetch, ACO_IMS_TOKEN_URL, init, 'token', 'the token request');
        const text = await readText(response);
        if (!response.ok) {
            throw new AcoApiError(`Adobe IMS refused the ACO credential (${response.status}): ${theirWords(text)}`, 'token', response.status);
        }
        const answer = JSON.parse(text) as { access_token?: unknown; expires_in?: unknown };
        if (typeof answer.access_token !== 'string') throw new AcoApiError('Adobe IMS answered without a token.', 'token', response.status);
        const life = typeof answer.expires_in === 'number' ? answer.expires_in * 1000 : 0;
        token = { value: answer.access_token, expiresAt: now() + life };
        return token.value;
    }

    return {
        bearer,
        org: async () => {
            const { org } = claimsOf(await bearer());
            return typeof org === 'string' ? org : undefined;
        },
        granted: async (scope) => {
            const { scope: scopes } = claimsOf(await bearer());
            return typeof scopes === 'string' && scopes.split(',').includes(scope);
        },
    };
}
