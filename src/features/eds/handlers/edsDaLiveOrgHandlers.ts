/**
 * EDS DA.live Organization Handlers
 *
 * Message handlers for DA.live organization and site operations.
 *
 * Handlers:
 * - `handleVerifyDaLiveOrg`: Check user access to DA.live organization
 * - `handleGetDaLiveSites`: List sites in a DA.live organization
 *
 * @module features/eds/handlers/edsDaLiveOrgHandlers
 */

import type { HandlerContext, HandlerResponse } from '@/types/handlers';

// ==========================================================
// Payload Types
// ==========================================================

/**
 * Payload for handleGetDaLiveSites
 */
interface GetDaLiveSitesPayload {
    orgName: string;
}

/**
 * Payload for handleVerifyDaLiveOrg
 */
interface VerifyDaLiveOrgPayload {
    orgName: string;
}

// ==========================================================
// Handlers
// ==========================================================

/**
 * Verify DA.live organization access
 *
 * Checks if user has access to the specified DA.live organization.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains org name to verify
 * @returns Success with verification status
 */
export async function handleVerifyDaLiveOrg(
    context: HandlerContext,
    payload?: VerifyDaLiveOrgPayload,
): Promise<HandlerResponse> {
    const { orgName } = payload || {};

    if (!orgName) {
        context.logger.error('[EDS] handleVerifyDaLiveOrg missing orgName');
        await context.sendMessage('dalive-org-verified', {
            verified: false,
            orgName: '',
            error: 'Organization name required',
        });
        return { success: false, error: 'Organization name required' };
    }

    try {
        context.logger.debug('[EDS] Verifying DA.live org access:', orgName);

        // Get stored DA.live token (from bookmarklet flow)
        const token = context.context.globalState.get<string>('daLive.accessToken');
        if (!token) {
            context.logger.error('[EDS] No DA.live token stored');
            await context.sendMessage('dalive-org-verified', {
                verified: false,
                orgName,
                error: 'Not authenticated with DA.live. Please sign in first.',
            });
            return { success: false, error: 'Not authenticated' };
        }

        // Verify org access using stored token
        const response = await fetch(`https://admin.da.live/list/${orgName}/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        context.logger.debug('[EDS] DA.live org verification response:', response.status);

        if (response.status === 403) {
            await context.sendMessage('dalive-org-verified', {
                verified: false,
                orgName,
                error: 'Access denied. You may not have permission to access this organization.',
            });
            return { success: true };
        }

        if (response.status === 404) {
            await context.sendMessage('dalive-org-verified', {
                verified: false,
                orgName,
                error: 'Organization not found.',
            });
            return { success: true };
        }

        if (!response.ok) {
            await context.sendMessage('dalive-org-verified', {
                verified: false,
                orgName,
                error: `Verification failed: ${response.status}`,
            });
            return { success: true };
        }

        // Success - org is accessible
        await context.sendMessage('dalive-org-verified', {
            verified: true,
            orgName,
        });

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] Error verifying DA.live org:', error as Error);
        await context.sendMessage('dalive-org-verified', {
            verified: false,
            orgName,
            error: (error as Error).message,
        });
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Get list of DA.live sites in an organization
 *
 * Returns sites (top-level folders) in the specified organization,
 * sorted alphabetically by name.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains org name to list sites for
 * @returns Success with site list
 */
export async function handleGetDaLiveSites(
    context: HandlerContext,
    payload?: GetDaLiveSitesPayload,
): Promise<HandlerResponse> {
    const { orgName } = payload || {};

    if (!orgName) {
        context.logger.error('[EDS] handleGetDaLiveSites missing orgName');
        await context.sendMessage('get-dalive-sites-error', {
            error: 'Organization name required',
        });
        return { success: false, error: 'Organization name required' };
    }

    try {
        context.logger.debug('[EDS] Fetching DA.live sites for org:', orgName);

        // Get stored DA.live token (from bookmarklet flow)
        const token = context.context.globalState.get<string>('daLive.accessToken');
        context.logger.debug(`[EDS:DaLive] Token present: ${!!token}, length: ${token?.length || 0}`);
        if (!token) {
            context.logger.error('[EDS] No DA.live token stored');
            await context.sendMessage('get-dalive-sites-error', {
                error: 'Not authenticated with DA.live. Please sign in first.',
            });
            return { success: false, error: 'Not authenticated' };
        }

        // Fetch sites directly using stored token
        const url = `https://admin.da.live/list/${orgName}/`;
        context.logger.debug(`[EDS:DaLive] Request URL: ${url}`);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        context.logger.debug(`[EDS:DaLive] Response status: ${response.status}, ok: ${response.ok}`);

        if (!response.ok) {
            if (response.status === 403) {
                context.logger.warn('[EDS] No access to DA.live org:', orgName);
                await context.sendMessage('get-dalive-sites', []);
                return { success: true };
            }
            if (response.status === 404) {
                context.logger.warn('[EDS] DA.live org not found:', orgName);
                await context.sendMessage('get-dalive-sites', []);
                return { success: true };
            }
            throw new Error(`Failed to fetch sites: ${response.status}`);
        }

        const entries = await response.json();

        // Log raw response for debugging
        context.logger.debug(`[EDS:DaLive] Raw entries count: ${entries.length}`);
        if (entries.length > 0) {
            // Log first 3 entries as sample
            const sample = entries.slice(0, 3).map((e: { name: string; ext?: string }) =>
                `${e.name}${e.ext ? ` (file: .${e.ext})` : ' (folder)'}`
            );
            context.logger.debug(`[EDS:DaLive] Raw entries sample: ${JSON.stringify(sample)}`);
        }

        // Sites are top-level folders in DA.live
        // The API returns objects with 'name' and possibly other fields
        const siteItems = entries
            .filter((entry: { name: string; ext?: string }) => {
                // Filter out files (entries with extensions) - sites are folders (no ext)
                const isFolder = !entry.ext;
                if (!isFolder) {
                    context.logger.debug(`[EDS] Skipping file: ${entry.name}`);
                }
                return isFolder;
            })
            .map((entry: { name: string; lastModified?: string }) => ({
                id: entry.name,
                name: entry.name,
                lastModified: entry.lastModified,
            }))
            .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

        context.logger.debug(`[EDS:DaLive] Filter: ${entries.length} raw -> ${siteItems.length} sites (${entries.length - siteItems.length} filtered out)`);
        await context.sendMessage('get-dalive-sites', siteItems);

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Error fetching DA.live sites:', error as Error);
        await context.sendMessage('get-dalive-sites-error', {
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}
