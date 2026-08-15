/**
 * Configuration Service Client
 *
 * Wraps the AEM Configuration Service API (admin.hlx.page/config/) for
 * site registration, update, and deletion. Supports optional BYOM content
 * overlay registration alongside the DA.live content source.
 *
 * The Configuration Service manages server-side site configuration in Helix 5.
 *
 * Authentication: Uses Adobe IMS token via Authorization Bearer header.
 * The IMS token is obtained from the DA.live auth flow (same token used
 * for DA.live content operations). The user must have admin role on the
 * org, which is auto-assigned when they install the AEM Code Sync GitHub App.
 *
 * Note: folder mapping (`POST /folders.json`) is deprecated by Adobe
 * (see aem.live/developer/byom) and removed from this client in audit A2
 * (2026-05-18). CitiSignal storefronts route /products/{sku} via client-side
 * routing; future SEO-sensitive PDPs should use the BYOM overlay pattern.
 *
 * @module features/eds/services/configurationService
 */

import type { TokenProvider } from './daLiveContentOperations';
import { captureSiteGrants, restoreCapturedGrants } from './siteGrantPreservation';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

// ==========================================================
// Constants
// ==========================================================

/** AEM Admin API base URL (same host as preview/publish) */
const ADMIN_API_URL = 'https://admin.hlx.page';

// ==========================================================
// Types
// ==========================================================

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
    /** Optional legacy Configuration Service lookup key (org + site). When
     *  set and different from {org, site}, updateSiteConfig DELETEs that
     *  registration before the normal DELETE+PUT — best-effort, 404 is
     *  treated as success. Cleans up orphan registrations left behind by
     *  pre-`164fd251` builds that keyed site configs by DA.live site name. */
    legacyLookupKey?: { org: string; site: string };
}

/**
 * Strip query string and fragment from a URL before logging.
 *
 * The BYOM overlay URL is user-supplied via the `demoBuilder.byom.overlayUrl`
 * setting; pasted values may include a secret in the query string (e.g., a
 * tokenized URL). Logging the bare scheme + host + path keeps debug output
 * useful for ops without echoing potential secrets to the Debug channel.
 */
function stripUrlQueryAndFragment(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
        return '[unparseable URL]';
    }
}

/**
 * Build the DA.live content source URL for a given org and site.
 *
 * Exported because the Code Sync setup deep link needs the same value — the
 * tool's Content step reads it from the query string, and rebuilding the URL
 * at that call site would be a second place for this format to drift.
 */
export function buildContentSourceUrl(daLiveOrg: string, daLiveSite: string): string {
    return `https://content.da.live/${daLiveOrg}/${daLiveSite}/`;
}

/** Build site config params from repo and DA.live identifiers */
export function buildSiteConfigParams(
    repoOwner: string,
    repoName: string,
    daLiveOrg: string,
    daLiveSite: string,
    overlayUrl?: string,
): SiteRegistrationParams {
    // The Config Service lookup key must use the GitHub owner/repo, not the
    // DA.live org/site. Helix's preview/publish/live operations issue requests
    // to /preview/{owner}/{repo}/main/... and look up the site config at
    // /config/{owner}/sites/{repo}.json. Registering under the DA.live name
    // (e.g. /sites/b2b-boilerplate-content.json when the repo is
    // skukla/b2b-boilerplate) leaves the config invisible to those operations
    // — every preview/publish silently fails because Helix has no content
    // source mapping for the lookup key it actually checks.
    //
    // contentSourceUrl still points at DA.live — that's where content lives.
    // The DA.live editor reads its own config from DA.live's service, not
    // from Helix's site config, so this rename does not affect the editor.
    // Storefronts created on builds before commit 164fd251 keyed their
    // site config by the DA.live site name. When the DA.live site name
    // differs from the GitHub repo name (the usual case — wizards default
    // to a `-content` suffix on DA), that prior registration lingers as an
    // orphan and Helix elects it primary for content operations, 403'ing
    // every write against the new registration. updateSiteConfig uses
    // this hint to DELETE the orphan as part of the next reset/create.
    const legacyLookupKey =
        daLiveSite !== repoName ? { org: daLiveOrg, site: daLiveSite } : undefined;
    return {
        org: repoOwner,
        site: repoName,
        codeOwner: repoOwner,
        codeRepo: repoName,
        contentSourceUrl: buildContentSourceUrl(daLiveOrg, daLiveSite),
        ...(overlayUrl && { contentOverlayUrl: overlayUrl }),
        ...(legacyLookupKey && { legacyLookupKey }),
    };
}

