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
            // Support both old format (currentProject) and new format (currentProjectPath)
            const parsed = parseJSON<{
                version?: number;
                currentProjectPath?: string;
                currentProject?: Project; // Legacy: for migration from old state files
                processes?: Record<string, ProcessInfo>;
                lastUpdated?: string;
            }>(data);
            if (!parsed) {
                this.logger.warn('Failed to parse state file, using defaults');
                return;
            }

            // Get project path (new format) or extract from legacy format
            const projectPath = parsed.currentProjectPath || parsed.currentProject?.path;
            let validProject: Project | undefined = undefined;

            if (projectPath) {
                try {
                    await fs.access(projectPath);

                    // Load project from manifest - the ONLY source of truth for project data
                    const freshProject = await this.projectFileLoader.loadProject(
                        projectPath,
                        () => vscode.window.terminals,
                    );

                    if (freshProject) {
                        this.logger.debug(
                            `[StateManager] Loaded project from manifest: ` +
                            `selectedPackage=${freshProject.selectedPackage}, selectedStack=${freshProject.selectedStack}`
                        );
                        validProject = freshProject;
                    } else {
                        this.logger.warn(`[StateManager] Failed to load project from manifest at ${projectPath}`);
                    }
                } catch {
                    // Project path doesn't exist, clear it
                    this.logger.warn(`Project path ${projectPath} does not exist, clearing project`);
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

            // IMPORTANT: Only persist the project PATH, not the full project data.
            // The manifest (.demo-builder.json) is the single source of truth for project data.
            // This eliminates sync issues between state.json and the manifest.
            const data = {
                version: this.state.version,
                currentProjectPath: this.state.currentProject?.path,
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
        // DEBUG: Track what's triggering saves
        const stack = new Error().stack?.split('\n').slice(2, 5).join(' <- ') || 'unknown';
        this.logger.debug(`[StateManager] saveProject called for ${project.name}, caller: ${stack}`);

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
     * The manifest (.demo-builder.json) is the SINGLE SOURCE OF TRUTH for project data.
     * No recovery from cache or recent projects needed - just load from manifest.
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

        // Load project from manifest - the single source of truth
        const project = await this.projectFileLoader.loadProject(projectPath, terminalProvider);

        if (project) {
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
