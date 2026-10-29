/**
 * Which demo setup steps are still to do (AB-26x): open, and not optional. An optional step
 * (card payments, 2026-10-02) is only for some demos, so while it is open it counts in no
 * "steps left", names no "Next" and is not where the guide opens. It is still listed, and
 * can still be checked, marked done or skipped.
 *
 * Plain TypeScript, no React: the card's status line, the flyout, the guide and the
 * checklist service all ask the same question, and the service also runs in the extension.
 *
 * @module core/ui/components/integrations/setupLeftToDo
 */

import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/**
 * @param item - one step of the checklist
 * @returns true when the step is open and every demo needs it
 */
export function isLeftToDo(item: SetupChecklistItem): boolean {
    return item.state === 'open' && !item.optional;
}
