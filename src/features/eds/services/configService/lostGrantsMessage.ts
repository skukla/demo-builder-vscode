/**
 * The one sentence that reports admin grants a write could not hand back.
 *
 * Five surfaces report this — the wizard toast, the reset's step-7 line, the
 * reset's step-0 migration line, the repair command, and the service's own log —
 * and they had already drifted in wording ("was written" / "updated" / "Site
 * configuration updated"). `edsResetService` names this exact failure mode for
 * its BYOM text: "Two remedy texts one line apart is the drift, not the fix for
 * it." Rule of Three was well past.
 *
 * Why the message matters more than most: the grants are gone and nothing in the
 * app can restore them, because the access endpoint requires the very role that
 * went missing. The only recovery is a human who still holds it, so the sentence
 * has to say that plainly and name the addresses.
 *
 * Addresses arrive ALREADY MASKED from `updateSiteConfig`; this never masks, so a
 * caller cannot accidentally pass raw ones and have them silently pass through.
 *
 * @module features/eds/services/configService/lostGrantsMessage
 */

/**
 * @param maskedAddresses - masked admin addresses whose grants were lost
 * @param context - what the caller was doing, e.g. `'The site configuration was written'`
 */
export function lostGrantsMessage(maskedAddresses: string[], context: string): string {
    return (
        `${context}, but these admin grants could not be restored and must be re-added ` +
        `by someone who still holds the role: ${maskedAddresses.join(', ')}.`
    );
}
