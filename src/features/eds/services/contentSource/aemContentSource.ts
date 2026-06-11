/**
 * AEM-Sites ContentSource (Slice 2)
 *
 * Point-at, no-copy: the joiner's already-authored AEM Sites instance IS the
 * content. This source produces the Configuration Service `content.source`
 * block from the AEM author URL + the authored content tree path, and carries
 * NO read token — AEM authorizes the EDS content read server-side (Site
 * Authentication Token / technical account configured inside AEM). So
 * `getContentSourceAuthorization()` returns `null` and the Helix
 * `x-content-source-authorization` header is omitted.
 *
 * Content copy/publish/block-library operations are intentionally absent (they
 * live on `DaLiveContentOperations`): there is nothing to copy for a point-at
 * source.
 *
 * NOTE: the exact `content.source` URL shape for an AEM-author markup source is
 * a live-test item (plan overview R1) — confirmed at the F5. This implements
 * the author-URL + content-path composition.
 *
 * @module features/eds/services/contentSource/aemContentSource
 */

import type { ContentSource, ContentSourceCoords } from './contentSource';

/** Reject path values that aren't safe to embed in a URL (same discipline as fstabGenerator). */
function assertSafeContentPath(path: string): void {
    if (/[\n\r\t\f\v ]/.test(path)) {
        throw new Error(
            'Invalid AEM content path: contains whitespace or control characters not allowed in a URL path',
        );
    }
}

export class AemContentSource implements ContentSource {
    readonly type = 'aem-sites' as const;

    private readonly authorOrigin: string;

    /** @param authorUrl AEM-as-Cloud-Service author host, e.g. `https://author-pXXXX-eYYYY.adobeaemcloud.com`. */
    constructor(authorUrl: string) {
        let parsed: URL;
        try {
            parsed = new URL(authorUrl);
        } catch {
            throw new Error(`Invalid AEM author URL: "${authorUrl}" is not a valid URL`);
        }
        if (parsed.protocol !== 'https:') {
            throw new Error(`Invalid AEM author URL: must use https (got "${parsed.protocol}")`);
        }
        // Normalize away a trailing slash so joins with the content path are clean.
        this.authorOrigin = authorUrl.replace(/\/+$/, '');
    }

    buildRegistrationSource(coords: ContentSourceCoords): { url: string; type: string } {
        const { contentPath } = coords;
        if (!contentPath) {
            throw new Error('AEM content source requires a content path (the authored tree root, e.g. /content/<site>)');
        }
        assertSafeContentPath(contentPath);

        const path = contentPath.startsWith('/') ? contentPath : `/${contentPath}`;
        return { url: `${this.authorOrigin}${path}`, type: 'markup' };
    }

    async getContentSourceAuthorization(): Promise<string | null> {
        // AEM authorizes the content read server-side — no token is sent.
        return null;
    }
}
