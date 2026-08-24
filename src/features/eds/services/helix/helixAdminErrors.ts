/**
 * Helix Admin API error capture and classification — pure helpers.
 *
 * The admin API says WHY in inconvenient places: the `x-error` header (the
 * body is often empty on 401/403), a body worth at most 500 diagnostic chars,
 * and a 403 that means "expired token" as often as it means "no role" — which
 * {@link throwCredentialRefused} converts into a `DaLiveAuthError` so
 * `withDaLiveAuthRetry` can prompt and resume instead of blaming the user.
 *
 * Extracted from `helixService.ts` (god-file cut 3, 2026-08-23). Pure
 * functions over `Response` — no tokens, no state.
 *
 * @module features/eds/services/helixAdminErrors
 */

import { DaLiveAuthError } from '../types';

/**
 * What a 401 from the Helix Admin API actually means.
 *
 * It is NOT necessarily a GitHub problem, which is what this message used to
 * claim. Once a site has any `access.admin` role, the Configuration Service sets
 * `requireAuth: "auto"` and the whole admin API closes to callers without an
 * accepted admin identity — the GitHub token is not one. Measured 2026-08-14 on
 * a throwaway site: an identical bulk-preview POST returned 202 before the admin
 * grant and 401 immediately after, then 202 again once the DA.live IMS Bearer
 * was attached.
 */
export const ADMIN_API_401_MESSAGE =
    'Adobe rejected the request (401). If this site has site-access admins configured, ' +
    'it needs a signed-in DA.live session — run "Demo Builder: Manage Site Access" to ' +
    'check. Otherwise, confirm you have write access to the repository.';

/** Capture error response body for diagnostics (403, 401, 5xx). */
export async function captureErrorBody(response: Response): Promise<string | null> {
    try {
        const text = await response.text();
        if (!text || text.length > 500) return text ? text.slice(0, 500) + '...' : null;
        return text;
    } catch {
        return null;
    }
}

/** AEM returns error details in x-error header; body is often empty for 403. */
export function getXError(response: Response): string | null {
    return response?.headers?.get?.('x-error') ?? null;
}

/** Build diagnostic string from body and x-error for 403/401. */
export async function captureErrorDetail(response: Response): Promise<string> {
    const body = await captureErrorBody(response);
    const xError = getXError(response);
    const parts = [xError, body].filter(Boolean);
    return parts.length ? parts.join(' — ') : `${response.status} ${response.statusText}`;
}

    /**
     * Raise a 403 as a CREDENTIAL refusal, not a permissions verdict.
     *
     * Helix answers `403 [admin] not authorized` both when an identity genuinely
     * lacks a role AND when a perfectly authorized identity presents a token the
     * server will no longer accept. These threw a plain `Error` saying "you do
     * not have permission", which is a claim about the USER that the response
     * does not support.
     *
     * Measured 2026-08-16: one reset failed with 52 of these plus a fatal
     * "you do not have permission to preview", told the user at three surfaces
     * that they held no admin role, and succeeded forty minutes later — same
     * identity, same project, after nothing but a DA.live re-auth.
     *
     * Throwing `DaLiveAuthError` lets `withDaLiveAuthRetry` prompt and resume
     * instead. The classification cannot separate "expired token" from "genuinely
     * unauthorized identity" — Helix gives the same `x-error` for both — and it
     * does not need to: re-authenticating as an identity that really lacks the
     * role fails the retry and surfaces the original error after
     * MAX_REAUTH_ATTEMPTS. The cost of being wrong is one prompt; the cost of not
     * trying was a three-minute pipeline failing 52 times.
     *
     * NOT used for the DELETE /live 403, which is the documented
     * "while source exists" restriction — a real constraint, not a credential
     * problem, and on a different method (see `HelixAdminAuth.getDeleteAuthHeaders`).
     */
export async function throwCredentialRefused(response: Response, what: string): Promise<never> {
    const detail = await captureErrorDetail(response);
    throw new DaLiveAuthError(
        `Access denied while trying to ${what} (403: ${detail}). ` +
            'This may be an expired session rather than a missing role.',
    );
}
