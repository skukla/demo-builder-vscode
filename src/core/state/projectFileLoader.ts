/**
 * ProjectFileLoader
 *
 * Loads project data from the filesystem by reading the .demo-builder.json manifest
 * and discovering components in the components/ directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { migrateLegacyToAppBuilderComponents } from './appBuilderComponentMigration';
import { migrateApiPicks } from './componentApiPicks';
import { reconcileComponentSelections } from './componentSelectionReconcile';
import { validateManifestShape } from './manifestValidation';
import { stripDuplicateBackendOwnedScope } from '@/core/config/backendOwnedScope';
import type { ComponentInstance, Project , AiPrompt } from '@/types/base';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { Logger } from '@/types/logger';
import { getComponentInstancesByType, parseJSON } from '@/types/typeGuards';

/**
 * Backward-compat normalization for demo-package ids that have been renamed.
 *
 * Projects are local `.demo-builder.json` files of arbitrary age, and users can
 * skip extension versions on upgrade — so there is no point at which every
 * on-disk manifest is provably migrated. This map is therefore **permanent**
 * (not a temporary shim): it normalizes a persisted id to its current value at
 * the load boundary, and the current id is rewritten on the next save. Add a
 * line whenever a package id is retired/renamed; never remove lines.
 *
 * - `b2b` → `custom`        : the B2B boilerplate became the unbranded hybrid
 * - `citisignal-b2b` → `citisignal` : merged into the hybrid citisignal package
 */
const RENAMED_PACKAGE_IDS: Readonly<Record<string, string>> = {
    b2b: 'custom',
    'citisignal-b2b': 'citisignal',
};

/** Normalize a persisted (possibly renamed) package id to its current value. */
export function normalizePackageId(id: string | undefined): string | undefined {
    return id ? (RENAMED_PACKAGE_IDS[id] ?? id) : id;
}

/**
 * Legacy singular mesh state, MANIFEST-ONLY since PL-1 phase 2 — the in-memory
 * `Project` no longer carries it. Read solely by the quarantined
 * read-migration (`appBuilderComponentMigration`), which folds it into the
 * keyed map on every load.
 */
export interface LegacyManifestMeshState {
    envVars: Record<string, string>;
    sourceHash: string | null;
    lastDeployed: string; // ISO date string
    endpoint?: string; // mesh GraphQL endpoint URL (legacy manifests only)
    userDeclinedUpdate?: boolean; // User clicked "Later" on redeploy prompt
    declinedAt?: string; // ISO date string when user declined
}

/** Legacy singular app state, MANIFEST-ONLY since PL-1 phase 2 (see above). */
export interface LegacyManifestAppState {
    appId?: string;
    url?: string; // Primary deployed app URL
    status: 'deployed' | 'error' | 'not-deployed';
    deployedUrls?: Record<string, string>; // Per-action/runtime URLs
    lastDeployed?: string; // ISO date string
    sourceHash?: string | null;
}

export interface ProjectManifest {
    name?: string;
    /** Display title. Absent on every project created before it existed. */
    title?: string;
    created?: string;
    lastModified?: string;
    adobe?: Project['adobe'];
    commerce?: Project['commerce'];
    componentInstances?: Project['componentInstances'];
    componentSelections?: Project['componentSelections'];
    componentConfigs?: Project['componentConfigs'];
    commerceStoreStructure?: Project['commerceStoreStructure'];
    componentVersions?: Project['componentVersions'];
    meshState?: LegacyManifestMeshState;
    appState?: LegacyManifestAppState;
    appBuilderComponents?: Project['appBuilderComponents'];
    additionalConsoleApis?: string[];
    componentApiPicks?: Record<string, string[]>;
    edsStorefrontState?: Project['edsStorefrontState'];
    edsStorefrontStatusSummary?: Project['edsStorefrontStatusSummary'];
    selectedPackage?: string;
    datapack?: { name: string; version: string };
    selectedStack?: string;
    selectedAddons?: string[];
    selectedBlockLibraries?: string[];
    customBlockLibraries?: CustomBlockLibrary[];
    aiPrompts?: AiPrompt[];
    aiContextVersion?: number;
    aiFileHashes?: Record<string, string>;
    publishKeyRegisteredAt?: string;
    pinned?: boolean;
}

