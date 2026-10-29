/**
 * DaLiveContentOperations — composition root for the DA.live service cluster.
 *
 * Constructs and wires the DA.live content services and hands them back as
 * public fields. The dependency graph it owns:
 *   apiClient → sourceOps → { configOps, discoveryOps → copyOps } → blockLibOps
 * so a caller gets the whole wired stack from `new DaLiveContentOperations(tp, logger)`
 * and calls the service that owns the job: source CRUD (`sourceOps`), config
 * writes (`configOps`), content-path discovery (`discoveryOps`), content
 * copy/overlay (`copyOps`), block-library management (`blockLibOps`).
 *
 * It used to forward every operation through a method of its own; those
 * forwarders were retired 2026-10-08 (EDS-8), and the TokenProvider adapters
 * moved to `daLiveTokenProviders.ts`. Two forwarders stay, on purpose:
 * `copyDaLiveSite` and `deleteSiteRoot` together satisfy `MigrationContentOps`
 * (storefrontNameMigration), an interface that spans two services; retiring
 * them means splitting that interface, which is a decision for its callers.
 *
 * IMPORTANT — vscode-free invariant: this module MUST NOT import `vscode`.
 * The standalone MCP server (`src/mcp-server.ts`) constructs DaLiveContentOperations
 * at process start. The MCP server runs in a separate Node process WITHOUT the
 * vscode API; pulling `vscode` here (directly or transitively) would crash the
 * server on startup. Mirrors the same constraint already enforced on
 * `storefrontSyncService.ts` and `helixApiClient.ts`.
 */

import { DaLiveApiClient, type TokenProvider } from './daLiveApiClient';
import { DaLiveBlockLibraryOperations } from './daLiveBlockLibraryOperations';
import { DaLiveConfigOperations } from './daLiveConfigOperations';
import { DaLiveContentCopy } from './daLiveContentCopy';
import { DaLiveContentDiscovery } from './daLiveContentDiscovery';
import { DaLiveSourceOperations } from './daLiveSourceOperations';
import type { Logger } from '@/types/logger';

/**
 * DA.live Content Operations — the wired services.
 */
export class DaLiveContentOperations {
    readonly sourceOps: DaLiveSourceOperations;
    readonly configOps: DaLiveConfigOperations;
    readonly discoveryOps: DaLiveContentDiscovery;
    readonly copyOps: DaLiveContentCopy;
    readonly blockLibOps: DaLiveBlockLibraryOperations;

    constructor(tokenProvider: TokenProvider, logger: Logger) {
        const apiClient = new DaLiveApiClient(tokenProvider, logger);
        this.sourceOps = new DaLiveSourceOperations(apiClient, logger);
        this.configOps = new DaLiveConfigOperations(apiClient, logger);
        this.discoveryOps = new DaLiveContentDiscovery(this.sourceOps);
        this.copyOps = new DaLiveContentCopy(
            apiClient,
            this.sourceOps,
            this.discoveryOps,
            logger,
        );
        this.blockLibOps = new DaLiveBlockLibraryOperations(
            apiClient,
            this.sourceOps,
            this.configOps,
            this.copyOps,
            logger,
        );
    }

    /**
     * Copy an entire DA.live site tree to a new site name in one operation.
     *
     * Uses DA's `POST /copy/{org}/{site}` endpoint with `destination=/{org}/{destSite}/`
     * — a single request that recursively duplicates the source tree under
     * the destination path. The destination namespace is auto-created.
     *
     * Used by the storefront name-migration path on reset to move content
     * from a legacy `<repo>-content` site to the matching `<repo>` site
     * before re-registering Helix against the new DA URL. The source is
     * NOT modified; the caller deletes it after verifying the new site.
     *
     * @param srcOrg - source DA.live org
     * @param srcSite - source DA.live site
     * @param destOrg - destination DA.live org (typically same as srcOrg)
     * @param destSite - destination DA.live site
     * @returns success or failure with status detail
     */
    async copyDaLiveSite(
        srcOrg: string,
        srcSite: string,
        destOrg: string,
        destSite: string,
    ): Promise<{ success: true } | { success: false; error: string; status?: number }> {
        return this.copyOps.copyDaLiveSite(srcOrg, srcSite, destOrg, destSite);
    }

    /**
     * Delete the site root entry so the site disappears from org listing.
     *
     * Sends `DELETE /source/{org}/{site}/` to remove the root directory marker.
     * Best-effort: 404 means it was already gone; other errors are logged but
     * don't fail the overall operation.
     */
    async deleteSiteRoot(org: string, site: string): Promise<void> {
        return this.sourceOps.deleteSiteRoot(org, site);
    }
}
