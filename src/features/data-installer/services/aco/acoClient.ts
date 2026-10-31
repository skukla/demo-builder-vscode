/**
 * The one Adobe Commerce Optimizer (ACO) client (PL-60, owner 2026-10-31 P4): it mints its own IMS
 * token from the project's ACO credential and sends rows to the instance's Data Ingestion API. It
 * stands beside `projectCommerce` (`buildDatapackEngine.ts`), which is the Commerce side.
 *
 * Every shape here is Adobe's documented one (developer.adobe.com, read 2026-10-31):
 * - the token: `POST https://ims-na1.adobelogin.com/ims/token/v3` with `grant_type=client_credentials`,
 *   the client id and secret and the scope below; valid 24 hours
 *   (`commerce/services/optimizer/data-ingestion/authentication/`);
 * - the base URL `https://{region}[-sandbox].api.commerce.adobe.com/{tenantId}`, JSON array bodies,
 *   a 429 past 300 requests a minute (`…/data-ingestion/using-the-api/`).
 * Adobe's TypeScript SDK (`@adobe-commerce/aco-ts-sdk` 1.2.2) builds the same URL and token call,
 * and answers `{ status, acceptedCount }` from a write.
 *
 * The secret is sent to IMS and nowhere else; no message or log line carries it.
 *
 * @module features/data-installer/services/aco/acoClient
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { acoApiBase } from '@/features/components/services/acoSettings';
import type { AcoCredential, AcoInstance } from '@/types/aco';

/** Adobe IMS's token endpoint, as the ingestion docs name it. */
export const ACO_IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

/** The scopes the ingestion docs' token request asks for. */
export const ACO_INGESTION_SCOPES = 'openid,AdobeID,profile,email,commerce.aco.ingestion';

/**
 * The timeouts, read when a call is made rather than when the module loads, so a suite that stubs
 * part of `TIMEOUTS` can still import a module that imports this one.
 */
const TIMEOUT = {
    /** How long a token request may take. */
    token: () => TIMEOUTS.NORMAL,
    /** How long one ingestion write may take: a batch of 100 products, sent and accepted. */
    write: () => TIMEOUTS.LONG,
    /** The wait before a retry when ACO's 429 names none. */
    rateLimit: () => TIMEOUTS.POLL.MAX,
};

/** A token this close to expiring is renewed first (the SDK's own margin, five minutes). */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

/** How many times a write refused with 429 is tried again before the 429 stands. */
const RATE_LIMIT_RETRIES = 3;

/** Which call failed: the token, or the write. */
export type AcoCallStage = 'token' | 'ingestion';

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

/** A Data Ingestion API path, under the instance. */
export type AcoIngestionPath = `/v1/catalog/${string}`;

/** What the engine asks of ACO. */
export interface AcoClient {
    /**
     * Mint a token from the credential, writing nothing: what "can Demo Builder reach this
     * instance's ingestion?" asks before a load.
     *
     * @throws AcoApiError when IMS refuses the credential or does not answer
     */
    authenticate(): Promise<void>;
    /**
     * Send rows to one ingestion path.
     *
     * @returns how many ACO says it accepted (the row count when it does not say)
     * @throws AcoApiError naming the status and ACO's words
     */
    post(path: AcoIngestionPath, rows: readonly unknown[]): Promise<number>;
}

/** What the client is built from. */
export interface AcoClientDeps {
    instance: AcoInstance;
    credential: AcoCredential;
    fetch?: typeof fetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

interface Token {
    value: string;
    expiresAt: number;
}

async function readText(response: Response): Promise<string> {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

/** ACO's own words from a refusal: a JSON `message` or `error`, else the body as sent. */
function theirWords(text: string): string {
    try {
        const body = JSON.parse(text) as { message?: unknown; error?: unknown; error_description?: unknown };
        const said = body.message ?? body.error_description ?? body.error;
        if (typeof said === 'string' && said !== '') return said;
    } catch {
        // not JSON: the text is the answer
    }
    return text.trim() || 'no reason given';
}

async function send(doFetch: typeof fetch, url: string, init: RequestInit, stage: AcoCallStage, what: string): Promise<Response> {
    try {
        return await doFetch(url, init);
    } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        throw new AcoApiError(`ACO did not answer ${what}: ${why}`, stage);
    }
}

function retryWait(response: Response): number {
    const seconds = Number(response.headers.get('retry-after'));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : TIMEOUT.rateLimit();
}

/**
 * The client for one instance and credential. The token is fetched on the first call and kept
 * until it is close to expiring.
 */
export function createAcoClient(deps: AcoClientDeps): AcoClient {
    const doFetch = deps.fetch ?? fetch;
    const now = deps.now ?? Date.now;
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const base = acoApiBase(deps.instance);
    let token: Token | undefined;

    async function bearer(): Promise<string> {
        if (token && token.expiresAt - TOKEN_MARGIN_MS > now()) return token.value;
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: deps.credential.clientId,
            client_secret: deps.credential.clientSecret,
            scope: ACO_INGESTION_SCOPES,
        });
        const init: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(TIMEOUT.token()),
        };
        const response = await send(doFetch, ACO_IMS_TOKEN_URL, init, 'token', 'the token request');
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

    async function write(path: AcoIngestionPath, rows: readonly unknown[]): Promise<Response> {
        const what = `POST ${path}`;
        for (let attempt = 0; ; attempt++) {
            const init: RequestInit = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await bearer()}` },
                body: JSON.stringify(rows),
                signal: AbortSignal.timeout(TIMEOUT.write()),
            };
            const response = await send(doFetch, `${base}${path}`, init, 'ingestion', what);
            if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) return response;
            await sleep(retryWait(response));
        }
    }

    return {
        async authenticate() {
            await bearer();
        },
        async post(path, rows) {
            const response = await write(path, rows);
            const text = await readText(response);
            if (!response.ok) {
                throw new AcoApiError(`ACO answered ${response.status} for POST ${path}: ${theirWords(text)}`, 'ingestion', response.status);
            }
            try {
                const accepted = (JSON.parse(text) as { acceptedCount?: unknown }).acceptedCount;
                return typeof accepted === 'number' ? accepted : rows.length;
            } catch {
                return rows.length;
            }
        },
    };
}