export class ProjectFileLoader {
    /**
     * Shape issues already warned about, keyed `path|issue`. A project is
     * loaded ~6 times during activation alone, and the warn loop used to
     * re-print every issue on every load — a single drifted field on one
     * manifest produced an 18-line wall (seen live 2026-08-23 with
     * `is_active`), which buries rather than surfaces the defect. One line
     * per (file, issue) per session says the same thing legibly. A FIXED
     * manifest is not re-announced either — the warn is a pointer, not a
     * status feed.
     */
    private readonly warnedShapeIssues = new Set<string>();

    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Load a project from a directory path
     * @param projectPath - Path to the project directory
     * @param terminalProvider - Optional function to get terminals (for testing)
     */
    async loadProject(
        projectPath: string,
        terminalProvider: () => readonly vscode.Terminal[] = () => vscode.window.terminals,
    ): Promise<Project | null> {
        try {
            // Check if path exists
            await fs.access(projectPath);

            // Check for .demo-builder.json manifest
            const manifestPath = path.join(projectPath, '.demo-builder.json');
            await fs.access(manifestPath);

            // Load project manifest
            const manifestData = await fs.readFile(manifestPath, 'utf-8');
            const manifest = parseJSON<ProjectManifest>(manifestData);
            if (!manifest) {
                throw new Error('Failed to parse project manifest');
            }

            // WARN-mode shape check against the schema generated from
            // ProjectManifest — names drift in the Debug Logs instead of
            // letting a wrong-shaped field surface weeks later as a mystery
            // symptom. NEVER blocks the load: a manifest from any extension
            // version loads best-effort exactly as it always has.
            for (const issue of validateManifestShape(manifest)) {
                const key = `${manifestPath}|${issue}`;
                if (this.warnedShapeIssues.has(key)) continue;
                this.warnedShapeIssues.add(key);
                this.logger.warn(`[Project Load] manifest shape: ${issue} (${manifestPath})`);
            }

            // Discover components from disk and merge with manifest
            const { componentInstances, componentVersions } = await this.discoverComponents(
                projectPath,
                manifest.componentInstances,
                manifest.componentVersions,
            );

            const project: Project = {
                name: manifest.name || path.basename(projectPath),
                // Absent on older projects, and that is the supported state:
                // `getProjectDisplayName` falls back to the slug, so they render
                // exactly as they always have. Nothing backfills this.
                title: manifest.title,
                path: projectPath,
                status: 'stopped', // Will be updated below if demo is actually running
                created: manifest.created ? new Date(manifest.created) : new Date(),
                lastModified: manifest.lastModified ? new Date(manifest.lastModified) : new Date(),
                adobe: manifest.adobe,
                commerce: manifest.commerce,
                componentInstances,
                componentSelections: manifest.componentSelections,
                componentConfigs: manifest.componentConfigs,
                commerceStoreStructure: manifest.commerceStoreStructure,
                componentVersions,
                // The legacy singular meshState/appState are NOT copied onto the
                // Project (PL-1 phase 2): the keyed map below is the only
                // in-memory carrier; the migration reads them off the manifest.
                edsStorefrontState: manifest.edsStorefrontState,
                edsStorefrontStatusSummary: manifest.edsStorefrontStatusSummary,
                selectedPackage: normalizePackageId(manifest.selectedPackage),
                datapack: manifest.datapack,
                selectedStack: manifest.selectedStack,
                selectedAddons: manifest.selectedAddons,
                selectedBlockLibraries: manifest.selectedBlockLibraries,
                customBlockLibraries: manifest.customBlockLibraries,
                aiPrompts: manifest.aiPrompts,
                // Absent on legacy manifests (pre-§E) — loads as undefined.
                // LEGACY-READ-ONLY once componentApiPicks exists: migrateApiPicks
                // below moves it under the unattributed key.
                additionalConsoleApis: manifest.additionalConsoleApis,
                componentApiPicks: manifest.componentApiPicks,
                aiContextVersion: manifest.aiContextVersion,
                // ADR-013 hash-and-skip map — absent on pre-ADR manifests.
                aiFileHashes: manifest.aiFileHashes,
                publishKeyRegisteredAt: manifest.publishKeyRegisteredAt,
                pinned: manifest.pinned,
            };

            // Keyed appBuilderComponents (ADR-011 D3 Step 01): prefer the persisted
            // map — it is the durable model, written by ProjectConfigWriter. The
            // read-side migration of legacy meshState/appState is the FALLBACK for
            // old manifests that carry no keyed map (never dropped — projects of
            // arbitrary age must keep loading).
            project.appBuilderComponents =
                manifest.appBuilderComponents ?? migrateLegacyToAppBuilderComponents(manifest);

            // Selections vs reality: the dashboard add path records the keyed
            // entry and the component instance but never wrote the selection
            // lists, so a mesh or integration added there is invisible to
            // Configure's rail and — worse — dropped by project reset, which
            // rebuilds its component list from those lists. Additive only.
            reconcileComponentSelections(project);

            // Per-integration API attribution (step 01): a pre-attribution manifest
            // carries only the flat `additionalConsoleApis`; move it under the
            // unattributed key so every reader can go through resolveDesiredApis.
            // Read-side only — the on-disk manifest is untouched until next write.
            project.componentApiPicks = migrateApiPicks(project).componentApiPicks;

            // Backend-owned store scope: existing manifests carry the same website /
            // store / store view on the mesh and frontend components too, because the
            // config surfaces used to fan one field out to every declaring component.
            // Writes are narrowed to the backend now, so those copies are inert — and
            // an inert copy is still one a future resolver can read by mistake, which
            // is exactly how the 2026-08-10 wrong-website bug worked. Read-side only:
            // the on-disk manifest is untouched until the next write.
            stripDuplicateBackendOwnedScope(
                project.componentConfigs as Record<string, Record<string, unknown>> | undefined,
                project.componentSelections?.backend,
            );

            // Legacy `daLiveSite` metadata: since the DA/repo name unification
            // the field duplicates the repo name, and readers fall back to it —
            // so an EQUAL value is dead weight and is dropped on load. An
            // UNEQUAL value is preserved deliberately: it is both the pointer
            // to where the DA content actually lives on an unmigrated legacy
            // project AND the name-migration net's detection signal — a blanket
            // strip would blind that net. Read-side only; the on-disk manifest
            // is untouched until the next write.
            stripRedundantDaLiveSite(project);

            // Orphaned config entries: removal deletes a component's
            // componentConfigs entry going forward, but entries stranded by
            // earlier removals live in existing manifests — and two readers
            // sweep the WHOLE map (envFileGenerator's fallback loop;
            // configGenerator's merge, where a MESH entry overrides the
            // backend). Runs AFTER reconcileComponentSelections so a freshly
            // reconciled selection counts as live. Read-side only; the on-disk
            // manifest is untouched until the next write.
            stripOrphanedComponentConfigs(project);

            // Detect if demo is actually running
            this.detectDemoStatus(project, terminalProvider);

            return project;
        } catch (error) {
            // Check if this is an expected "not found" error (e.g., project was deleted)
            const isNotFound =
                error instanceof Error &&
                (error.message.includes('ENOENT') ||
                    (error as NodeJS.ErrnoException).code === 'ENOENT');

            if (isNotFound) {
                // Project directory doesn't exist - expected after deletion, log at debug
                this.logger.debug(
                    `[ProjectFileLoader] Project not found at ${projectPath} (deleted or moved)`,
                );
            } else {
                // Unexpected error - log at error level
                this.logger.error(
                    `Failed to load project from ${projectPath}`,
                    error instanceof Error ? error : undefined,
                );
            }
            return null;
        }
    }

