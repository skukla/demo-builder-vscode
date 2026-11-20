/**
 * A paused run's question as buttons, for every window that asks one (the progress window, the
 * datapack run window): the close button and the answers beside it.
 *
 * The close button answers "nothing chosen", so it carries the question's own dismiss answer when
 * it has one ("Skip for Now") and Cancel otherwise, and that answer is not drawn a second time
 * among the others. Two buttons that both dismiss read as two different choices (owner,
 * 2026-10-30); the datapack window drew Skip for Now beside Cancel (owner walk, 2026-11-16).
 *
 * @module core/ui/utils/promptButtons
 */

import type { OperationPrompt } from '@/types/webviewPayloads';

const CANCEL = 'Cancel';

/** The close button's label while the question is asked. */
export function promptCloseLabel(prompt: Pick<OperationPrompt, 'dismiss'>): string {
    return prompt.dismiss ?? CANCEL;
}

/** The answers drawn beside it, in the guard's order: neither Cancel nor the dismiss answer. */
export function promptAnswerLabels(prompt: Pick<OperationPrompt, 'actions' | 'dismiss'>): string[] {
    return prompt.actions.filter((label) => label !== CANCEL && label !== prompt.dismiss);
}
