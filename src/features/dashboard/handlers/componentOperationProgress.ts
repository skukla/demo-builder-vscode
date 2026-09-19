/**
 * The progress of each integration operation an SC started from the integrations
 * screen, pushed to that screen's modal and held so the modal can ask again (PL-59).
 *
 * WHY IT IS HELD. A push reaches only a panel that is open at that moment. An SC who
 * chose "Run in background", reopened the panel, or clicked the tile again mid-deploy
 * would otherwise see nothing until the next step happened to fire — which, for a
 * one-minute `aio app deploy`, reads as a frozen screen. The latest payload per id is
 * the answer to "where is it now?".
 *
 * A successful run is forgotten: the modal closes itself on success and the tile holds
 * the result. A failure is kept until the next run of that integration starts, so a
 * modal reopened after "Run in background" still shows the reason.
 *
 * @module features/dashboard/handlers/componentOperationProgress
 */

import {
    closeBackgroundNotice,
    forwardToBackgroundNotice,
    openBackgroundNotice,
} from './operationBackgroundNotice';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerResponse, MessageHandler } from '@/types/handlers';
import { toError } from '@/types/typeGuards';
import type { ComponentOperationProgressPayload } from '@/types/webviewPayloads';

const latest = new Map<string, ComponentOperationProgressPayload>();

/**
 * Record an operation's progress and push it to the live project panel.
 *
 * @param payload - the operation's current state
 */
export async function pushComponentOperationProgress(
    payload: ComponentOperationProgressPayload,
): Promise<void> {
    if (payload.state === 'succeeded') {
        latest.delete(payload.id);
    } else {
        latest.set(payload.id, payload);
    }
    forwardToBackgroundNotice(payload);
    // Lazy, as postRowStatus is: keeps the webview-command class out of the
    // handler module's load graph.
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    await ProjectDashboardWebviewCommand.sendComponentOperationProgress(payload);
}

/**
 * Wrap an operation handler so the modal that started it always gets an end.
 *
 * The progress inside `withComponentProgress` covers the operation itself. It cannot
 * cover what a handler refuses BEFORE reaching it — an unknown id, an integration
 * already added, one not deployed yet — and a modal told nothing would sit on
 * "Starting" forever. So a modal-hosted run is marked running here, before the
 * handler does anything (which also replaces a previous run's failure, so a Retry
 * never shows the old reason), and when the handler returns or throws without having
 * sent an end, its own answer is sent as one.
 *
 * @param handler - the operation handler
 * @param idOf - the integration id this request acts on, as the webview named it
 * @returns the same handler, with the modal's end guaranteed
 */
export function narrateOutcomeToModal<P extends { progress?: 'modal' }>(
    handler: MessageHandler<P>,
    idOf: (payload: P) => string | undefined,
): MessageHandler<P> {
    return async (context, payload) => {
        const id = payload?.progress === 'modal' ? idOf(payload) : undefined;
        if (!id) return handler(context, payload);

        await pushComponentOperationProgress({ id, state: 'running' });
        try {
            const result = await handler(context, payload);
            if (latest.get(id)?.state === 'running') {
                await pushComponentOperationProgress(
                    result.success
                        ? { id, state: 'succeeded' }
                        : { id, state: 'failed', error: result.error ?? 'The operation did not finish.' },
                );
            }
            return result;
        } catch (error) {
            // The thrown text is for the logs, not the SC (the user-facing-errors rule).
            context.logger.error(`[Operation] ${id} stopped`, toError(error));
            await pushComponentOperationProgress({
                id,
                state: 'failed',
                error: 'The operation stopped unexpectedly. Details are in Debug Logs.',
            });
            throw error;
        }
    };
}

/**
 * Where an operation's steps go, from its request: `'modal'` when the SC started it
 * on the integrations screen, otherwise the notification.
 */
export function progressSurfaceOf(payload?: { progress?: 'modal' }): 'modal' | undefined {
    return payload?.progress;
}

/**
 * Handle `getComponentOperationProgress` — the latest progress for one integration,
 * or `null` when nothing is running or failed for it. Only a REOPENED modal asks, so
 * this is also where the modal takes the operation back from its notification.
 */
export const handleGetComponentOperationProgress: MessageHandler<{ id?: string }> = async (
    _context,
    payload,
): Promise<HandlerResponse> => {
    const id = payload?.id;
    if (id) closeBackgroundNotice(id);
    return { success: true, data: id ? latest.get(id) ?? null : null };
};

/** Longest title a background notice takes — the modal's own title, never prose. */
const MAX_TITLE = 200;

/**
 * Handle `backgroundComponentOperation` — the SC chose "Run in background": carry the
 * operation on in a progress notification (see operationBackgroundNotice). Nothing
 * opens for an operation that has already ended.
 */
export const handleBackgroundComponentOperation: MessageHandler<{ id?: string; title?: string }> = async (
    _context,
    payload,
): Promise<HandlerResponse> => {
    const id = payload?.id;
    const title = payload?.title?.trim();
    if (!id || !title || title.length > MAX_TITLE) {
        return { success: false, error: 'An operation id and title are required.', code: ErrorCode.INVALID_OPERATION };
    }
    const current = latest.get(id);
    if (current?.state === 'running') {
        openBackgroundNotice(title, current, () => latest.get(id)?.state === 'running');
    }
    return { success: true };
};
