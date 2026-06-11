/**
 * ContentSource seam (Slice 2)
 *
 * A storefront's content can come from different sources — DA.live today, AEM
 * Sites as of Slice 2. The two places that actually couple to "which source"
 * are narrow: the Configuration Service registration `source` block, and the
 * Helix `x-content-source-authorization` header. This interface factors both
 * behind a 2-method seam so the satellite path is content-source-neutral.
 *
 * Deliberately minimal (the registration `source` + the auth header). Content
 * copy/publish/block-library operations are DA.live-specific and stay on
 * `DaLiveContentOperations`, off this interface — for AEM the content is
 * authored in-place and there is nothing to copy.
 *
 * @module features/eds/services/contentSource/contentSource
 */

/**
 * Coordinates a ContentSource needs to build its registration `source` block.
 * DA.live derives its URL from org/site; AEM carries its own author URL +
 * content path as construction config, so it ignores these.
 */
export interface ContentSourceCoords {
    /** Content org/owner (for DA.live, the DA.live org). */
    org: string;
    /** Content site name. */
    site: string;
}

export interface ContentSource {
    /** Discriminator for the registered content source. */
    readonly type: 'da-live' | 'aem-sites';

    /**
     * Build the Configuration Service `content.source` block.
     * DA.live → `{ url: https://content.da.live/{org}/{site}/, type: 'markup' }`.
     */
    buildRegistrationSource(coords: ContentSourceCoords): { url: string; type: string };

    /**
     * The Helix `x-content-source-authorization` header value, or `null` when
     * none is needed (the header is then omitted). DA.live → `Bearer <imsToken>`;
     * AEM → `null` (read is authorized server-side inside AEM).
     */
    getContentSourceAuthorization(): Promise<string | null>;
}