    /**
     * Discover components from disk and merge with manifest data
     */
    private async discoverComponents(
        projectPath: string,
        manifestInstances?: Record<string, ComponentInstance>,
        manifestVersions?: Record<string, { version: string; lastUpdated: string }>,
    ): Promise<{
        componentInstances: Record<string, ComponentInstance>;
        componentVersions: Record<string, { version: string; lastUpdated: string }>;
    }> {
        const discoveredComponents: Record<string, ComponentInstance> = {};
        const componentsDir = path.join(projectPath, 'components');

        try {
            const componentDirs = await fs.readdir(componentsDir);

            for (const componentId of componentDirs) {
                // Skip snapshot directories (created during component updates)
                if (componentId.includes('.snapshot-')) {
                    continue;
                }

                const componentPath = path.join(componentsDir, componentId);
                const stat = await fs.stat(componentPath);

                if (stat.isDirectory()) {
                    // Create a basic component instance for any component on disk
                    discoveredComponents[componentId] = {
                        id: componentId,
                        name: componentId,
                        type: 'dependency', // Default, will be overridden by manifest if available
                        status: 'ready',
                        path: componentPath,
                        lastUpdated: new Date(),
                    };
                }
            }
        } catch {
            // No components directory or error reading it
            this.logger.debug('No components directory found or error reading it');
        }

        // MERGE: Combine manifest data with discovered components
        // Manifest data takes priority, but discovered components fill in gaps
        const mergedComponentInstances: Record<string, ComponentInstance> = {
            ...discoveredComponents, // Start with all discovered components
            ...(manifestInstances || {}), // Overlay manifest data (takes priority)
        };

        // For each discovered component not in manifest, ensure it has a path
        for (const componentId of Object.keys(discoveredComponents)) {
            if (
                mergedComponentInstances[componentId] &&
                !mergedComponentInstances[componentId].path
            ) {
                mergedComponentInstances[componentId].path = discoveredComponents[componentId].path;
            }
        }

        // Merge componentVersions - ensure discovered components have version entries
        // Prefer componentInstance.version (from recent installation) over manifest data
        const mergedComponentVersions = { ...(manifestVersions || {}) };
        for (const componentId of Object.keys(discoveredComponents)) {
            // Check if the merged componentInstance has version data (from recent installation)
            const instanceVersion = mergedComponentInstances[componentId]?.version;

            if (!mergedComponentVersions[componentId]) {
                // Component exists on disk but has no version tracking in project file
                mergedComponentVersions[componentId] = {
                    version: instanceVersion || 'unknown',
                    lastUpdated: new Date().toISOString(),
                };
            } else if (
                instanceVersion &&
                instanceVersion !== mergedComponentVersions[componentId].version
            ) {
                // Component version was updated (e.g., during project edit) - prefer the fresh instance version
                mergedComponentVersions[componentId] = {
                    version: instanceVersion,
                    lastUpdated: new Date().toISOString(),
                };
            }
        }

        return {
            componentInstances: mergedComponentInstances,
            componentVersions: mergedComponentVersions,
        };
    }

