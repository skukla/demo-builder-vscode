/**
 * Which link and image URLs a copied block example may keep: Adobe's rule from DA.live's Import
 * Blocks (adobe/da-live `blocks/config/blocks-import/blocks.js` `isSafeUrl`, Apache-2.0).
 *
 * Adobe reads attribute values through a DOM, which has already decoded character references.
 * Here the HTML is not decoded (the parser keeps it as written), so references are decoded before
 * the check, and one that cannot be decoded before the first colon counts as unsafe.
 */

const NAMED_REFERENCES: Record<string, string> = {
    colon: ':', tab: '\t', newline: '\n', period: '.', plus: '+', amp: '&',
};

const REFERENCE = /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));?/gi;

function decodeReferences(value: string): string {
    return value.replace(REFERENCE, (whole, dec?: string, hex?: string, name?: string) => {
        if (dec) return String.fromCodePoint(Number(dec));
        if (hex) return String.fromCodePoint(parseInt(hex, 16));
        return NAMED_REFERENCES[(name ?? '').toLowerCase()] ?? whole;
    });
}

/** True for a URL a browser can only follow as a page or file: no scheme, http(s), mailto, tel. */
export function isSafeUrl(url: string | undefined): boolean {
    // Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `isSafeUrl` (Import Blocks):
    // browsers ignore whitespace and control characters in a scheme.
    const value = [...decodeReferences(url ?? '')]
        .filter((c) => c.charCodeAt(0) > 32 && !/\s/.test(c)).join('');
    const colon = value.indexOf(':');
    if (colon > 0 && value.slice(0, colon).includes('&')) return false;
    return !/^[a-z][a-z0-9+.-]*:/i.test(value) || /^(https?|mailto|tel):/i.test(value);
}

/** Mirrors adobe/da-live blocks.js `safeSrcset`: every candidate's URL is safe. */
export function isSafeSrcset(srcset: string | undefined): boolean {
    return (srcset ?? '').split(',').every((entry) => isSafeUrl(entry.trim().split(/\s+/)[0]));
}
