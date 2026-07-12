/**
 * Refresh Block Library Handler
 *
 * Handles the `refresh-block-library` message: the headless entry behind the
 * `refresh_block_library` MCP tool. Resolves the current project and runs the
 * shared {@link refreshBlockLibraryHeadless} core with NO UI callbacks, then
 * returns the ACTUAL rebuild result (not merely "dispatched"). The dashboard
 * kebab goes through `RefreshBlockLibraryCommand` (same core, with progress
 * notification + toasts) — this is the agent-facing path.
 */

import { refreshBlockLibraryHeadless } from '@/features/eds/services/refreshBlockLibraryHeadless';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

/**
 * Handle 'refresh-block-library' — rebuild the current EDS project's DA.live
 * authoring library from its component-definition.json.
 */
export const handleRefreshBlockLibraryHeadless: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project loaded', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    if (!isEdsProject(project)) {
        return {
            success: false,
            error: 'Block library refresh applies to EDS projects only',
            code: ErrorCode.INVALID_OPERATION,
        };
    }

    const result = await refreshBlockLibraryHeadless({
        project,
        context: context.context,
        logger: context.logger,
    });

    if (result.success) {
        return { success: true, data: { libraryPaths: result.libraryPaths ?? [] } };
    }
    return { success: false, error: result.error || 'Block library refresh failed' };
};