/**
 * Result of a Configuration Service operation
 */
export interface ConfigServiceResult {
    success: boolean;
    error?: string;
    /** HTTP status code from the API */
    statusCode?: number;
    /**
     * `false` when the update landed but the site's admin grants could NOT be
     * handed back afterwards.
     *
     * The config write genuinely succeeded, so this is not a failure — but the
     * grants are gone and nothing in the app can restore them, because the access
     * endpoint requires the very role that was lost. Silence is what makes that
     * permanent, so the loss rides out on the success result instead.
     * Absent means nothing needed restoring.
     */
    grantsRestored?: boolean;
    /** Masked addresses whose grants were lost, for the message that reports it. */
    lostGrants?: string[];
}

// ==========================================================
// Service
// ==========================================================

/**
 * Client for the AEM Configuration Service API
 *
 * Manages site configuration through REST calls to admin.hlx.page/config/.
 * Uses Adobe IMS Bearer token authentication (same token as DA.live operations).
 */
export class ConfigurationService {
    private logger: Logger;
    private tokenProvider: TokenProvider;

    constructor(tokenProvider: TokenProvider, logger: Logger) {
        this.tokenProvider = tokenProvider;
        this.logger = logger;
    }

    // ==========================================================
    // Site Registration
    // ==========================================================

