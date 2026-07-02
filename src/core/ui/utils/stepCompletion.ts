/**
 * Generic step-completion list helpers.
 *
 * "Completed" means the user pressed Continue PAST a step — a merely-valid form
 * does not count. Forward advance appends the step; backward navigation removes the
 * target step and everything after it (so re-advancing re-commits). Shared by the
 * main wizard timeline (`completedSteps` over WIZARD_STEPS) and the Commerce
 * sub-steps (`committedCommerceSteps` over the Commerce section ids) so both levels
 * use one mechanism instead of parallel copies.
 *
 * @module core/ui/utils/stepCompletion
 */

/**
 * Append `id` to the completed list, deduped — the forward "mark complete" applied
 * when the user advances past a step.
 *
 * @param completed - Current completed ids (undefined → none yet)
 * @param id - The step just advanced past
 * @returns a new list including `id`
 */
export function markStepCompleted<T>(completed: T[] | undefined, id: T): T[] {
    const list = completed ?? [];
    return list.includes(id) ? list : [...list, id];
}

/**
 * On backward navigation to `target`, drop `target` and every step AFTER it,
 * keeping only those before it — so the step navigated back to (and later ones)
 * un-complete until re-advanced. Navigating to the first step (index 0) clears all.
 *
 * @param completed - Current completed ids (undefined → none yet)
 * @param order - The ordered ids that define "after"
 * @param target - The id navigated back to
 * @param targetIndex - `order` index of `target`
 * @returns a new, filtered list
 */
export function clearCompletedFrom<T>(
    completed: T[] | undefined,
    order: T[],
    target: T,
    targetIndex: number,
): T[] {
    const list = completed ?? [];
    if (targetIndex === 0) return [];
    return list.filter(id => id !== target && order.indexOf(id) < targetIndex);
}
