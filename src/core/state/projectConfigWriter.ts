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
     *
     * The manifest is the SINGLE SOURCE OF TRUTH for project data.
     * We write exactly what's in the project object - no merging with disk.
     */
    private async writeManifest(project: Project): Promise<void> {
        // GUARD: Validate project.path before proceeding
        if (!project.path || typeof project.path !== 'string' || project.path.trim() === '') {
            throw new Error(`Invalid project path: "${project.path}"`);
        }

        const manifestPath = path.join(project.path, '.demo-builder.json');
        const tempPath = `${manifestPath}.tmp`;

        try {
            // Build the manifest from project object - no merging needed
            // The manifest is the single source of truth
            const manifest: Record<string, unknown> = {
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
                edsStorefrontState: project.edsStorefrontState,
                edsStorefrontStatusSummary: project.edsStorefrontStatusSummary,
                components: getComponentIds(project.componentInstances),
            };

            // Add optional fields if they exist
            if (project.selectedPackage !== undefined) {
                manifest.selectedPackage = project.selectedPackage;
            }
            if (project.selectedStack !== undefined) {
                manifest.selectedStack = project.selectedStack;
            }
            if (project.selectedAddons?.length) {
                manifest.selectedAddons = project.selectedAddons;
            }

            // Atomic write: write to temp file first, then rename
            await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2));

            // Verify temp file exists before rename
            await fs.access(tempPath);

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
            '# Note: Component-specific environment variables are stored in each component\'s .env file',
        ].join('\n');

        try {
            await fs.writeFile(envPath, envContent);
        } catch (error) {
            this.logger.error('Failed to create .env file', error instanceof Error ? error : undefined);
            throw error;
        }
    }
}
