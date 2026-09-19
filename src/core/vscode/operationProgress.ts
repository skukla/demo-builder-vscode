/**
 * The progress of each operation an SC started from a button on a screen, pushed to
 * that screen's progress modal and held so the modal can ask again (PL-59).
 *
 * WHERE IT GOES. To the screen that started the operation: the request's own
 * `sendMessage` is recorded when the run begins, and a screen that reopens mid-run
 * takes over when it asks for the latest state. Not "whichever project screen is
 * open" — the projects list starts operations too, and it is not a project screen.
 *
 * Shared by every screen's handler map (dashboard, integrations, projects list), which
 * is why it lives in core: one feature may not import another.
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
 * @module core/vscode/operationProgress
 */

import {
    closeBackgroundNotice,
    forwardToBackgroundNotice,
    openBackgroundNotice,
} from './operationBackgroundNotice';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import { toError } from '@/types/typeGuards';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

/** How to reach the screen showing an operation's modal. */
type SendToScreen = HandlerContext['sendMessage'];

const latest = new Map<string, OperationProgressPayload>();
const screens = new Map<string, SendToScreen>();

/**
 * Begin a modal-hosted run: from here on, this operation's progress goes to `send`.
 * `narrateOutcomeToModal` calls it for every modal request; a test that drives the
 * progress directly calls it too.
 */
export function startModalRun(id: string, send: SendToScreen): void {
    screens.set(id, send);
}

/**
 * Record an operation's progress and push it to the screen showing its modal.
 *
 * @param payload - the operation's current state
 */
export async function pushOperationProgress(
    payload: OperationProgressPayload,
): Promise<void> {
    if (payload.state === 'succeeded') {
        latest.delete(payload.id);
    } else {
        latest.set(payload.id, payload);
    }
    forwardToBackgroundNotice(payload);
    const send = screens.get(payload.id);
    // A screen closed mid-run cannot be reached; the held state answers it on reopen.
    // Never the operation's problem: a send that throws, synchronously or not, is
    // swallowed here rather than failing the work it reports on.
    try {
        await send?.('operationProgress', payload);
    } catch {
        // See above.
    }
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

        startModalRun(id, context.sendMessage);
        await pushOperationProgress({ id, state: 'running' });
        try {
            const result = await handler(context, payload);
            if (latest.get(id)?.state === 'running') {
                await pushOperationProgress(
                    result.success
                        ? { id, state: 'succeeded' }
                        : { id, state: 'failed', error: result.error ?? 'The operation did not finish.' },
                );
            }
            return result;
        } catch (error) {
            // The thrown text is for the logs, not the SC (the user-facing-errors rule).
            context.logger.error(`[Operation] ${id} stopped`, toError(error));
            await pushOperationProgress({
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
 * from a button on a screen, otherwise the notification.
 */
export function progressSurfaceOf(payload?: { progress?: 'modal' }): 'modal' | undefined {
    return payload?.progress;
}

/**
 * Handle `getOperationProgress` — the latest progress for one operation, or `null`
 * when nothing is running or failed for it. Only a REOPENED modal asks, so this is
 * also where the modal takes the operation back from its notification, and where a
 * reopened screen becomes the one its further progress goes to.
 */
export const handleGetOperationProgress: MessageHandler<{ id?: string }> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const id = payload?.id;
    if (!id) return { success: true, data: null };
    closeBackgroundNotice(id);
    if (latest.get(id)?.state === 'running') screens.set(id, context.sendMessage);
    return { success: true, data: latest.get(id) ?? null };
};

/** Longest title a background notice takes — the modal's own title, never prose. */
const MAX_TITLE = 200;

/**
 * Handle `backgroundOperation` — the SC chose "Run in background": carry the
 * operation on in a progress notification (see operationBackgroundNotice). Nothing
 * opens for an operation that has already ended.
 */
export const handleBackgroundOperation: MessageHandler<{ id?: string; title?: string }> = async (
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
