/**
 * DA.live Organization Configuration Service
 *
 * Stores org-level configuration for DA.live organizations.
 * These settings are applied to each new EDS project during creation.
 *
 * Configuration includes:
 * - editor.path: Universal Editor path mapping for ue.da.live integration
 * - aem.repositoryId: AEM Assets Delivery instance for asset browsing
 *
 * Configuration is stored per-org since different organizations may have
 * different AEM instances and Universal Editor configurations.
 */

import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';

// ==========================================================
// Constants
// ==========================================================

/** Prefix for org config storage keys */
const ORG_CONFIG_PREFIX = 'daLive.orgConfig';

// ==========================================================
// Types
// ==========================================================

/**
 * DA.live organization-level configuration
 *
 * These settings apply to all EDS projects created under this organization.
 */
export interface DaLiveOrgConfig {
    /**
     * Universal Editor path mapping
     *
     * Format: /{org}/{site}=https://experience.adobe.com/#/@{ims-org}/aem/editor/canvas/main--{site}--{org}.ue.da.live
     *
     * Example: /demo-system-stores/testing-citisignal=https://experience.adobe.com/#/@demosystem/aem/editor/canvas/main--testing-citisignal--demo-system-stores.ue.da.live
     */
    editorPath?: string;

    /**
     * AEM Assets Delivery repository ID
     *
     * The AEM Cloud Service environment to use for asset browsing.
     * Format: author-pXXXXX-eYYYYY.adobeaemcloud.com
     *
     * Example: author-p158081-e1683323.adobeaemcloud.com
     */
    aemRepositoryId?: string;

    /** Timestamp when config was last updated */
    updatedAt?: string;
}

/**
 * Result of applying org config to a site
 */
export interface ApplyOrgConfigResult {
    success: boolean;
    applied: string[];  // Keys that were applied
    error?: string;
}

// ==========================================================
// DA.live Organization Config Service
// ==========================================================

export class DaLiveOrgConfigService {
    private logger = getLogger();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Get storage key for an organization's config
     */
    private getStorageKey(org: string): string {
        return `${ORG_CONFIG_PREFIX}.${org}`;
    }

    /**
     * Get organization configuration
     *
     * @param org - DA.live organization name
     * @returns Organization config or null if not set
     */
    async getOrgConfig(org: string): Promise<DaLiveOrgConfig | null> {
        const key = this.getStorageKey(org);
        const config = this.context.globalState.get<DaLiveOrgConfig>(key);

        if (!config) {
            return null;
        }

        return config;
    }

    /**
     * Set organization configuration
     *
     * @param org - DA.live organization name
     * @param config - Configuration to store
     */
    async setOrgConfig(org: string, config: DaLiveOrgConfig): Promise<void> {
        const key = this.getStorageKey(org);

        // Add timestamp
        const configWithTimestamp: DaLiveOrgConfig = {
            ...config,
            updatedAt: new Date().toISOString(),
        };

        await this.context.globalState.update(key, configWithTimestamp);

        this.logger.info(`[DA.live] Organization config saved for ${org}`);
        this.logger.debug(`[DA.live] Config: editorPath=${config.editorPath ? 'set' : 'unset'}, aemRepositoryId=${config.aemRepositoryId ? 'set' : 'unset'}`);
    }

    /**
     * Update specific fields in organization configuration
     *
     * Merges with existing config, preserving unspecified fields.
     *
     * @param org - DA.live organization name
     * @param updates - Partial configuration to merge
     */
    async updateOrgConfig(org: string, updates: Partial<DaLiveOrgConfig>): Promise<void> {
        const existing = await this.getOrgConfig(org);

        const merged: DaLiveOrgConfig = {
            ...existing,
            ...updates,
        };

        await this.setOrgConfig(org, merged);
    }

    /**
     * Clear organization configuration
     *
     * @param org - DA.live organization name
     */
    async clearOrgConfig(org: string): Promise<void> {
        const key = this.getStorageKey(org);
        await this.context.globalState.update(key, undefined);

        this.logger.info(`[DA.live] Organization config cleared for ${org}`);
    }

    /**
     * Check if organization has configuration
     *
     * @param org - DA.live organization name
     * @returns True if config exists with at least one value set
     */
    async hasOrgConfig(org: string): Promise<boolean> {
        const config = await this.getOrgConfig(org);

        if (!config) {
            return false;
        }

        // Check if any meaningful config is set
        return !!(config.editorPath || config.aemRepositoryId);
    }

    /**
     * Generate editor.path value for a site
     *
     * Creates the Universal Editor path mapping based on org/site and IMS org.
     *
     * @param daOrg - DA.live organization name
     * @param daSite - DA.live site name
     * @param imsOrg - Adobe IMS organization ID (e.g., "demosystem")
     * @returns Formatted editor.path value
     */
    generateEditorPath(daOrg: string, daSite: string, imsOrg: string): string {
        // Format: /{daOrg}/{daSite}=https://experience.adobe.com/#/@{imsOrg}/aem/editor/canvas/main--{daSite}--{daOrg}.ue.da.live
        const path = `/${daOrg}/${daSite}`;
        const editorUrl = `https://experience.adobe.com/#/@${imsOrg}/aem/editor/canvas/main--${daSite}--${daOrg}.ue.da.live`;

        return `${path}=${editorUrl}`;
    }

    /**
     * Parse editor.path to extract components
     *
     * @param editorPath - Full editor.path value
     * @returns Parsed components or null if invalid format
     */
    parseEditorPath(editorPath: string): {
        daOrg: string;
        daSite: string;
        imsOrg: string;
        editorUrl: string;
    } | null {
        // Format: /{daOrg}/{daSite}=https://experience.adobe.com/#/@{imsOrg}/aem/editor/...
        const match = editorPath.match(/^\/([^/]+)\/([^=]+)=(.+)$/);

        if (!match) {
            return null;
        }

        const [, daOrg, daSite, editorUrl] = match;

        // Extract IMS org from URL
        const imsMatch = editorUrl.match(/@([^/]+)\/aem/);
        const imsOrg = imsMatch?.[1] || '';

        return {
            daOrg,
            daSite,
            imsOrg,
            editorUrl,
        };
    }

    /**
     * Validate aem.repositoryId format
     *
     * @param repositoryId - Repository ID to validate
     * @returns True if format is valid
     */
    validateAemRepositoryId(repositoryId: string): boolean {
        // Format: author-pXXXXX-eYYYYY.adobeaemcloud.com
        //     or: delivery-pXXXXX-eYYYYY.adobeaemcloud.com
        const pattern = /^(author|delivery)-p\d+-e\d+\.adobeaemcloud\.com$/;
        return pattern.test(repositoryId);
    }

    /**
     * Get all stored org configs (for debugging/admin)
     *
     * @returns Map of org name to config
     */
    async getAllOrgConfigs(): Promise<Map<string, DaLiveOrgConfig>> {
        const result = new Map<string, DaLiveOrgConfig>();

        // VS Code globalState doesn't provide key enumeration,
        // so we track known orgs separately if needed in the future.
        // For now, this is a placeholder for admin/debugging purposes.

        return result;
    }

    /**
     * Reset all org configurations
     *
     * Used by the dev-only ResetAllCommand.
     * Note: This cannot enumerate all keys, so it relies on knowing org names.
     *
     * @param orgs - List of organization names to clear
     */
    async resetAll(orgs: string[]): Promise<void> {
        for (const org of orgs) {
            await this.clearOrgConfig(org);
        }

        this.logger.info(`[DA.live] Reset org configs for ${orgs.length} organizations`);
    }
}
