/**
 * Minimal typings for `@adobe/aio-lib-ims` (ships no types).
 *
 * Only what the silent token refresh uses is declared
 * (`tokenManager.refreshStoredToken`).
 *
 * **`getToken` is NOT declared here, on purpose.** It looked like the right
 * call — it is the one the `aio` CLI makes — but reading
 * `src/token-helper.js` (7.0.2) shows its resolution chain is
 * `access_token valid` → else exchange the refresh token → **else
 * `_generateToken`**, which runs the login plugins and OPENS A BROWSER. The
 * fallback is not optional: the `options` argument is merged into the login
 * config, and there is no flag that forbids it. So a background auth check
 * that calls `getToken` can put a sign-in page on screen with nobody asking
 * for one — which is what happened on project load, 2026-09-02.
 *
 * What IS declared is the middle step on its own: `Ims#getAccessToken` with a
 * refresh token performs exactly the silent exchange, and fails instead of
 * escalating to a human. `context.set` persists the result the way the
 * library's own `_persistTokens` does, so the CLI sees the refreshed token.
 *
 * Verified against 7.0.2 (2026-08-27, extended 2026-09-02):
 * `context.get('cli')` resolves `{ name, data, local }` with
 * `data.access_token: { token, expiry }`; `getAccessToken` resolves
 * `{ access_token, refresh_token, payload }`.
 */
declare module '@adobe/aio-lib-ims' {
    /** One stored token as the library persists it. */
    interface ImsStoredToken {
        token?: string;
        expiry?: number;
    }

    /** The `cli` context's data: tokens plus the client credentials to refresh them. */
    interface ImsContextData {
        access_token?: ImsStoredToken;
        refresh_token?: ImsStoredToken;
        env?: string;
        client_id?: string;
        client_secret?: string;
        scope?: string;
    }

    /** Low-level IMS API. Constructed with the context's environment. */
    export class Ims {
        constructor(env?: string);
        /**
         * Trade an authorization code OR a refresh token for a fresh token pair.
         * Rejects when IMS refuses — it never prompts.
         */
        getAccessToken(
            authCode: string,
            clientId?: string,
            clientSecret?: string,
            scopes?: string,
        ): Promise<{ access_token?: ImsStoredToken; refresh_token?: ImsStoredToken }>;
    }

    export const context: {
        /** The library's view of a context (tokens included). Undefined data when absent. */
        get(
            contextName: string,
        ): Promise<{ name?: string; data?: ImsContextData; local?: boolean } | undefined>;
        /** Persist one context key, e.g. `cli.access_token`. */
        set(key: string, value: unknown, local?: boolean): Promise<unknown>;
    };
}
