/**
 * StateManager
 *
 * Central orchestrator for project state management. Delegates to specialized services:
 * - ProjectFileLoader: Loading projects from disk
 * - ProjectConfigWriter: Writing project config files
 * - RecentProjectsManager: Managing recent projects list
 * - ProjectDirectoryScanner: Scanning projects directory
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectConfigWriter } from './projectConfigWriter';
import { ProjectDirectoryScanner, ProjectSummary } from './projectDirectoryScanner';
import { ProjectFileLoader } from './projectFileLoader';
import { RecentProjectsManager, RecentProject } from './recentProjectsManager';
import { getLogger } from '@/core/logging';
import { ExecutionLock } from '@/core/utils';
import { Project, StateData, ProcessInfo } from '@/types';
import { parseJSON } from '@/types/typeGuards';

export class StateManager {
    // Serialize save operations to prevent concurrent writes racing on temp file
    // (Multiple concurrent saveProject calls would all write to same .tmp file,
    // causing ENOENT when first rename succeeds and deletes it before others complete)
    private static saveLock = new ExecutionLock('StateManager.save');

    private context: vscode.ExtensionContext;
    private state: StateData;
    private stateFile: string;
    private _onProjectChanged = new vscode.EventEmitter<Project | undefined>();
    readonly onProjectChanged = this._onProjectChanged.event;
    private logger = getLogger();

    // Delegated services
    private projectFileLoader: ProjectFileLoader;
    private projectConfigWriter: ProjectConfigWriter;
    private recentProjectsManager: RecentProjectsManager;
    private projectDirectoryScanner: ProjectDirectoryScanner;

    // Dirty tracking - tracks fields modified by background operations
    // Background ops call markDirty() instead of saveProject()
    // Only explicit user actions should call saveProject()
    private dirtyFields: Set<keyof Project> = new Set();

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.stateFile = path.join(os.homedir(), '.demo-builder', 'state.json');
        this.state = {
            version: 1,
            currentProject: undefined,
            processes: new Map(),
            lastUpdated: new Date(),
        };

        // Initialize delegated services
        this.projectFileLoader = new ProjectFileLoader(this.logger);
        this.projectConfigWriter = new ProjectConfigWriter(this.logger);
        this.recentProjectsManager = new RecentProjectsManager(this.logger);
        this.projectDirectoryScanner = new ProjectDirectoryScanner(this.logger);
    }

    public async initialize(): Promise<void> {
        // Ensure directory exists
        const dir = path.dirname(this.stateFile);
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create state directory', error instanceof Error ? error : undefined);
        }

        // Load existing state
        await this.loadState();
    }

    private async loadState(): Promise<void> {
        try {
            const data = await fs.readFile(this.stateFile, 'utf-8');
            const parsed = parseJSON<{ version?: number; currentProject?: Project; processes?: Record<string, ProcessInfo>; lastUpdated?: string }>(data);
            if (!parsed) {
                this.logger.warn('Failed to parse state file, using defaults');
                return;
            }

            // Validate that project path exists if there's a current project
            let validProject = parsed.currentProject;
            if (validProject?.path) {
                try {
                    await fs.access(validProject.path);

                    // CRITICAL: Reload project from manifest to ensure fresh data
                    // The state file may contain stale project data (e.g., missing selectedPackage)
                    // The project's .demo-builder.json manifest is the source of truth
                    const freshProject = await this.projectFileLoader.loadProject(
                        validProject.path,
                        () => vscode.window.terminals,
                    );

                    if (freshProject) {
                        this.logger.debug(
                            `[StateManager] Refreshed project from manifest: ` +
                            `selectedPackage=${freshProject.selectedPackage}, selectedStack=${freshProject.selectedStack}`
                        );
                        validProject = freshProject;
                    } else {
                        this.logger.warn(`[StateManager] Failed to reload project from manifest, using cached state`);
                    }
                } catch {
                    // Project path doesn't exist, clear it
                    this.logger.warn(`Project path ${validProject.path} does not exist, clearing project`);
                    validProject = undefined;
                }
            }

            this.state = {
                version: parsed.version || 1,
                currentProject: validProject,
                processes: new Map(Object.entries(parsed.processes || {})),
                lastUpdated: new Date(parsed.lastUpdated || Date.now()),
            };
        } catch {
            // State file doesn't exist or is invalid, use defaults
            this.logger.info('No existing state found, using defaults');
        }
    }

    private async saveState(): Promise<void> {
        try {
            this.state.lastUpdated = new Date();

            const data = {
                version: this.state.version,
                currentProject: this.state.currentProject,
                processes: Object.fromEntries(this.state.processes),
                lastUpdated: this.state.lastUpdated,
            };

            await fs.writeFile(this.stateFile, JSON.stringify(data, null, 2));
        } catch (error) {
            this.logger.error('Failed to save state', error instanceof Error ? error : undefined);
            throw error;
        }
    }

    /**
     * Check if a path exists on the filesystem
     */
    private async checkPathExists(pathToCheck: string): Promise<boolean> {
        try {
            await fs.access(pathToCheck);
            return true;
        } catch {
            return false;
        }
    }

    public async hasProject(): Promise<boolean> {
        return this.state.currentProject !== undefined;
    }

    public async getCurrentProject(): Promise<Project | undefined> {
        // If we have a cached project, reload it from disk to get latest data
        // Use persistAfterLoad: false to avoid triggering saves during status bar polling
        if (this.state.currentProject?.path) {
            try {
                const freshProject = await this.loadProjectFromPath(
                    this.state.currentProject.path,
                    () => vscode.window.terminals,
                    { persistAfterLoad: false },
                );

                if (freshProject === null) {
                    return this.state.currentProject;
                }

                return freshProject;
            } catch {
                return this.state.currentProject;
            }
        }
        return this.state.currentProject;
    }

    public async saveProject(project: Project): Promise<void> {
        // Serialize save operations to prevent concurrent writes racing on temp file
        return StateManager.saveLock.run(async () => {
            // GUARD: Prevent stale background saves from recreating deleted projects
            const projectPathExists = await this.checkPathExists(project.path);

            if (!projectPathExists && !this.state.currentProject) {
                return;
            }

            this.state.currentProject = project;
            await this.saveState();

            // Save project-specific config via delegated service
            await this.projectConfigWriter.saveProjectConfig(project, this.state.currentProject?.path);

            // Clear dirty state after successful save
            this.dirtyFields.clear();

            // Update context variable for view switching
            await vscode.commands.executeCommand('setContext', 'demoBuilder.projectLoaded', true);

            // Notify listeners
            this._onProjectChanged.fire(project);
        });
    }

    // =========================================================================
    // Dirty Tracking
    // Background operations should call markDirty() instead of saveProject().
    // Only explicit user actions trigger actual saves.
    // =========================================================================

    /**
     * Mark a project field as dirty (changed but not yet saved).
     * Background operations should use this instead of saveProject().
     * @param field - The field that changed (e.g., 'meshState')
     */
    public markDirty(field: keyof Project): void {
        this.dirtyFields.add(field);
        this.logger.debug(`[StateManager] Marked field dirty: ${field}`);
    }

    /**
     * Check if project has unsaved changes
     * @returns true if any fields are marked dirty
     */
    public isDirty(): boolean {
        return this.dirtyFields.size > 0;
    }

    /**
     * Get the set of dirty fields
     * @returns ReadonlySet of field names that have been marked dirty
     */
    public getDirtyFields(): ReadonlySet<keyof Project> {
        return this.dirtyFields;
    }

    /**
     * Clear dirty state (called automatically after saveProject)
     */
    public clearDirty(): void {
        this.dirtyFields.clear();
    }

    public async clearProject(): Promise<void> {
        this.state.currentProject = undefined;
        this.state.processes.clear();
        this.dirtyFields.clear();
        await this.saveState();

        await vscode.commands.executeCommand('setContext', 'demoBuilder.projectLoaded', false);
        this._onProjectChanged.fire(undefined);
    }

    public async clearAll(): Promise<void> {
        this.state = {
            version: 1,
            currentProject: undefined,
            processes: new Map(),
            lastUpdated: new Date(),
        };
        this.dirtyFields.clear();

        await this.context.workspaceState.update('demoBuilder.state', undefined);

        try {
            await fs.unlink(this.stateFile);
        } catch {
            // Ignore if file doesn't exist
        }

        await vscode.commands.executeCommand('setContext', 'demoBuilder.projectLoaded', false);
        this._onProjectChanged.fire(undefined);
    }

    public async addProcess(name: string, info: ProcessInfo): Promise<void> {
        this.state.processes.set(name, info);
        await this.saveState();
    }

    public async removeProcess(name: string): Promise<void> {
        this.state.processes.delete(name);
        await this.saveState();
    }

    public async getProcess(name: string): Promise<ProcessInfo | undefined> {
        return this.state.processes.get(name);
    }

    public async reload(): Promise<void> {
        await this.loadState();
        await this.recentProjectsManager.load();
        this._onProjectChanged.fire(this.state.currentProject);
    }

    // Recent Projects Management (delegated)

    public async getRecentProjects(): Promise<RecentProject[]> {
        return this.recentProjectsManager.getAll();
    }

    public async addToRecentProjects(project: Project): Promise<void> {
        return this.recentProjectsManager.add(project);
    }

    public async removeFromRecentProjects(projectPath: string): Promise<void> {
        return this.recentProjectsManager.remove(projectPath);
    }

    // Project Loading (delegated)

    /**
     * Load a project from a directory path
     *
     * IMPORTANT: Preserves selectedPackage and selectedStack from cached project
     * when reloading from disk. This prevents data loss during async reload cycles
     * (e.g., mesh status polling) where the disk manifest might be stale or incomplete.
     *
     * @param projectPath - Path to the project directory
     * @param terminalProvider - Optional function to get terminals (for testing)
     * @param options.persistAfterLoad - Whether to save the project after loading (default: true)
     *                                   Set to false when just reloading for fresh data (e.g., getCurrentProject)
     */
    public async loadProjectFromPath(
        projectPath: string,
        terminalProvider: () => readonly vscode.Terminal[] = () => vscode.window.terminals,
        options: { persistAfterLoad?: boolean } = {},
    ): Promise<Project | null> {
        const { persistAfterLoad = true } = options;
        const project = await this.projectFileLoader.loadProject(projectPath, terminalProvider);

        if (project) {
            // CRITICAL: Preserve selectedPackage/selectedStack from cached project
            // when disk version has them as undefined. This prevents data loss during
            // async reload cycles (mesh status polling, etc.)
            const cachedProject = this.state.currentProject;
            if (cachedProject && cachedProject.path === projectPath) {
                if (project.selectedPackage === undefined && cachedProject.selectedPackage !== undefined) {
                    project.selectedPackage = cachedProject.selectedPackage;
                }
                if (project.selectedStack === undefined && cachedProject.selectedStack !== undefined) {
                    project.selectedStack = cachedProject.selectedStack;
                }
                if (project.selectedAddons === undefined && cachedProject.selectedAddons !== undefined) {
                    project.selectedAddons = cachedProject.selectedAddons;
                }
            }

            // FALLBACK: If metadata still undefined, check recent projects for backup
            // This handles cases where manifest was corrupted and project is not current
            if (project.selectedPackage === undefined || project.selectedStack === undefined) {
                const recentProject = await this.recentProjectsManager.findByPath(projectPath);
                if (recentProject) {
                    if (project.selectedPackage === undefined && recentProject.selectedPackage) {
                        project.selectedPackage = recentProject.selectedPackage;
                        this.logger.debug(`[StateManager] Recovered selectedPackage from recent projects: ${recentProject.selectedPackage}`);
                    }
                    if (project.selectedStack === undefined && recentProject.selectedStack) {
                        project.selectedStack = recentProject.selectedStack;
                        this.logger.debug(`[StateManager] Recovered selectedStack from recent projects: ${recentProject.selectedStack}`);
                    }
                    if (project.selectedAddons === undefined && recentProject.selectedAddons) {
                        project.selectedAddons = recentProject.selectedAddons;
                        this.logger.debug(`[StateManager] Recovered selectedAddons from recent projects`);
                    }
                }
            }

            if (persistAfterLoad) {
                // Set as current project and persist to disk
                await this.saveProject(project);

                // Add to recent projects
                await this.addToRecentProjects(project);
            } else {
                // Just update in-memory state without disk writes
                this.state.currentProject = project;
            }
        }

        return project;
    }

    // Project Directory Scanning (delegated)

    /**
     * Get all projects from the projects directory
     */
    public async getAllProjects(): Promise<ProjectSummary[]> {
        return this.projectDirectoryScanner.getAllProjects();
    }

    public dispose(): void {
        this._onProjectChanged.dispose();
    }
}
