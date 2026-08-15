/**
 * PII masking for anything that leaves the machine.
 *
 * Lives in core rather than beside its first caller because both the
 * Configuration Service ACCESS module and its PROBE need it, and the probe
 * already imports from access — putting it in either direction created an
 * import cycle.
 *
 * @module core/utils/maskEmail
 */

/**
 * Mask an address for anything that leaves the machine.
 *
 * The diagnostics report is designed to be pasted into tickets and the debug log
 * is exportable, so full colleague addresses in either are PII egress the
 * project's own logging rule forbids. Masked keeps them RECOGNISABLE — a reader
 * who knows the team can still tell who is meant — without publishing the
 * address. Interactive surfaces (the QuickPick, the wizard message) keep the
 * full value: they are transient and never exported.
 *
 * @param email - the address to mask
 * @returns e.g. `o****r@adobe.com`; short local parts keep only their first char
 */
export function maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) return '****';
    const local = email.slice(0, at);
    const domain = email.slice(at);
    if (local.length <= 2) return `${local[0]}****${domain}`;
    return `${local[0]}****${local[local.length - 1]}${domain}`;
}

/**
 * Mask the address in a `?user=` query parameter inside free text.
 *
 * Needed because {@link maskEmail} and any email-shaped regex look for a literal
 * `@`, and `URL.searchParams.set` percent-encodes it — `user=owner%40adobe.com`.
 * The Code Sync setup URL carries the signed-in address that way, and that URL is
 * embedded in a message written to `logger.error` and into a PDP caveat logged at
 * `info`; both are buffered into the debug export users paste into tickets.
 *
 * Only the `user` value is touched. The `org`, `site` and `url` parameters are
 * what make the link land on the right setup page, so masking them would break
 * the remedy the message exists to give.
 */
export function redactUrlUserParam(text: string): string {
    return text.replace(/([?&]user=)([^&\s]*)/gi, (_match, prefix: string, value: string) => {
        if (!value) return `${prefix}${value}`;
        let decoded = value;
        try {
            decoded = decodeURIComponent(value);
        } catch {
            // A malformed escape sequence: mask the raw value rather than throw.
        }
        return `${prefix}${maskEmail(decoded)}`;
    });
}

