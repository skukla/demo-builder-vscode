/**
 * The setup guide's buttons (AB-26x, AB-77, AB-82): the shown step's Apply and Undo, Mark as
 * done and Open Commerce Admin in the footer; which steps the check covers, and which steps Apply all
 * applies, for the buttons under the list. Split out of `SetupGuideModal.tsx` (2026-10-26),
 * which keeps the dialog and which step is shown.
 *
 * Check all steps moved from the footer to under the list on 2026-10-28 (release test row
 * 4.19: six actions on screen at once). It acts on the whole list, as Apply all does, so the
 * two sit together and the footer keeps only what acts on the shown step.
 *
 * @module features/dashboard/ui/components/integrations/setupGuideFooter
 */

import { isLeftToDo } from '@/core/ui/components/integrations/setupLeftToDo';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** The fix buttons' words, in one place. */
export const FIX_COPY = {
    fix: 'Apply This Step',
    undo: 'Undo This Step',
    all: (count: number) => `Apply All (${count})`,
};

/**
 * The steps Apply all applies: every one still to do that Demo Builder can apply. Not an
 * optional one: only some demos want it, and card payments needs a PayPal sandbox first, so
 * an optional step is applied on its own, by choice.
 */
function readyToApply(items: SetupChecklistItem[]): SetupChecklistItem[] {
    return items.filter((item) => isLeftToDo(item) && item.applicable);
}

export interface FooterInput {
    item: SetupChecklistItem | undefined;
    busy: boolean;
    setDone: () => void;
    openAdmin: () => void;
    /** The Admin is opening: Chrome takes two or three seconds to show its window. */
    openingAdmin?: boolean;
    /** The step's fix or its undo, when the guide offers one. */
    fix?: (mode: 'apply' | 'undo') => void;
}

/**
 * Apply on an open step Demo Builder can do; Undo on one it applied and recorded (AB-77). A step
 * saved done shows no Apply (owner, 2026-10-22): the guide checks never-checked steps as it
 * opens, so done is fresh enough, and Check all steps reopens a stale one. Nothing for a step
 * with no fix, a skipped step, or when the screen offers none.
 */
function fixButtons(item: SetupChecklistItem, fix: FooterInput['fix'], busy: boolean): ActionButton[] {
    if (!item.fix || !fix || item.state === 'dismissed') return [];
    const apply: ActionButton = { label: FIX_COPY.fix, variant: 'secondary', onPress: () => fix('apply'), isDisabled: busy };
    const undo: ActionButton = { label: FIX_COPY.undo, variant: 'secondary', onPress: () => fix('undo'), isDisabled: busy };
    if (item.state === 'done') return item.fixApplied ? [undo] : [];
    return item.fixApplied ? [apply, undo] : [apply];
}

/** The steps a check run covers, in list order: every checkable one not skipped. */
export function checkableIds(items: SetupChecklistItem[]): string[] {
    return items.filter((item) => item.checkable && item.state !== 'dismissed').map((item) => item.id);
}

/**
 * Apply all, when it would do more than the shown step's own Apply: hidden when the one step
 * left is the one on view, where it was a second button for the same thing (row 4.19).
 */
export function applyAllIds(items: SetupChecklistItem[], shownId: string | undefined): string[] {
    const ready = readyToApply(items).map((item) => item.id);
    return ready.length === 1 && ready[0] === shownId ? [] : ready;
}

/**
 * The footer's buttons for the shown step, after Close: the one that settles it, then Open
 * Commerce Admin as the main action. Demo Builder checks a step when it can (Check all steps,
 * under the list); otherwise the SC says it is done. A skipped or finished step the SC cannot
 * check has nothing to settle.
 */
export function footerButtons({ item, busy, setDone, openAdmin, openingAdmin, fix }: FooterInput): ActionButton[] {
    const open: ActionButton = { label: 'Open Commerce Admin', variant: 'accent', onPress: openAdmin, isPending: openingAdmin };
    if (!item) return [open];
    if (item.checkable && item.state !== 'dismissed') return [...fixButtons(item, fix, busy), open];
    if (item.state === 'open') {
        return [{ label: 'Mark as Done', variant: 'secondary', onPress: setDone, isDisabled: busy }, open];
    }
    return [open];
}

export interface ListActionsInput {
    /** Check every step Demo Builder can check; absent when none can be. */
    checkAll?: () => void;
    /** Apply every step ready to apply; absent when none is. */
    applyAll?: { count: number; run: () => void } | undefined;
    busy: boolean;
    /** A pressed Check All Steps is waiting on the Commerce sign-in the guide started. */
    waitsOnSignIn: boolean;
}

/**
 * What acts on the step list as a whole (AB-82), for the footer's start under the list: in the
 * body it was clipped once the steps ran past the dialog's height (owner, 2026-11-03).
 *
 * No "Checking 2 of 5" (owner, 2026-10-31): the list marks the step being checked and the open
 * step's banner shows its spinner, so Check All Steps only stops taking presses. A run waiting on
 * the Commerce sign-in moves nothing else, so the button shows its own spinner then.
 *
 * @param input - the two actions, when they apply, and how the guide stands
 * @returns the buttons, Check All Steps first
 */
export function listActionButtons({ checkAll, applyAll, busy, waitsOnSignIn }: ListActionsInput): ActionButton[] {
    const buttons: ActionButton[] = [];
    if (checkAll) {
        buttons.push({
            label: 'Check All Steps',
            variant: 'secondary',
            onPress: checkAll,
            isDisabled: busy && !waitsOnSignIn,
            isPending: waitsOnSignIn,
        });
    }
    if (applyAll) {
        buttons.push({ label: FIX_COPY.all(applyAll.count), variant: 'secondary', onPress: applyAll.run, isDisabled: busy });
    }
    return buttons;
}
