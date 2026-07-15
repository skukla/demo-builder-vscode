/**
 * Edit Draft Handlers
 *
 * Webview→extension handlers for persisting a reversible per-project edit draft.
 * They wrap the {@link editDraftStore} over the ExtensionContext globalState
 * Memento. Following the shaped-return pattern (see mesh subscribeHandler), they
 * NEVER throw — a missing projectPath yields `{ success: false, error }` and
 * performs no write.
 *
 * @module features/project-creation/handlers/editDraftHandlers
 */

import { clearEditDraft, saveEditDraft } from '../services/editDraftStore';
import type { HandlerContext } from '@/commands/handlers/HandlerContext';
import type { EditDraft } from '@/types/webview';

/** Shaped result returned by both edit-draft handlers. */
interface EditDraftResult {
    success: boolean;
    error?: string;
}

const MISSING_PROJECT_PATH: EditDraftResult = {
    success: false,
    error: 'Missing projectPath',
};

/**
 * Handler: save-edit-draft
 *
 * Persists the provided draft (or an empty draft) for the given project path.
 */
export async function handleSaveEditDraft(
    context: HandlerContext,
    payload?: { projectPath?: string; draft?: EditDraft },
): Promise<EditDraftResult> {
    const projectPath = payload?.projectPath;
    if (!projectPath) {
        return MISSING_PROJECT_PATH;
    }

    // A draft is a partial slice at runtime (pickEditDraft omits undefined keys);
    // the empty-draft fallback is cast to satisfy EditDraft's required key.
    await saveEditDraft(context.context.globalState, projectPath, payload?.draft ?? ({} as EditDraft));
    return { success: true };
}

/**
 * Handler: clear-edit-draft
 *
 * Removes the saved draft for the given project path.
 */
export async function handleClearEditDraft(
    context: HandlerContext,
    payload?: { projectPath?: string },
): Promise<EditDraftResult> {
    const projectPath = payload?.projectPath;
    if (!projectPath) {
        return MISSING_PROJECT_PATH;
    }

    await clearEditDraft(context.context.globalState, projectPath);
    return { success: true };
}
