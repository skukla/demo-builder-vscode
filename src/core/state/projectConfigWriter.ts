/**
 * ProjectConfigWriter
 *
 * Writes project configuration files to disk including the .demo-builder.json manifest
 * and .env file.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types';
import { getComponentIds } from '@/types/typeGuards';

/**
 * Get the Catalog Service API key from a project's commerce configuration.
 *
 * SOP Compliance: Reduces optional chaining depth from 3 levels to 1.
 * Pattern: project.commerce?.services.catalog?.apiKey -> getCatalogApiKey(project)
 *
 * @param project - The project to extract the API key from
 * @returns The catalog API key, or empty string if not configured
 */
export function getCatalogApiKey(project: Project): string {
    return project.commerce?.services?.catalog?.apiKey || '';
}

/**
 * Get the Live Search API key from a project's commerce configuration.
 *
 * SOP Compliance: Reduces optional chaining depth from 3 levels to 1.
 * Pattern: project.commerce?.services.liveSearch?.apiKey -> getLiveSearchApiKey(project)
 *
 * @param project - The project to extract the API key from
 * @returns The live search API key, or empty string if not configured
 */
export function getLiveSearchApiKey(project: Project): string {
    return project.commerce?.services?.liveSearch?.apiKey || '';
}

export class ProjectConfigWriter {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Save project configuration to disk
     * @param project - The project to save
     * @param currentProjectPath - Path of the current active project (for stale save detection)
     */
    async saveProjectConfig(project: Project, currentProjectPath?: string): Promise<void> {
        // GUARD: Prevent recreating deleted project directories
        // Background async operations (like mesh status checks) may call saveProject()
        // after a project has been deleted. Without this guard, fs.mkdir() would
        // recreate the deleted directory, causing "ghost" projects to reappear.
        try {
            await fs.access(project.path);
        } catch {
            // Directory doesn't exist - check if this is expected (project was deleted)
            // If current project is undefined or different, this is a stale save - skip it
            if (!currentProjectPath || currentProjectPath !== project.path) {
                this.logger.debug(
                    `[ProjectConfigWriter] Skipping save for deleted project: ${project.name} (path: ${project.path})`,
                );
                return;
            }
            // Directory doesn't exist but this IS the current project - create it
            // This handles the case of a new project being created
        }

        // Ensure directory exists (only for active projects)
        try {
            await fs.mkdir(project.path, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create project directory', error instanceof Error ? error : undefined);
            throw error;
        }

        // Update .demo-builder.json manifest with latest state
        await this.writeManifest(project);

        // Create .env file
        await this.writeEnvFile(project);
    }

    /**
     * Write the .demo-builder.json manifest file using atomic write pattern.
     * Writes to temp file first, then renames (atomic on POSIX filesystems).
     * This prevents JSON corruption from interrupted or concurrent writes.
     */
    private async writeManifest(project: Project): Promise<void> {
        const manifestPath = path.join(project.path, '.demo-builder.json');
        const tempPath = `${manifestPath}.tmp`;

        try {
            const manifest = {
                name: project.name,
                version: '1.0.0',
                // Type-safe Date handling: Handle both Date objects and ISO strings from persistence
                created: (project.created instanceof Date
                    ? project.created
                    : new Date(project.created)
                ).toISOString(),
                lastModified: new Date().toISOString(),
                adobe: project.adobe,
                commerce: project.commerce,
                componentSelections: project.componentSelections,
                componentInstances: project.componentInstances,
                componentConfigs: project.componentConfigs,
                componentVersions: project.componentVersions,
                meshState: project.meshState,
                components: getComponentIds(project.componentInstances),
                selectedPackage: project.selectedPackage,
                selectedStack: project.selectedStack,
                selectedAddons: project.selectedAddons,
            };

            // Atomic write: write to temp file first, then rename
            await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2));
            await fs.rename(tempPath, manifestPath);
        } catch (error) {
            // Clean up temp file on error (ignore cleanup failures)
            try {
                await fs.unlink(tempPath);
            } catch {
                // Temp file may not exist if write failed early - ignore
            }
            this.logger.error('Failed to update project manifest', error instanceof Error ? error : undefined);
            throw error;
        }
    }

    /**
     * Write the .env file with project configuration
     */
    private async writeEnvFile(project: Project): Promise<void> {
        const envPath = path.join(project.path, '.env');

        const envContent = [
            '# Demo Builder Configuration',
            `PROJECT_NAME=${project.name}`,
            '',
            '# Commerce Configuration',
            `COMMERCE_URL=${project.commerce?.instance.url || ''}`,
            `COMMERCE_ENV_ID=${project.commerce?.instance.environmentId || ''}`,
            `COMMERCE_STORE_CODE=${project.commerce?.instance.storeCode || ''}`,
            `COMMERCE_STORE_VIEW=${project.commerce?.instance.storeView || ''}`,
            '',
            '# API Keys',
            `CATALOG_API_KEY=${getCatalogApiKey(project)}`,
            `SEARCH_API_KEY=${getLiveSearchApiKey(project)}`,
            '',
            '# Note: Component-specific environment variables are now stored in each component\'s .env file',
        ].join('\n');

        try {
            await fs.writeFile(envPath, envContent);
        } catch (error) {
            this.logger.error('Failed to create .env file', error instanceof Error ? error : undefined);
            throw error;
        }
    }
}
