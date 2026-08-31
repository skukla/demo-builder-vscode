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
import { normalizeProjectName } from '@/core/validation/normalizers';
import { validateProjectNameSecurity } from '@/core/validation/validators/ProjectNameValidator';
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
        // What arrives is a TITLE, as typed. The slug is derived from it, exactly
        // as project creation does -- so a rename to "Bodea B2B Demo" moves the
        // folder to `bodea-b2b-demo` and the two never drift. The user browses
        // this folder, so a title that stopped matching its directory would be
        // worse than not offering titles at all.
        const newTitle = rawName.trim();
        if (!newTitle) {
            return { success: false, error: 'Project name cannot be empty' };
        }

        const newName = normalizeProjectName(newTitle);
        if (!newName) {
            return {
                success: false,
                error: `"${newTitle}" has no letters or numbers to build a folder name from`,
            };
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
                error:
                    validationError instanceof Error
                        ? validationError.message
                        : 'Invalid project name',
            };
        }

        const oldName = project.name;
        const oldTitle = project.title;
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

        // Update both names. The slug drives the folder and the dedupe key; the
        // title is what every surface renders via `getProjectDisplayName`.
        project.name = newName;
        project.title = newTitle;

        // Save the updated project (at the new location).
        //
        // ROLLBACK. The folder has already moved by this point, so a failure
        // here leaves the directory at the new path and the manifest describing
        // the old one -- and `projectFileLoader` reads `manifest.name`, so the
        // project would render under its old name from a folder with the new
        // one. That disagreement is exactly what titles are meant to prevent.
        //
        // Every step is local filesystem work, so undoing it is achievable in a
        // way the cloud operations elsewhere in this codebase are not: move the
        // directory back and restore the in-memory project. AI-bundle
        // regeneration below is deliberately OUTSIDE this guard -- it is already
        // best-effort and self-healing via the activation sweep, so failing it
        // must not throw away a rename that otherwise succeeded.
        try {
            await context.stateManager.saveProject(project);
        } catch (saveError) {
            if (newPath !== oldPath) {
                const undone = await rollbackRename(context, project, {
                    oldName,
                    oldTitle,
                    oldPath,
                    newPath,
                    newTitle,
                });
                if (!undone) {
                    return {
                        success: false,
                        error:
                            `Rename failed and could not be undone. The project folder is now at ` +
                            `"${newPath}" but still records the name "${oldName}".`,
                    };
                }
            }
            throw saveError;
        }

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
                    '@/features/project-creation/services/aiBundle/aiBundleService'
                );
                await generateAIContextFiles(project.path, project, context.context.extensionPath);
                // Persist the freshness stamp generateAIContextFiles set on `project`
                // (aiContextVersion), else the activation sweep re-refreshes the bundle on every start and the freshness log reports perpetual staleness.
                await context.stateManager.saveProjectConfigOnly(project);
            } catch (regenError) {
                // Landed hashes must survive a partial failure (Phase-4 review);
                // best-effort — a failing save must not mask the original error.
                try {
                    await context.stateManager.saveProjectConfigOnly(project);
                } catch {
                    /* best-effort */
                }
                context.logger.warn(
                    `[Rename] AI context regeneration failed for "${newName}" — MCP/AI configs ` +
                        'may reference the old path until "Regenerate AI files" is run. ' +
                        (regenError instanceof Error ? regenError.message : String(regenError)),
                );
            }
        }

        // Best-effort: keep the remote Adobe I/O project's title in sync — but
        // only when it still matches the demo's old identity (see the helper;
        // a user-selected shared Console project must never be renamed by a
        // demo rename).
        await syncRemoteProjectTitle(context, project, oldTitle ?? oldName, newTitle);

        context.logger.info(`Renamed project: "${oldName}" → "${newName}"`);

        return {
            success: true,
            data: { success: true, newName, newPath },
        };
    } catch (error) {
        context.logger.error(
            'Failed to rename project',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to rename project',
        };
    }
}

