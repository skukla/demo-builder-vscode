/**
 * ProjectFileLoader
 *
 * Loads project data from the filesystem by reading the .demo-builder.json manifest
 * and discovering components in the components/ directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Logger } from '@/types/logger';
import type { Project, ComponentInstance } from '@/types';
import { getComponentInstancesByType, parseJSON } from '@/types/typeGuards';

export interface ProjectManifest {
    name?: string;
    created?: string;
    lastModified?: string;
    adobe?: Project['adobe'];
    commerce?: Project['commerce'];
    componentInstances?: Project['componentInstances'];
    componentSelections?: Project['componentSelections'];
    componentConfigs?: Project['componentConfigs'];
    componentVersions?: Project['componentVersions'];
    meshState?: Project['meshState'];
    selectedPackage?: string;
    selectedStack?: string;
    selectedAddons?: string[];
}

export class ProjectFileLoader {
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

            // Discover components from disk and merge with manifest
            const { componentInstances, componentVersions } = await this.discoverComponents(
                projectPath,
                manifest.componentInstances,
                manifest.componentVersions,
            );

            const project: Project = {
                name: manifest.name || path.basename(projectPath),
                path: projectPath,
                status: 'stopped', // Will be updated below if demo is actually running
                created: manifest.created ? new Date(manifest.created) : new Date(),
                lastModified: manifest.lastModified ? new Date(manifest.lastModified) : new Date(),
                adobe: manifest.adobe,
                commerce: manifest.commerce,
                componentInstances,
                componentSelections: manifest.componentSelections,
                componentConfigs: manifest.componentConfigs,
                componentVersions,
                meshState: manifest.meshState,
                selectedPackage: manifest.selectedPackage,
                selectedStack: manifest.selectedStack,
                selectedAddons: manifest.selectedAddons,
            };

            // Detect if demo is actually running
            this.detectDemoStatus(project, terminalProvider);

            return project;
        } catch (error) {
            // Check if this is an expected "not found" error (e.g., project was deleted)
            const isNotFound = error instanceof Error &&
                (error.message.includes('ENOENT') || (error as NodeJS.ErrnoException).code === 'ENOENT');

            if (isNotFound) {
                // Project directory doesn't exist - expected after deletion, log at debug
                this.logger.debug(`[ProjectFileLoader] Project not found at ${projectPath} (deleted or moved)`);
            } else {
                // Unexpected error - log at error level
                this.logger.error(`Failed to load project from ${projectPath}`, error instanceof Error ? error : undefined);
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
            if (mergedComponentInstances[componentId] && !mergedComponentInstances[componentId].path) {
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
                
                if (instanceVersion) {
                    this.logger.debug(`[ProjectFileLoader] Component version detected: ${componentId} (${instanceVersion})`);
                } else {
                    this.logger.debug(`[ProjectFileLoader] Component found with unknown version: ${componentId}`);
                }
            } else if (instanceVersion && instanceVersion !== mergedComponentVersions[componentId].version) {
                // Component version was updated (e.g., during project edit) - prefer the fresh instance version
                this.logger.debug(`[ProjectFileLoader] Updating component version: ${componentId} (${mergedComponentVersions[componentId].version} → ${instanceVersion})`);
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
                const hasProjectTerminal = terminals.some(t => t.name === projectTerminalName);

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
                this.logger.error('Error detecting demo status', error instanceof Error ? error : undefined);
            }
        }
    }
}
