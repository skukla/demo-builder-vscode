/**
 * ProjectConfigWriter
 *
 * Writes project configuration files to disk including the .demo-builder.json manifest
 * and .env file.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { writeFileAtomic } from '@/core/utils/writeFileAtomic';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';
import { getComponentIds } from '@/types/typeGuards';

/**
 * Copy the project's OPTIONAL fields onto the manifest, omitting each when it
 * has nothing to say.
 *
 * A key present-but-empty is not the same as absent: the loader's legacy
 * migrations key off absence, and an empty map would defeat them. Extracted
 * from `writeManifest` because this list only grows, and every addition was
 * charging one more branch to a function already near the complexity limit.
 */
function addOptionalManifestFields(manifest: Record<string, unknown>, project: Project): void {
    if (project.datapack !== undefined) {
        manifest.datapack = project.datapack;
    }
    if (project.selectedPackage !== undefined) {
        manifest.selectedPackage = project.selectedPackage;
    }
    if (project.selectedStack !== undefined) {
        manifest.selectedStack = project.selectedStack;
    }
    if (project.selectedAddons?.length) {
        manifest.selectedAddons = project.selectedAddons;
    }
    if (project.selectedBlockLibraries?.length) {
        manifest.selectedBlockLibraries = project.selectedBlockLibraries;
    }
    if (project.customBlockLibraries?.length) {
        manifest.customBlockLibraries = project.customBlockLibraries;
    }
    if (project.aiPrompts?.length) {
        manifest.aiPrompts = project.aiPrompts;
    }
    // The discovered Commerce store hierarchy — what turns a store CODE back into
    // the NAME the user picked it by, on any surface, offline. Deliberately NOT
    // inside componentConfigs: it is a catalog, not a deployable value, and
    // nothing that walks componentConfigs into a `.env` may ever see it.
    if (project.commerceStoreStructure) {
        manifest.commerceStoreStructure = project.commerceStoreStructure;
    }
    // Ad-hoc Console API picks beyond requiredApis (§E) — NOT derivable, and the
    // dashboard's full-union subscription PUT reads it: without persistence a
    // post-reload redeploy silently drops the user's picks.
    // The flat additionalConsoleApis is no longer persisted (attribution
    // step 07, retired 2026-08-23): componentApiPicks is the one written form.
    // The read side keeps migrating legacy manifests forever (migrateApiPicks);
    // builds ≤ beta.126 (pre-keyed-reader) can no longer round-trip manifests
    // written from here on — twelve releases of propagation stood between.
    // The ATTRIBUTED form of the picks (per-integration API attribution,
    // step 01). Omitted when empty so legacy manifests keep loading through the
    // read-side migration rather than a persisted empty map.
    if (project.componentApiPicks && Object.keys(project.componentApiPicks).length > 0) {
        manifest.componentApiPicks = project.componentApiPicks;
    }
    // Keyed App Builder component state (ADR-011 D3 Step 01) — the durable model
    // that replaces the singular meshState/appState (retired in Step 07). Omitted
    // when empty so legacy manifests keep loading via the read-side migration
    // fallback instead of a persisted-but-empty map.
    if (project.appBuilderComponents && Object.keys(project.appBuilderComponents).length) {
        manifest.appBuilderComponents = project.appBuilderComponents;
    }
    // ADR-013 hash-and-skip: per-file sha-256 of the last generated AI bundle,
    // keyed by posix project-relative path. Omitted when empty so pre-ADR
    // manifests stay byte-stable until the first hashed generation runs.
    if (project.aiFileHashes && Object.keys(project.aiFileHashes).length > 0) {
        manifest.aiFileHashes = project.aiFileHashes;
    }
    // Written by the publish-key renewal sweep only. Omitted when absent so an
    // un-swept project stays "never stamped" and renews on the next activation
    // rather than reading as freshly registered.
    if (project.publishKeyRegisteredAt) {
        manifest.publishKeyRegisteredAt = project.publishKeyRegisteredAt;
    }
    if (project.pinned) {
        manifest.pinned = true;
    }
}

/**
 * Manifest FORMAT version, stamped by every save.
 *
 * Not the never-bumped `version: '1.0.0'` display field below — this one is
 * the migration gate. A manifest without it (or with a lower number) predates
 * the write-back migration sweep and may still carry legacy shapes
 * (`meshState`/`appState`, flat `additionalConsoleApis`, redundant
 * `daLiveSite` metadata); the loader converts those on read, and the
 * activation sweep (`manifestFormatSweep`) load+saves any unstamped manifest
 * so the file on disk is forward-format. Bump this ONLY when a new load-time
 * conversion is added whose write-back the sweep must force.
 *
 * 2 = first stamped version (2026-08-24): keyed appBuilderComponents,
 * attributed componentApiPicks, no redundant daLiveSite.
 */
export const MANIFEST_FORMAT_VERSION = 2;

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
            this.logger.error(
                'Failed to create project directory',
                error instanceof Error ? error : undefined,
            );
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

        try {
            // Build the manifest from project object - no merging needed
            // The manifest is the single source of truth
            const manifest: Record<string, unknown> = {
                name: project.name,
                // Only when set. Writing `title: undefined` would add a null key
                // to every legacy manifest on first save for no gain.
                ...(project.title ? { title: project.title } : {}),
                version: '1.0.0',
                formatVersion: MANIFEST_FORMAT_VERSION,
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
                aiContextVersion: project.aiContextVersion,
                // The singular meshState/appState are NOT serialized (ADR-011 D3
                // Step 07): the keyed `appBuilderComponents` map below is the single
                // persisted authority for mesh + integration deploy state. Legacy
                // manifests carrying the singulars keep LOADING forever (the
                // loader's migration fallback); their first save forward-migrates
                // them to the keyed map. Status *summaries* (mesh/app) stay
                // omitted — they are recomputed on load, not persisted.
                edsStorefrontState: project.edsStorefrontState,
                edsStorefrontStatusSummary: project.edsStorefrontStatusSummary,
                components: getComponentIds(project.componentInstances),
            };

            addOptionalManifestFields(manifest, project);

            // Atomic write (temp file + rename) via the shared helper.
            await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2));
        } catch (error) {
            this.logger.error(
                'Failed to update project manifest',
                error instanceof Error ? error : undefined,
            );
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
            "# Note: Component-specific environment variables are stored in each component's .env file",
        ].join('\n');

        try {
            await fs.writeFile(envPath, envContent);
        } catch (error) {
            this.logger.error(
                'Failed to create .env file',
                error instanceof Error ? error : undefined,
            );
            throw error;
        }
    }
}
