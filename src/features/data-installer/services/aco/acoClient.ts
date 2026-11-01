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

import { AcoApiError, createAcoTokenSource, readText, sendAco, theirWords } from './acoToken';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { acoApiBase } from '@/features/components/services/acoSettings';
import type { AcoCredential, AcoInstance } from '@/types/aco';

export { ACO_IMS_TOKEN_URL, AcoApiError, type AcoCallStage } from './acoToken';

/** The scopes the ingestion docs' token request asks for. */
export const ACO_INGESTION_SCOPES = 'openid,AdobeID,profile,email,commerce.aco.ingestion';

/**
 * The timeouts, read when a call is made rather than when the module loads, so a suite that stubs
 * part of `TIMEOUTS` can still import a module that imports this one.
 */
const TIMEOUT = {
    /** How long one ingestion write may take: a batch of 100 products, sent and accepted. */
    write: () => TIMEOUTS.LONG,
    /** The wait before a retry when ACO's 429 names none. */
    rateLimit: () => TIMEOUTS.POLL.MAX,
};

/** How many times a write refused with 429 is tried again before the 429 stands. */
const RATE_LIMIT_RETRIES = 3;

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
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const base = acoApiBase(deps.instance);
    const token = createAcoTokenSource({ credential: deps.credential, scopes: ACO_INGESTION_SCOPES, fetch: doFetch, now: deps.now });

    async function write(path: AcoIngestionPath, rows: readonly unknown[]): Promise<Response> {
        const what = `POST ${path}`;
        for (let attempt = 0; ; attempt++) {
            const init: RequestInit = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token.bearer()}` },
                body: JSON.stringify(rows),
                signal: AbortSignal.timeout(TIMEOUT.write()),
            };
            const response = await sendAco(doFetch, `${base}${path}`, init, 'ingestion', what);
            if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) return response;
            await sleep(retryWait(response));
        }
    }

    return {
        async authenticate() {
            await token.bearer();
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
