/**
 * Handler: Cleanup DA.live Sites
 * 
 * Deletes incorrectly created DA.live sites (from the path concatenation bug).
 * Useful for cleaning up sites like "citisignal-eds-paascustomer" which should
 * be folders within "citisignal-eds-paas".
 */

import type { HandlerContext } from '@/types/handlers';
import { DaLiveOrgOperations } from '../services/daLiveOrgOperations';

interface CleanupDaLiveSitesRequest {
    orgName: string;
    sitePrefix: string;
}

interface CleanupDaLiveSitesResponse {
    success: boolean;
    sitesDeleted?: string[];
    sitesFailed?: Array<{ site: string; error: string }>;
    error?: string;
}

/**
 * Cleanup DA.live sites handler
 */
export async function cleanupDaLiveSites(
    request: CleanupDaLiveSitesRequest,
    context: HandlerContext,
): Promise<CleanupDaLiveSitesResponse> {
    const logger = context.logger;

    try {
        const { orgName, sitePrefix } = request;

        logger.info(`[DA.live Cleanup] Scanning org: ${orgName} for sites starting with: ${sitePrefix}`);

        // Get auth service and DA.live operations
        const authService = context.authManager;
        if (!authService) {
            return { success: false, error: 'Authentication service not available' };
        }
        const tokenManager = authService.getTokenManager();
        const daLiveOps = new DaLiveOrgOperations(
            { 
                getAccessToken: async () => {
                    const token = await tokenManager.getAccessToken();
                    return token ?? null; // Convert undefined to null for TokenProvider interface
                },
            },
            logger,
        );

        // List all sites in the org
        const allSites = await daLiveOps.listOrgSites(orgName);
        logger.debug(`[DA.live Cleanup] Found ${allSites.length} total sites`);

        // Filter sites to delete (start with prefix but are NOT exactly the prefix)
        const sitesToDelete = allSites
            .map(site => site.name)
            .filter(site => site.startsWith(sitePrefix) && site !== sitePrefix);

        if (sitesToDelete.length === 0) {
            logger.info('[DA.live Cleanup] No incorrect sites found');
            return {
                success: true,
                sitesDeleted: [],
                sitesFailed: [],
            };
        }

        logger.info(`[DA.live Cleanup] Found ${sitesToDelete.length} incorrect sites to delete`);

        // Delete sites
        const deleted: string[] = [];
        const failed: Array<{ site: string; error: string }> = [];

        for (const site of sitesToDelete) {
            try {
                logger.debug(`[DA.live Cleanup] Deleting site: ${site}`);
                await daLiveOps.deleteSite(orgName, site);
                deleted.push(site);
                logger.info(`[DA.live Cleanup] ✓ Deleted: ${site}`);
            } catch (error) {
                const errorMsg = (error as Error).message;
                failed.push({ site, error: errorMsg });
                logger.error(`[DA.live Cleanup] ✗ Failed to delete ${site}: ${errorMsg}`);
            }
        }

        logger.info(`[DA.live Cleanup] Complete - Deleted: ${deleted.length}, Failed: ${failed.length}`);

        return {
            success: failed.length === 0,
            sitesDeleted: deleted,
            sitesFailed: failed,
        };

    } catch (error) {
        logger.error('[DA.live Cleanup] Error:', error as Error);
        return {
            success: false,
            error: (error as Error).message,
        };
    }
}
