/**
 * A content site, named the way aem.page names it: `main--<site>--<org>.aem.page`.
 */

/** A GitHub owner/repo pair that aem.page serves. */
export interface SiteRef {
    org: string;
    site: string;
}

/** The preview origin of a site's `main` branch, without a trailing slash. */
export function previewOrigin(site: SiteRef): string {
    return `https://main--${site.site}--${site.org}.aem.page`;
}