    /**
     * Register a site with the Configuration Service.
     *
     * Creates the site config entry at /config/{org}/sites/{site}.json
     * with code source (GitHub repo) and content source (DA.live).
     *
     * This must be called AFTER the AEM Code Sync GitHub App is installed,
     * because the installing user gets auto-assigned the admin role.
     *
     * @param params - Site registration parameters
     * @returns Result with success/error status
     */
    async registerSite(params: SiteRegistrationParams): Promise<ConfigServiceResult> {
        const {
            org,
            site,
            codeOwner,
            codeRepo,
            contentSourceUrl,
            contentSourceType,
            contentOverlayUrl,
        } = params;
        const url = `${ADMIN_API_URL}/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}.json`;

        this.logger.info(`[ConfigService] Registering site: ${org}/${site}`);
        this.logger.debug(
            `[ConfigService] Code: ${codeOwner}/${codeRepo}, Content: ${contentSourceUrl}`,
        );
        if (contentOverlayUrl) {
            // Strip query/fragment from the overlay URL before logging — the
            // overlay URL is user-supplied via VS Code settings and may include
            // a secret in its query string (e.g., a paste with a token).
            this.logger.debug(
                `[ConfigService] Content overlay: ${stripUrlQueryAndFragment(contentOverlayUrl)}`,
            );
        }

        const source = { url: contentSourceUrl, type: contentSourceType || 'markup' };
        const body = {
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

        return this.makeRequest('PUT', url, body);
    }

    // ==========================================================
    // Site Update
    // ==========================================================

    /**
     * Update an existing site's configuration.
     *
     * Deletes the current config and re-registers with the provided values.
     * Handles the case where the config was auto-created by the GitHub App
     * with stale content source (e.g., from the template's fstab.yaml).
     *
     * @param params - Site registration parameters with correct values
     * @returns Result with success/error status
     */
    async updateSiteConfig(params: SiteRegistrationParams): Promise<ConfigServiceResult> {
        const { org, site, legacyLookupKey } = params;
        this.logger.info(`[ConfigService] Updating site config: ${org}/${site}`);

        // Capture the access doc BEFORE the delete below destroys it.
        //
        // The delete below destroys the site's `access` sub-resource, so the
        // grants must be read first — and a failed read is indistinguishable from
        // "no grants", which is why this refuses rather than proceeding blind.
        const captured = await captureSiteGrants(this.tokenProvider, org, site, this.logger);
        if (!captured.ok) {
            return { success: false, statusCode: captured.statusCode, error: captured.error };
        }

        await this.cleanUpLegacyRegistration(legacyLookupKey, { org, site });

        const deleteResult = await this.deleteSiteConfig(org, site);
        if (!deleteResult.success && deleteResult.statusCode !== 404) {
            this.logger.error(
                `[ConfigService] Failed to clear existing config: ${deleteResult.error}`,
            );
            return {
                success: false,
                // Carry the DELETE's status: a 403 here is the same admin-role
                // refusal as on the PUT, and message selection + the propagation
                // retry both key off statusCode.
                statusCode: deleteResult.statusCode,
                error: `Failed to clear existing config: ${deleteResult.error}`,
            };
        }
        if (deleteResult.statusCode === 404) {
            this.logger.warn(
                `[ConfigService] Site config already absent during update (404) — re-registering`,
            );
        }

        const registered = await this.registerSite(params);

        // Hand the grants back — including when the re-register failed, since the
        // delete already happened either way.
        const restore = await restoreCapturedGrants(
            this.tokenProvider,
            org,
            site,
            captured.roles,
            this.logger,
        );
        return { ...registered, ...restore };
    }

    /**
     * Best-effort cleanup of a legacy site registration left behind by
     * pre-`164fd251` builds, where site configs were keyed by DA.live site
     * name instead of GitHub repo name. Skips when no legacy key is set,
     * or when the legacy key matches the current key (would be redundant).
     * Treats 404 and non-404 errors as success — the legacy DELETE must
     * never block the normal update flow.
     */
    private async cleanUpLegacyRegistration(
        legacy: { org: string; site: string } | undefined,
        current: { org: string; site: string },
    ): Promise<void> {
        if (!legacy) return;
        if (legacy.org === current.org && legacy.site === current.site) return;

        this.logger.info(
            `[ConfigService] Cleaning up legacy site registration: ${legacy.org}/${legacy.site}`,
        );
        const result = await this.deleteSiteConfig(legacy.org, legacy.site);
        if (result.statusCode === 404) {
            this.logger.debug('[ConfigService] No legacy registration to clean up (404)');
        } else if (!result.success) {
            this.logger.warn(
                `[ConfigService] Legacy registration cleanup failed (${result.statusCode ?? 'unknown'}) — continuing anyway: ${result.error ?? ''}`,
            );
        }
    }

    // ==========================================================
    // Site Deletion
    // ==========================================================

    /**
     * Delete a site's configuration from the Configuration Service.
     *
     * Removes the entire site config entry. Should be called during
     * project cleanup, before deleting the GitHub repo.
     *
     * @param org - DA.live org name (Configuration Service lookup key)
     * @param site - DA.live site name
     * @returns Result with success/error status
     */
    async deleteSiteConfig(org: string, site: string): Promise<ConfigServiceResult> {
        const url = `${ADMIN_API_URL}/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}.json`;

        this.logger.info(`[ConfigService] Deleting site config: ${org}/${site}`);

        return this.makeRequest('DELETE', url);
    }

    /**
     * Read back the registered content-overlay URL, or `undefined` when the site
     * carries none.
     *
     * Exists because "the write returned 2xx" and "the overlay is live" are not
     * the same claim, and only the second one means product pages will load. The
     * repair path reports them separately for exactly that reason.
     *
     * Distinguishes "no overlay" from "could not tell": a transport failure or a
     * refusal returns `{ readable: false }`, never an absent overlay. Collapsing
     * those would let a network blip report a healthy site as broken — and, worse,
     * a repair as unverified when it had in fact worked.
     */
    async readSiteOverlayUrl(
        org: string,
        site: string,
    ): Promise<{ readable: boolean; overlayUrl?: string }> {
        const url = `${ADMIN_API_URL}/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}.json`;
        try {
            const token = await this.getImsToken();
            const response = await fetch(url, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            if (!response.ok) {
                this.logger.debug(
                    `[ConfigService] Overlay read for ${org}/${site} -> ${response.status}`,
                );
                return { readable: false };
            }
            const body = (await response.json()) as {
                content?: { overlay?: { url?: string } };
            };
            return { readable: true, overlayUrl: body?.content?.overlay?.url };
        } catch (error) {
            this.logger.debug(
                `[ConfigService] Overlay read for ${org}/${site} failed: ${(error as Error).message}`,
            );
            return { readable: false };
        }
    }

    // ==========================================================
    // Private Helpers
    // ==========================================================

    /**
     * Make an authenticated request to the Configuration Service API
     */
    private async makeRequest(
        method: string,
        url: string,
        body?: Record<string, unknown>,
    ): Promise<ConfigServiceResult> {
        try {
            const token = await this.getImsToken();

            const headers: Record<string, string> = {
                Authorization: `Bearer ${token}`,
            };

            const fetchOptions: RequestInit = {
                method,
                headers,
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            };

            if (body) {
                headers['content-type'] = 'application/json';
                fetchOptions.body = JSON.stringify(body);
            }

            const response = await fetch(url, fetchOptions);

            if (response.ok) {
                this.logger.debug(`[ConfigService] ${method} ${url} -> ${response.status} OK`);
                return { success: true, statusCode: response.status };
            }

            // 404 on DELETE means already gone — treat as success
            if (method === 'DELETE' && response.status === 404) {
                this.logger.debug(`[ConfigService] Site config already deleted (404)`);
                return { success: true, statusCode: 404 };
            }

            return await this.handleErrorResponse(method, url, response);
        } catch (error) {
            const message = (error as Error).message;
            this.logger.error(`[ConfigService] Request failed: ${message}`);
            return { success: false, error: message };
        }
    }

    /** Handle a non-OK, non-404-DELETE response from the Configuration Service API. */
    private async handleErrorResponse(
        method: string,
        url: string,
        response: Response,
    ): Promise<ConfigServiceResult> {
        let errorBody = '';
        try {
            errorBody = await response.text();
        } catch {
            // Ignore parse errors
        }

        // Debug: log raw response body for auth failures to diagnose token type issues
        if (response.status === 401 || response.status === 403) {
            const safeBody = errorBody.replace(/[\r\n]/g, ' ').substring(0, 200);
            this.logger.debug(`[ConfigService] Auth failure raw response: ${safeBody}`);
        }

        // Adobe returns an EMPTY body on 401/403 and puts its stated reason in
        // `x-error`; `x-invocation-id` is the handle Adobe support needs to trace
        // the call. Both were discarded, which is why a field 403 was
        // undiagnosable from the logs. Absent headers are omitted rather than
        // padded, so the line carries only what Adobe actually said.
        const xError = response.headers?.get?.('x-error') ?? undefined;
        const invocationId = response.headers?.get?.('x-invocation-id') ?? undefined;
        const detail = [
            xError ? `x-error: ${xError}` : undefined,
            invocationId ? `x-invocation-id: ${invocationId}` : undefined,
        ]
            .filter(Boolean)
            .join(', ');

        const errorMessage = this.formatError(response.status, errorBody);
        // 409 (conflict) is handled by callers (delete + re-create) — log at info, not error
        const logLevel = response.status === 409 ? 'info' : 'error';
        this.logger[logLevel](
            `[ConfigService] ${method} ${url} -> ${response.status}: ${errorMessage}` +
                `${detail ? ` (${detail})` : ''}`,
        );
        return { success: false, error: errorMessage, statusCode: response.status };
    }

    /**
     * Get IMS token for Configuration Service authentication
     */
    private async getImsToken(): Promise<string> {
        const token = await this.tokenProvider.getAccessToken();
        if (!token) {
            throw new Error('DA.live authentication required. Please sign in to DA.live first.');
        }
        return token;
    }

    /**
     * Format error message based on HTTP status
     */
    private formatError(status: number, body: string): string {
        switch (status) {
            case 401:
                return 'Configuration Service auth failed. Your DA.live token may have expired — try re-authenticating with DA.live.';
            case 403:
                // Deliberately does NOT name AEM Code Sync. This 403 has been
                // observed on runs where code sync was verified and publishing
                // in the same session, so pointing at it sends people to
                // reinstall a working app instead of seeking the access they
                // actually lack.
                return 'Not authorized for Configuration Service (403). Your Adobe account lacks admin access to the site configuration for this GitHub namespace — ask an Adobe admin to grant it.';
            case 409:
                return 'Site configuration already exists. It may have been created by another process.';
            default:
                return `Configuration Service error (${status}): ${body || 'Unknown error'}`;
        }
    }
}
