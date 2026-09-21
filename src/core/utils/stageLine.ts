/**
 * An operation's stage as the SC reads it: "Deploying the app", with the part it is
 * on when it works through several — named when the part has a name ("Deploying the
 * app · Northwind ERP"), else counted ("Importing the data (3 of 5)").
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
    if (!position) return stage;
    return position.name ? `${stage} · ${position.name}` : `${stage} (${position.index} of ${position.total})`;
}
