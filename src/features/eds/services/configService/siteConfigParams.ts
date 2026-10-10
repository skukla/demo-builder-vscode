/**
 * What a site registration with the AEM Configuration Service SAYS.
 *
 * Two decisions live here, and neither touches HTTP: which lookup key the site
 * is registered under (the GitHub owner/repo, never the DA.live name), and the
 * shape of the body Helix reads (code source, content source, optional BYOM
 * overlay). The REST client in `configurationService` sends what this builds.
 *
 * Split out of `configurationService` on 2026-10-08 (EDS-8): the lookup-key rule
 * and the registration schema change for different reasons than the transport.
 *
 * @module features/eds/services/configService/siteConfigParams
 */

/**
 * Parameters for site registration with the Configuration Service
 */
export interface SiteRegistrationParams {
    /** DA.live org name — used as the Configuration Service lookup key (URL path) */
    org: string;
    /** Site name in the Configuration Service */
    site: string;
    /** GitHub repository owner */
    codeOwner: string;
    /** GitHub repository name */
    codeRepo: string;
    /** DA.live content source URL (e.g., https://content.da.live/org/site/) */
    contentSourceUrl: string;
    /** Content source type (default: 'markup') */
    contentSourceType?: string;
    /** Optional BYOM content overlay URL. When set, the registration body
     *  includes a `content.overlay` block alongside `content.source`. */
    contentOverlayUrl?: string;
}

/**
 * Build the DA.live content source URL for a given org and site.
 *
 * Module-private since 2026-10-08: it was exported for a Code Sync setup deep
 * link, and that link was removed (`cf64514fe`), leaving no other caller.
 */
function buildContentSourceUrl(daLiveOrg: string, daLiveSite: string): string {
    return `https://content.da.live/${daLiveOrg}/${daLiveSite}/`;
}

/** Build site config params from repo and DA.live identifiers */
export function buildSiteConfigParams(
    repoOwner: string,
    repoName: string,
    daLiveOrg: string,
    overlayUrl?: string,
): SiteRegistrationParams {
    // The Config Service lookup key must use the GitHub owner/repo, not the
    // DA.live org/site. Helix's preview/publish/live operations issue requests
    // to /preview/{owner}/{repo}/main/... and look up the site config at
    // /config/{owner}/sites/{repo}.json. Registering under the DA.live name
    // leaves the config invisible to those operations — every preview/publish
    // silently fails because Helix has no content source mapping for the
    // lookup key it actually checks.
    //
    // The DA site name and repo name are ONE identifier: creation locks them
    // together and every register path migrates a legacy mismatch first
    // (reset's step 0; repair since 2026-08-23), so this takes no separate
    // daLiveSite. The former `legacyLookupKey` orphan-cleanup hint retired
    // with that guarantee — `storefrontNameMigration` is the surviving legacy
    // path, and its DELETE+PUT re-registration shakes off the stale primary
    // stamp without needing the orphan deleted.
    return {
        org: repoOwner,
        site: repoName,
        codeOwner: repoOwner,
        codeRepo: repoName,
        contentSourceUrl: buildContentSourceUrl(daLiveOrg, repoName),
        ...(overlayUrl && { contentOverlayUrl: overlayUrl }),
    };
}

/**
 * The JSON body `PUT /config/{org}/sites/{site}.json` sends: code source,
 * content source, and the BYOM overlay when one is configured.
 */
export function buildRegistrationBody(params: SiteRegistrationParams): Record<string, unknown> {
    const { codeOwner, codeRepo, contentSourceUrl, contentSourceType, contentOverlayUrl } =
        params;
    const source = { url: contentSourceUrl, type: contentSourceType || 'markup' };
    return {
        version: 1,
        code: { owner: codeOwner, repo: codeRepo },
        content: contentOverlayUrl
            ? // `suffix` is part of the overlay schema, not a workaround.
              // The Admin API defines `content.overlay` as a Markup Content
              // Source — `type` (required), `url` (required), `suffix`
              // (optional string):
              //   https://www.aem.live/docs/admin.html#schema/ContentConfig
              // It is the field that makes Helix's admin service append the
              // suffix before fetching from the overlay URL. We need it
              // because our PDP paths are extensionless
              // (`/products/{urlKey}/{sku}`) while the overlay serves `.html`.
              //
              // Corroborated empirically (citisignal-b2b 2026-06-10): without
              // it, Helix's live tier 404s any unmatched `/products/*` path
              // even though the overlay action returns 200 when called
              // directly. That observation used to be the ONLY justification
              // here, which read as a guess worth tidying away; the schema is
              // now the reason and the observation merely agrees with it.
              //
              // NOTE: an overlay is tied to the BASE CONTENT, not the site
              // config — two sites sharing a content source cannot have
              // different overlays. See docs/architecture/eds-byom-pdp-routing.md.
              // See also: .rptc/research/eds-pdp-routing-validation/findings.md
              { source, overlay: { url: contentOverlayUrl, type: 'markup', suffix: '.html' } }
            : { source },
    };
}