/**
 * Sync the remote Adobe I/O project title after a demo rename (best-effort).
 *
 * The Console project's title is set FROM the demo name when the wizard
 * provisions one in-app, and silently diverging names are the disagreement
 * class titles exist to prevent. But `project.adobe` can equally reference a
 * PRE-EXISTING Console project the user selected in the wizard — renaming that
 * would mutate shared infrastructure named by someone else. The guard: sync
 * only when the remote title still MATCHES the demo's old title/name (proof
 * the two were in sync); anything else is left alone with a debug line.
 *
 * Non-fatal by construction: the local rename has already succeeded and
 * persisted; a remote refusal (wrong org → 403, SDK unavailable, offline)
 * costs a warn and nothing more.
 *
 * @param context - handler context (authManager may be absent — e.g. tests)
 * @param project - the already-renamed project (mutated when the sync lands)
 * @param oldIdentity - the demo's previous title (or name when untitled)
 * @param newTitle - the new title to push
 */
async function syncRemoteProjectTitle(
    context: HandlerContext,
    project: Project,
    oldIdentity: string,
    newTitle: string,
): Promise<void> {
    const adobe = project.adobe;
    if (!adobe?.organization || !adobe.projectId || !context.authManager) {
        return;
    }
    if (adobe.projectTitle !== oldIdentity) {
        context.logger.debug(
            `[Rename] Remote project title "${adobe.projectTitle}" differs from the old demo ` +
                `identity — leaving the shared Adobe I/O project untouched.`,
        );
        return;
    }
    try {
        const renamed = await context.authManager.renameRemoteProject(
            adobe.organization,
            adobe.projectId,
            newTitle,
        );
        if (renamed) {
            adobe.projectTitle = newTitle;
            await context.stateManager.saveProjectConfigOnly(project);
            context.logger.info(`[Rename] Remote Adobe I/O project title synced to "${newTitle}"`);
        } else {
            context.logger.warn(
                `[Rename] Could not sync the remote Adobe I/O project title — the demo was ` +
                    `renamed, the Console project still shows "${adobe.projectTitle}".`,
            );
        }
    } catch (error) {
        context.logger.warn(
            `[Rename] remote project title sync failed (non-fatal): ` +
                (error instanceof Error ? error.message : String(error)),
        );
    }
}

/**
 * Put a half-finished rename back.
 *
 * Called only when the folder has already moved and the manifest write then
 * failed. Left alone, `projectFileLoader` would read the OLD `manifest.name`
 * out of a directory carrying the NEW one — so the project renders under a name
 * its folder does not have, which is the exact disagreement titles exist to
 * prevent.
 *
 * Extracted rather than inlined: inline it tipped `renameProjectCore` to
 * complexity 26 and seven levels of nesting, over this project's limits of 25
 * and 5.
 *
 * @param context - handler context, for the logger
 * @param project - the in-memory project to restore (mutated back in place)
 * @param names - what it was, and where it was moved to
 * @returns true when the project is back as it was; false when it is not, which
 *   the caller must surface — it is the one state a user cannot infer from the UI
 */
async function rollbackRename(
    context: HandlerContext,
    project: Project,
    names: {
        oldName: string;
        oldTitle: string | undefined;
        oldPath: string;
        newPath: string;
        newTitle: string;
    },
): Promise<boolean> {
    const { oldName, oldTitle, oldPath, newPath, newTitle } = names;
    try {
        await fsPromises.rename(newPath, oldPath);
        project.path = oldPath;
        project.name = oldName;
        project.title = oldTitle;
        restoreComponentPaths(project, newPath, oldPath);
        context.logger.warn(
            `[Rename] Save failed for "${newTitle}" — rolled the folder back to ` +
                `"${oldName}". The project is unchanged.`,
        );
        return true;
    } catch (rollbackError) {
        context.logger.error(
            `[Rename] Save failed AND rollback failed for "${newTitle}". The folder is ` +
                `at "${newPath}" but the manifest still says "${oldName}". ` +
                (rollbackError instanceof Error ? rollbackError.message : String(rollbackError)),
        );
        return false;
    }
}

/**
 * Re-point every component path from one project root to another.
 *
 * @param project - the project whose componentInstances to rewrite
 * @param from - the root they currently sit under
 * @param to - the root they should sit under
 */
function restoreComponentPaths(project: Project, from: string, to: string): void {
    if (!project.componentInstances) {
        return;
    }
    for (const componentId of Object.keys(project.componentInstances)) {
        const component = project.componentInstances[componentId];
        if (component.path?.startsWith(from)) {
            component.path = component.path.replace(from, to);
        }
    }
}
