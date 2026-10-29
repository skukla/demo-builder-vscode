/**
 * An operation's three progress lines as the SC reads them: the stage (line 1), what
 * it is doing now (line 2), and what to expect with the run's clock (line 3).
 *
 * Line 1 carries the step's place in the run when the run's steps are known up front
 * ("Copying the content (4 of 9)"), or the member of a pair it is on ("Deploying the
 * app · Northwind ERP"). Never a count of items: that is the line under it.
 *
 * One formatter for every place a stage shows, the progress modal and the wizard's
 * creation and storefront-setup screens (webview) and the notification it hands over
 * to (extension), so none can word it differently. vscode-free for that reason.
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

/**
 * The line under a stage. When the stage IS the job reporting ("Copying the content"
 * over "Copying the content: 40 of 103 files"), it is only what follows the name: the
 * name shows once (progress vocabulary, owner 2026-10-16).
 *
 * @param stage - the stage on line 1
 * @param step - what the work said it is doing
 * @returns the line to show, or undefined when it would only repeat the stage, so the
 *   caller shows the stage's detail instead
 */
export function stepUnder(stage: string, step: string | undefined): string | undefined {
    if (!step || step === stage) return undefined;
    const prefix = `${stage}: `;
    return step.startsWith(prefix) ? step.slice(prefix.length) : step;
}

/**
 * Line 3: what to expect, and how long the whole run has been going. Never empty: the
 * row holds its height whether or not either is known, so the display does not resize
 * as stages come and go. The middle dot between the two is deliberate, the one place
 * this UI joins two phrases with one (owner, 2026-10-16; handbook, progress).
 *
 * @param expectation - the stage's expectation from the stage table
 * @param clock - how long the run has been going ("2 minutes, 40 seconds")
 * @returns the line to show
 */
export function expectationLine(expectation?: string, clock?: string): string {
    const parts = [expectation, clock].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : ' ';
}
