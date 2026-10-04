/**
 * The target project of a `{ projectPath }` payload, for the projects list's
 * handlers. Split from `dashboardHandlers.ts` (EDS-8, 2026-10-05) when its
 * callers moved into files by job.
 *
 * @module features/projects-dashboard/handlers/projectFromPath
 */

import { validateProjectPath } from '@/core/validation/PathSafetyValidator';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/**
 * Resolve the target project from a `{ projectPath }` payload WITHOUT touching
 * the current-project pointer: required-path check, the projects-directory
 * security validation, and a non-persisting load.
 *
 * One home for what was the same prologue in seven handlers (2026-08-27 dedup
 * sweep, PL-8 item 2). `handleSelectProject` deliberately does NOT use it —
 * selecting persists the loaded project as the pointer, which is the one
 * behavior this helper exists to not have.
 */
export async function resolveProjectFromPath(
    context: HandlerContext,
    payload: { projectPath?: string } | undefined,
): Promise<{ ok: true; project: Project } | { ok: false; error: HandlerResponse }> {
    if (!payload?.projectPath) {
        return { ok: false, error: { success: false, error: 'Project path is required' } };
    }
    // SECURITY: Validate path is within demo-builder projects directory
    try {
        validateProjectPath(payload.projectPath);
    } catch {
        return { ok: false, error: { success: false, error: 'Invalid project path' } };
    }
    const project = await context.stateManager.loadProjectFromPath(payload.projectPath, undefined, {
        persistAfterLoad: false,
    });
    if (!project) {
        return { ok: false, error: { success: false, error: 'Project not found' } };
    }
    return { ok: true, project };
}
