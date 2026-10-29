/**
 * Does Adobe IMS still accept this DA.live sign-in RIGHT NOW?
 *
 * A DA.live token is an Adobe IMS token (client_id `darkalley`), and IMS can cancel one
 * long before its own expiry. Measured 2026-10-28: a forced Adobe sign-in
 * (`aio auth login -f`) sends the browser through Adobe's logout first, which ends the
 * browser session the DA.live token belongs to. Afterwards IMS answered `valid: false`,
 * AEM refused every site with 403 and DA.live with 403, while the token's own expiry
 * still said 23 hours.
 *
 * So the answer comes from IMS, not from the token, and not from DA.live:
 *
 *   GET https://ims-na1.adobelogin.com/ims/validate_token/v1?client_id=darkalley&type=access_token
 *   Authorization: Bearer <token>
 *   → 200 { valid: boolean, reason?: string, expires_at: number }
 *
 * A cancelled token still answers 200, with `valid: false`. Neither DA.live nor AEM can
 * stand in for this: until 2026-10-28 the check was `HEAD admin.da.live/list/{org}/`,
 * which reads only a 401 as a refusal, and DA.live answered the cancelled token with a
 * 403, so the status said signed in (EDS-30). AEM's `admin.hlx.page/profile` answers 200
 * for a cancelled token: it only decodes it.
 *
 * `unknown` is IMS not answering, or answering in a shape this does not know. It is
 * never a refusal and never an acceptance; each caller of
 * `DaLiveAuthService.checkSignIn` says what it does with it.
 *
 * @module features/eds/services/daLive/daLiveSignInCheck
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** IMS's own validity check for an access token issued to DA.live's client. */
export const IMS_VALIDATE_DA_LIVE_TOKEN_URL =
    'https://ims-na1.adobelogin.com/ims/validate_token/v1?client_id=darkalley&type=access_token';

/** `valid`: IMS accepts it. `refused`: IMS says it is not valid. `unknown`: no clear answer. */
export type ImsTokenVerdict = 'valid' | 'refused' | 'unknown';

/**
 * Ask IMS whether it accepts a DA.live token. A read: it changes nothing.
 *
 * @param token - the stored DA.live access token
 * @returns the verdict; never throws
 */
export async function askImsAboutDaLiveToken(token: string): Promise<ImsTokenVerdict> {
    try {
        const response = await fetch(IMS_VALIDATE_DA_LIVE_TOKEN_URL, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        if (response.status !== 200) return 'unknown';
        const body = (await response.json()) as { valid?: unknown };
        if (body.valid === true) return 'valid';
        if (body.valid === false) return 'refused';
        return 'unknown';
    } catch {
        return 'unknown';
    }
}
