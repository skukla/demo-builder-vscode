/**
 * EDS DA.live Organization Config Handlers
 *
 * Message handlers for DA.live organization-level configuration.
 * These settings apply to all EDS projects within an organization.
 *
 * Handlers:
 * - `handleGetDaLiveOrgConfig`: Get org config from storage
 * - `handleSaveDaLiveOrgConfig`: Save org config to storage
 *
 * @module features/eds/handlers/edsDaLiveOrgConfigHandlers
 */

import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { DaLiveOrgConfigService, DaLiveOrgConfig } from '../services/daLiveOrgConfigService';

// ==========================================================
// Payload Types
// ==========================================================

/**
 * Payload for handleGetDaLiveOrgConfig
 */
interface GetDaLiveOrgConfigPayload {
    /** Organization name to get config for */
    orgName: string;
}

/**
 * Payload for handleSaveDaLiveOrgConfig
 */
interface SaveDaLiveOrgConfigPayload {
    /** Organization name to save config for */
    orgName: string;
    /** Configuration to save */
    config: {
        /** AEM Assets Delivery repository ID */
        aemRepositoryId?: string;
        /** IMS Organization ID for Universal Editor */
        imsOrgId?: string;
    };
}

// ==========================================================
// Helper
// ==========================================================

/**
 * Get or create DaLiveOrgConfigService instance
 */
function getOrgConfigService(context: HandlerContext): DaLiveOrgConfigService {
    return new DaLiveOrgConfigService(context.context);
}

// ==========================================================
// Handlers
// ==========================================================

/**
 * Get DA.live organization configuration
 *
 * Retrieves stored org-level configuration (aemRepositoryId, imsOrgId).
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains the organization name
 * @returns Success with org config data
 */
export async function handleGetDaLiveOrgConfig(
    context: HandlerContext,
    payload?: GetDaLiveOrgConfigPayload,
): Promise<HandlerResponse> {
    const { orgName } = payload || {};

    if (!orgName) {
        context.logger.error('[EDS] handleGetDaLiveOrgConfig missing orgName');
        await context.sendMessage('dalive-org-config', {
            success: false,
            error: 'Organization name is required',
        });
        return { success: false, error: 'Organization name is required' };
    }

    try {
        context.logger.debug('[EDS] Getting org config for:', orgName);
        const service = getOrgConfigService(context);
        const config = await service.getOrgConfig(orgName);

        await context.sendMessage('dalive-org-config', {
            success: true,
            orgName,
            config: config || {},
        });

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Error getting org config:', error as Error);
        await context.sendMessage('dalive-org-config', {
            success: false,
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * Save DA.live organization configuration
 *
 * Stores org-level configuration (aemRepositoryId, imsOrgId).
 * Also generates and stores editor.path from the IMS org ID.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Contains the org name and config to save
 * @returns Success status
 */
export async function handleSaveDaLiveOrgConfig(
    context: HandlerContext,
    payload?: SaveDaLiveOrgConfigPayload,
): Promise<HandlerResponse> {
    const { orgName, config } = payload || {};

    if (!orgName) {
        context.logger.error('[EDS] handleSaveDaLiveOrgConfig missing orgName');
        await context.sendMessage('dalive-org-config-saved', {
            success: false,
            error: 'Organization name is required',
        });
        return { success: false, error: 'Organization name is required' };
    }

    if (!config) {
        context.logger.error('[EDS] handleSaveDaLiveOrgConfig missing config');
        await context.sendMessage('dalive-org-config-saved', {
            success: false,
            error: 'Configuration is required',
        });
        return { success: false, error: 'Configuration is required' };
    }

    try {
        context.logger.debug('[EDS] Saving org config for:', orgName);
        const service = getOrgConfigService(context);

        // Validate aemRepositoryId format if provided
        if (config.aemRepositoryId && !service.validateAemRepositoryId(config.aemRepositoryId)) {
            await context.sendMessage('dalive-org-config-saved', {
                success: false,
                error: 'Invalid AEM Repository ID format. Expected: author-pXXXXX-eYYYYY.adobeaemcloud.com',
            });
            return { success: false, error: 'Invalid AEM Repository ID format' };
        }

        // Build the config to save
        const orgConfig: DaLiveOrgConfig = {};

        if (config.aemRepositoryId) {
            orgConfig.aemRepositoryId = config.aemRepositoryId;
        }

        // Store IMS org ID - editor.path will be generated per-site during project creation
        // because it requires the specific site name
        if (config.imsOrgId) {
            // Store as a custom field that we'll use during site creation
            // The actual editor.path format is: /{daOrg}/{daSite}=https://experience.adobe.com/#/@{imsOrg}/aem/editor/canvas/main--{daSite}--{daOrg}.ue.da.live
            // We'll generate this during project creation when we know the site name
            (orgConfig as Record<string, unknown>)['imsOrgId'] = config.imsOrgId;
        }

        // Save the config
        await service.updateOrgConfig(orgName, orgConfig);

        context.logger.info('[EDS] Org config saved for:', orgName);
        await context.sendMessage('dalive-org-config-saved', {
            success: true,
            orgName,
        });

        return { success: true };
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error('[EDS] Error saving org config:', error as Error);
        await context.sendMessage('dalive-org-config-saved', {
            success: false,
            error: errorMessage,
        });
        return { success: false, error: errorMessage };
    }
}
