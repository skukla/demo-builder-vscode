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
 * What a registration says (lookup key, body schema) lives in `siteConfigParams`;
 * how one request is authenticated and how Adobe's refusals are worded lives in
 * `configServiceRequest`. This file is the site-config operations themselves.
 *
 * Note: folder mapping (`POST /folders.json`) is deprecated by Adobe
 * (see aem.live/developer/byom) and removed from this client in audit A2
 * (2026-05-18). CitiSignal storefronts route /products/{sku} via client-side
 * routing; future SEO-sensitive PDPs should use the BYOM overlay pattern.
 *
 * @module features/eds/services/configService/configurationService
 */

import type { TokenProvider } from '../daLive/daLiveApiClient';
import { HELIX_ADMIN_URL } from '../helix/helixApiClient';
import { getImsToken, requestConfigService, type ConfigServiceResult } from './configServiceRequest';
import { buildRegistrationBody, type SiteRegistrationParams } from './siteConfigParams';
import { captureSiteGrants, restoreCapturedGrants } from './siteGrantPreservation';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * The site-config object's address, `/config/{org}/sites/{site}.json`. Register, delete and
 * the overlay read-back all address the same object; this file is the pinned owner of that
 * path (spine-chokepoints, "config-service PATHS"), so the builder lives here, once.
 */
function siteConfigUrl(org: string, site: string): string {
    return `${HELIX_ADMIN_URL}/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}.json`;
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
        const { org, site, codeOwner, codeRepo, contentSourceUrl, contentOverlayUrl } = params;
        const url = siteConfigUrl(org, site);

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

        return requestConfigService(
            this.tokenProvider,
            this.logger,
            'PUT',
            url,
            buildRegistrationBody(params),
        );
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
        const { org, site } = params;
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
        const url = siteConfigUrl(org, site);

        this.logger.info(`[ConfigService] Deleting site config: ${org}/${site}`);

        return requestConfigService(this.tokenProvider, this.logger, 'DELETE', url);
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
        const url = siteConfigUrl(org, site);
        try {
            const token = await getImsToken(this.tokenProvider);
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
}
