/**
 * Template Update Checker
 *
 * Checks for updates to EDS storefront templates by comparing the project's
 * lastSyncedCommit with the upstream template's latest commit.
 *
 * Unlike components (which use GitHub Releases with semantic versioning),
 * templates use commit-based comparison since they don't have versioned releases.
 */

import * as vscode from 'vscode';
import {
    compareCommits,
    getLatestBranchCommit,
} from './githubApiClient';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

/**
 * Result of checking for template updates
 */
export interface TemplateUpdateResult {
    /** Whether updates are available */
    hasUpdates: boolean;
    /** Project's last synced commit SHA */
    currentCommit: string;
    /** Template's latest commit SHA */
    latestCommit: string;
    /** Number of commits the project is behind */
    commitsBehind: number;
    /** Template owner (GitHub username or org) */
    templateOwner: string;
    /** Template repository name */
    templateRepo: string;
}

/**
 * Template Update Checker Service
 *
 * Detects available updates for EDS storefronts by comparing commits
 * between the project's lastSyncedCommit and the upstream template.
 */
export class TemplateUpdateChecker {
    private logger: Logger;
    private secrets: vscode.SecretStorage;

    constructor(secrets: vscode.SecretStorage, logger: Logger) {
        this.secrets = secrets;
        this.logger = logger;
    }

    /**
     * Check if an EDS project has upstream template updates available
     *
     * @param project - Project to check for updates
     * @returns Template update result, or null if not an EDS project or missing template info
     */
    async checkForUpdates(project: Project): Promise<TemplateUpdateResult | null> {
        // Extract EDS metadata from component instance
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (!edsInstance?.metadata) {
            this.logger.debug(`[TemplateUpdates] No EDS instance in project ${project.name}`);
            return null;
        }

        const metadata = edsInstance.metadata as Record<string, unknown>;
        const templateOwner = metadata.templateOwner as string | undefined;
        const templateRepo = metadata.templateRepo as string | undefined;
        const lastSyncedCommit = metadata.lastSyncedCommit as string | undefined;

        // Validate required template metadata
        if (!templateOwner || !templateRepo) {
            this.logger.debug(`[TemplateUpdates] Missing template info for ${project.name}`);
            return null;
        }

        if (!lastSyncedCommit) {
            this.logger.debug(`[TemplateUpdates] No lastSyncedCommit for ${project.name} - cannot check for updates`);
            return null;
        }

        try {
            // Fetch template's latest commit SHA
            const latestCommit = await getLatestBranchCommit(
                this.secrets, templateOwner, templateRepo, 'main',
            );
            if (!latestCommit) {
                this.logger.warn(`[TemplateUpdates] Could not fetch latest commit for ${templateOwner}/${templateRepo}`);
                return null;
            }

            // If commits match, no updates available
            if (latestCommit === lastSyncedCommit) {
                return {
                    hasUpdates: false,
                    currentCommit: lastSyncedCommit,
                    latestCommit,
                    commitsBehind: 0,
                    templateOwner,
                    templateRepo,
                };
            }

            // Compare commits to get the number of commits behind
            const comparison = await compareCommits(
                this.secrets, templateOwner, templateRepo,
                lastSyncedCommit, latestCommit,
            );

            const commitsBehind = comparison?.ahead_by ?? 0;

            return {
                hasUpdates: commitsBehind > 0,
                currentCommit: lastSyncedCommit,
                latestCommit,
                commitsBehind,
                templateOwner,
                templateRepo,
            };
        } catch (error) {
            this.logger.error(`[TemplateUpdates] Failed to check updates for ${project.name}`, error as Error);
            return null;
        }
    }

}
