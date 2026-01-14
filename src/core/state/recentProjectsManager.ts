/**
 * RecentProjectsManager
 *
 * Manages the list of recently opened projects with persistence.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types';
import { parseJSON } from '@/types/typeGuards';

export interface RecentProject {
    path: string;
    name: string;
    organization?: string;
    lastOpened: string;
    // Metadata backup fields - used to recover data if manifest is corrupted
    selectedPackage?: string | null;
    selectedStack?: string | null;
    selectedAddons?: string[];
}

const MAX_RECENT_PROJECTS = 10;

export class RecentProjectsManager {
    private recentProjectsFile: string;
    private recentProjects: RecentProject[] = [];
    private logger: Logger;

    constructor(logger: Logger) {
        this.recentProjectsFile = path.join(os.homedir(), '.demo-builder', 'recent-projects.json');
        this.logger = logger;
    }

    /**
     * Load recent projects from disk, validating that paths still exist
     */
    async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.recentProjectsFile, 'utf-8');
            const parsed = parseJSON<RecentProject[]>(data);
            if (!parsed) {
                this.logger.debug('Recent projects file empty or invalid, using empty list');
                this.recentProjects = [];
                return;
            }
            this.recentProjects = parsed;

            // Validate that paths still exist
            this.recentProjects = await Promise.all(
                this.recentProjects.map(async (project) => {
                    try {
                        await fs.access(project.path);
                        return project;
                    } catch {
                        return null;
                    }
                }),
            ).then(projects => projects.filter((p): p is RecentProject => p !== null));

            // Limit to max recent projects
            this.recentProjects = this.recentProjects.slice(0, MAX_RECENT_PROJECTS);
            await this.save();
        } catch {
            this.recentProjects = [];
        }
    }

    /**
     * Save recent projects to disk
     */
    private async save(): Promise<void> {
        try {
            await fs.writeFile(
                this.recentProjectsFile,
                JSON.stringify(this.recentProjects, null, 2),
                'utf-8',
            );
        } catch (error) {
            this.logger.error('Failed to save recent projects', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Get the list of recent projects
     */
    async getAll(): Promise<RecentProject[]> {
        await this.load();
        return this.recentProjects;
    }

    /**
     * Add a project to the recent projects list
     */
    async add(project: Project): Promise<void> {
        await this.load();

        // Remove if already exists
        this.recentProjects = this.recentProjects.filter(p => p.path !== project.path);

        // Add to beginning with metadata backup
        this.recentProjects.unshift({
            path: project.path,
            name: project.name,
            organization: project.organization,
            lastOpened: new Date().toISOString(),
            // Store metadata for recovery if manifest is corrupted
            selectedPackage: project.selectedPackage ?? null,
            selectedStack: project.selectedStack ?? null,
            selectedAddons: project.selectedAddons ?? [],
        });

        // Keep only max recent
        this.recentProjects = this.recentProjects.slice(0, MAX_RECENT_PROJECTS);

        await this.save();
    }

    /**
     * Remove a project from the recent projects list
     */
    async remove(projectPath: string): Promise<void> {
        await this.load();
        this.recentProjects = this.recentProjects.filter(p => p.path !== projectPath);
        await this.save();
    }

    /**
     * Find a recent project by path
     * Used to recover metadata when manifest is missing fields
     */
    async findByPath(projectPath: string): Promise<RecentProject | undefined> {
        await this.load();
        return this.recentProjects.find(p => p.path === projectPath);
    }
}
