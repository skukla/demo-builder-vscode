/**
 * Project Rename Service
 *
 * Shared rename core used by both the projects-list kebab handler and the
 * project dashboard "More" menu. Operates on an already-loaded project plus a
 * new name: validates, renames the folder on disk, rewrites componentInstances
 * paths, updates the recent-projects list, and persists the project.
 *
 * The two callers differ only in how they obtain the project (loadProjectFromPath
 * vs getCurrentProject); the rename logic itself lives here so it is not
 * duplicated.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { validateProjectNameSecurity } from '@/core/validation';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/**
 * Rename a loaded project.
 *
 * @param context - Handler context (stateManager + logger)
 * @param project - The already-loaded project to rename (mutated in place)
 * @param rawName - The requested new name (will be trimmed)
 * @returns HandlerResponse with { success, newName, newPath } on success
 */
export async function renameProjectCore(
    context: HandlerContext,
    project: Project,
    rawName: string,
): Promise<HandlerResponse> {
    try {
        const newName = rawName.trim();
        if (!newName) {
            return { success: false, error: 'Project name cannot be empty' };
        }

        // Cannot rename while running (folder is in use)
        if (project.status === 'running') {
            return {
                success: false,
                error: 'Cannot rename project while demo is running. Stop the demo first.',
            };
        }

        // Validate new name (same rules as project creation)
        try {
            validateProjectNameSecurity(newName);
        } catch (validationError) {
            return {
                success: false,
                error: validationError instanceof Error ? validationError.message : 'Invalid project name',
            };
        }

        const oldName = project.name;
        const oldPath = project.path;

        // Use name directly as folder (consistent with project creation)
        const projectsRoot = path.dirname(oldPath);
        const newPath = path.join(projectsRoot, newName);

        // Rename folder if path changes
        if (newPath !== oldPath) {
            // Check if new folder already exists
            try {
                await fsPromises.access(newPath);
                return {
                    success: false,
                    error: `A project folder named "${newName}" already exists`,
                };
            } catch {
                // Folder doesn't exist, which is what we want
            }

            // Rename the folder on disk
            await fsPromises.rename(oldPath, newPath);

            // Update project.path and componentInstances paths
            project.path = newPath;
            if (project.componentInstances) {
                for (const componentId of Object.keys(project.componentInstances)) {
                    const component = project.componentInstances[componentId];
                    if (component.path?.startsWith(oldPath)) {
                        component.path = component.path.replace(oldPath, newPath);
                    }
                }
            }

            // Update recent projects list
            await context.stateManager.removeFromRecentProjects(oldPath);
        }

        // Update the name
        project.name = newName;

        // Save the updated project (at the new location)
        await context.stateManager.saveProject(project);

        // Regenerate AI context files when the folder moved. The MCP configs
        // (.mcp.json / .claude/mcp.json) bake the ABSOLUTE project path into the
        // server args, so a rename leaves them pointing at the old path (→ MCP
        // "MODULE_NOT_FOUND" on the renamed project). Re-running the same writers
        // project creation uses rewrites them for the new path. Non-fatal —
        // mirrors the project-creation + dashboard "Regenerate AI files" callers;
        // a failure just means the user must run "Regenerate AI files" manually.
        if (newPath !== oldPath) {
            try {
                const { generateAIContextFiles } = await import(
                    '@/features/project-creation/services/projectFinalizationService'
                );
                await generateAIContextFiles(project.path, project, context.context.extensionPath);
            } catch (regenError) {
                context.logger.warn(
                    `[Rename] AI context regeneration failed for "${newName}" — MCP/AI configs `
                    + 'may reference the old path until "Regenerate AI files" is run. '
                    + (regenError instanceof Error ? regenError.message : String(regenError)),
                );
            }
        }

        context.logger.info(`Renamed project: "${oldName}" → "${newName}"`);

        return {
            success: true,
            data: { success: true, newName, newPath },
        };
    } catch (error) {
        context.logger.error('Failed to rename project', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to rename project',
        };
    }
}
