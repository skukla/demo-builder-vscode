/**
 * The target project of a `{ projectPath }` payload, for the projects list's
 * handlers. Split from `dashboardHandlers.ts` (EDS-8, 2026-10-05) when its
 * callers moved into files by job.
 *
 * @module features/projects-dashboard/handlers/projectFromPath
 */

import { validateProjectPath } from '@/core/validation/PathSafetyValidator';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

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

/**
 * A handler that runs only once its `{ projectPath }` payload names a project:
 * the resolve, the early return on failure and the unwrap that five handlers
 * each opened with (PL-69 pairs 15 to 17, 2026-10-09).
 *
 * Not for a handler whose try/catch must also cover the load (delete, edit):
 * there a load that throws answers with that handler's own failure message,
 * and wrapping would move the load outside the catch.
 */
export function withProjectFromPath<P extends { projectPath?: string }>(
    run: (context: HandlerContext, project: Project, payload?: P) => Promise<HandlerResponse>,
): MessageHandler<P> {
    return async (context, payload) => {
        const resolved = await resolveProjectFromPath(context, payload);
        if (!resolved.ok) {
            return resolved.error;
        }
        return run(context, resolved.project, payload);
    };
}
