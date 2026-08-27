/**
 * Minimal typings for `@adobe/aio-lib-ims` (ships no types).
 *
 * Only the two members the silent token refresh uses are declared
 * (`tokenManager.refreshStoredToken`). `getToken(contextName)` is the SAME
 * call the `aio` CLI makes on every invocation: it returns the stored access
 * token when valid, silently refreshes via the context's refresh credentials
 * when not, and throws when neither is possible. `context.get` returns the
 * library's own view of the context, including the token it just minted.
 *
 * Verified against 7.0.2 (2026-08-27): getToken('cli') resolves a JWT string;
 * context.get('cli') resolves `{ name, data }` with
 * `data.access_token: { token, expiry }`.
 */
declare module '@adobe/aio-lib-ims' {
    /** Resolve a valid access token for the context, silently refreshing if needed. */
    export function getToken(contextName: string): Promise<string>;
    export const context: {
        /** The library's view of a context (tokens included). Undefined data when absent. */
        get(contextName: string): Promise<{ name?: string; data?: unknown } | undefined>;
    };
}
