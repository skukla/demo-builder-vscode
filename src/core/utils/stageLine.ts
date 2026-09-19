/**
 * An operation's stage as the SC reads it: "Deploying the app", with the pair count
 * after it when the operation deploys two things — "Deploying the app (1 of 2)".
 *
 * One formatter for both places the stage shows, the progress modal (webview) and
 * the notification it hands over to (extension), so the two cannot word it
 * differently. vscode-free for that reason.
 *
 * @module core/utils/stageLine
 */

import type { OperationPosition } from '@/types/webviewPayloads';

/**
 * @param stage - the stage name
 * @param position - which member of a pair, when there is one
 * @returns the line to show
 */
export function stageLine(stage: string, position?: OperationPosition): string {
    return position ? `${stage} (${position.index} of ${position.total})` : stage;
}
