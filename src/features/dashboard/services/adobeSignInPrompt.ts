/**
 * Ask for an Adobe sign-in when it has expired, once per expiry.
 *
 * Owner, 2026-10-17: "An expired adobe login should PROMPT, but it should not open a
 * browser automatically." It replaces the 2026-09-20 rule that opening a dashboard
 * never asks, where the only sign was the badge ("Signed out · Sign in"), and an SC
 * coming back after hours missed it. The browser opens only on a yes.
 *
 * Once per expiry: a declined prompt must not return on every dashboard refresh. The
 * memory is cleared when the org check next finds a valid sign-in, so the following
 * expiry asks again. Module state rather than per dashboard, because the expiry is
 * the session's, not a screen's.
 *
 * @module features/dashboard/services/adobeSignInPrompt
 */

let askedThisExpiry = false;

/**
 * Ask, unless already asked during this expiry; sign in on a yes.
 *
 * @param ask - shows the prompt; true when the SC chose to sign in
 * @param signIn - the sign-in the dashboard's "Sign in" link runs
 */
export async function askToSignInOnce(
    ask: () => Promise<boolean>,
    signIn: () => Promise<unknown>,
): Promise<void> {
    if (askedThisExpiry) return;
    askedThisExpiry = true;
    if (await ask()) await signIn();
}

/** The sign-in is good again: the next expiry asks again. */
export function adobeSignInRestored(): void {
    askedThisExpiry = false;
}