    /**
     * Detect if demo is actually running by checking for project-specific terminal
     */
    private detectDemoStatus(
        project: Project,
        terminalProvider: () => readonly vscode.Terminal[],
    ): void {
        // Use dynamic lookup to find frontend component (not hardcoded ID)
        const frontendComponent = getComponentInstancesByType(project, 'frontend')[0];
        if (frontendComponent) {
            try {
                const projectTerminalName = `${project.name} - Frontend`;
                const terminals = terminalProvider();
                const hasProjectTerminal = terminals.some((t) => t.name === projectTerminalName);

                if (hasProjectTerminal) {
                    // This project's demo is running, update status
                    project.status = 'running';
                    frontendComponent.status = 'running';
                } else {
                    // No terminal for this project, ensure status is stopped
                    project.status = 'stopped';
                    frontendComponent.status = 'ready';
                }
            } catch (error) {
                this.logger.error(
                    'Error detecting demo status',
                    error instanceof Error ? error : undefined,
                );
            }
        }
    }
}

/**
 * Drop a `daLiveSite` metadata value that merely duplicates the repo name.
 *
 * Exported for its own test. The unequal case is preserved on purpose — see
 * the call-site comment: on an unmigrated legacy project the value points at
 * where the DA content actually lives, and it is the storefront-name
 * migration's detection signal.
 *
 * @param project - the freshly loaded project (mutated in place)
 */
export function stripRedundantDaLiveSite(project: Project): void {
    const edsInstance = project.componentInstances?.['eds-storefront'];
    const metadata = edsInstance?.metadata;
    if (!metadata) return;
    const daLiveSite = metadata.daLiveSite as string | undefined;
    const githubRepo = metadata.githubRepo as string | undefined;
    if (!daLiveSite || !githubRepo) return;
    const repoName = githubRepo.split('/')[1];
    if (daLiveSite === repoName) {
        delete metadata.daLiveSite;
    }
}

/**
 * Drop `componentConfigs` entries for components that are no longer part of
 * the project.
 *
 * Configure's fan-out writes a shared field only to SELECTED declaring
 * components, while the env/config generators sweep every entry in the map —
 * configGenerator with mesh-overrides-non-mesh priority. An entry stranded by
 * a component removal therefore holds a stale copy that can outvote the live
 * backend's fresh value (the same failure shape as the 2026-08-10
 * wrong-website bug, for every non-scope key).
 *
 * Liveness is deliberately broad — every id any writer can legitimately key:
 * the selection lists, `selectedAddons`, installed instances, and keyed App
 * Builder entries. Exported for its own test.
 *
 * @param project - the freshly loaded project (mutated in place)
 * @returns whether any entry was removed
 */
export function stripOrphanedComponentConfigs(project: Project): boolean {
    const configs = project.componentConfigs;
    if (!configs) return false;

    const selections = project.componentSelections;
    const live = new Set<string>([
        ...(selections?.frontend ? [selections.frontend] : []),
        ...(selections?.backend ? [selections.backend] : []),
        ...(selections?.dependencies ?? []),
        ...(selections?.integrations ?? []),
        ...(selections?.appBuilder ?? []),
        ...(project.selectedAddons ?? []),
        ...Object.keys(project.componentInstances ?? {}),
        ...Object.keys(project.appBuilderComponents ?? {}),
    ]);

    let changed = false;
    for (const id of Object.keys(configs)) {
        if (!live.has(id)) {
            delete configs[id];
            changed = true;
        }
    }
    return changed;
}
