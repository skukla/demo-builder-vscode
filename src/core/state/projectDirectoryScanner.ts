/**
 * ProjectDirectoryScanner
 *
 * Scans the projects directory to find all valid demo projects.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { Logger } from '@/types/logger';

export interface ProjectSummary {
    name: string;
    path: string;
    lastModified: Date;
}

export class ProjectDirectoryScanner {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Get all projects from the projects directory
     */
    async getAllProjects(): Promise<ProjectSummary[]> {
        const projectsDir = path.join(os.homedir(), '.demo-builder', 'projects');
        const projects: ProjectSummary[] = [];

        try {
            const entries = await fs.readdir(projectsDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const projectPath = path.join(projectsDir, entry.name);
                    const manifestPath = path.join(projectPath, '.demo-builder.json');

                    // Check if it's a valid project (has manifest)
                    try {
                        await fs.access(manifestPath);
                        const stats = await fs.stat(manifestPath);

                        projects.push({
                            name: entry.name,
                            path: projectPath,
                            lastModified: stats.mtime,
                        });
                    } catch {
                        // Not a valid project (missing .demo-builder.json), skip silently
                        this.logger.debug(`Skipping directory without manifest: ${entry.name}`);
                    }
                }
            }

            // Sort by last modified (newest first)
            projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
        } catch (error) {
            // Distinguish between "doesn't exist yet" and "permission denied"
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === 'ENOENT') {
                this.logger.debug('Projects directory does not exist yet');
            } else {
                this.logger.error('Failed to read projects directory', error instanceof Error ? error : undefined);
            }
        }

        return projects;
    }
}
