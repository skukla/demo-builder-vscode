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
import { Project, StateData, ProcessInfo } from '@/types';
import { parseJSON } from '@/types/typeGuards';

export class StateManager {
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
        if (this.state.currentProject?.path) {
            try {
                const freshProject = await this.loadProjectFromPath(this.state.currentProject.path);

                if (freshProject === null) {
                    return this.state.currentProject;
                }

                this.state.currentProject = freshProject;
                return freshProject;
            } catch {
                return this.state.currentProject;
            }
        }
        return this.state.currentProject;
    }

    public async saveProject(project: Project): Promise<void> {
        // GUARD: Prevent stale background saves from recreating deleted projects
        const projectPathExists = await this.checkPathExists(project.path);
        if (!projectPathExists && !this.state.currentProject) {
            return;
        }

        this.state.currentProject = project;
        await this.saveState();

        // Save project-specific config via delegated service
        await this.projectConfigWriter.saveProjectConfig(project, this.state.currentProject?.path);

        // Update context variable for view switching
        await vscode.commands.executeCommand('setContext', 'demoBuilder.projectLoaded', true);

        // Notify listeners
        this._onProjectChanged.fire(project);
    }

    public async clearProject(): Promise<void> {
        this.state.currentProject = undefined;
        this.state.processes.clear();
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
     */
    public async loadProjectFromPath(
        projectPath: string,
        terminalProvider: () => readonly vscode.Terminal[] = () => vscode.window.terminals,
    ): Promise<Project | null> {
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

            // Set as current project
            await this.saveProject(project);

            // Add to recent projects
            await this.addToRecentProjects(project);
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
