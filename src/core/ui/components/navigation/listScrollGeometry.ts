/**
 * listScrollGeometry — the numbers behind "scroll the selected row into view" in a
 * VIRTUALIZED list.
 *
 * Split out of {@link SearchableList} because the numbers were the whole bug. The
 * effect assumed a flat 40px row, but a row carrying a description renders ~66px,
 * so on a 726-project list the scroll landed roughly 40% short of the selected
 * project — reliably off-screen, which read as "it doesn't scroll to it at all".
 *
 * Row heights VARY WITHIN ONE LIST (description or not), so no single constant can
 * be right. The strategy this module serves is therefore two-phase:
 *
 *  1. **Estimate** from a MEASURED row and jump there instantly. The target row is
 *     not in the DOM yet — virtualization only renders what is near the viewport —
 *     so there is nothing exact to aim at.
 *  2. **Correct** against the row itself once that jump rendered it, using measured
 *     rectangles. Repeat while it keeps improving (a bad estimate can land in a
 *     stretch of differently-sized rows), which converges in a pass or two.
 *
 * `useAutoScroll` does not fit here: it needs a ref per item, and a virtualized list
 * has no element for the row it is being asked to scroll to.
 *
 * @module core/ui/components/navigation/listScrollGeometry
 */

/** Row height assumed only until a real row can be measured. */
export const FALLBACK_ROW_HEIGHT = 40;

/**
 * The longest jump still worth animating.
 *
 * A smooth scroll across 700 rows is tens of thousands of pixels — seconds of
 * streaming blur that says nothing about where the selection is, and is unpleasant
 * to watch. Past this we cut instantly and let the final short correction be the
 * part that animates, so the motion the user sees is always a brief, legible one.
 */
export const SMOOTH_SCROLL_MAX_DISTANCE = 600;

/** How many correct-and-remeasure passes before settling for what we have. */
export const MAX_CORRECTION_PASSES = 3;

/** Within this many pixels of centred, stop correcting — further passes just jitter. */
export const CENTERED_TOLERANCE = 2;

/**
 * Animate a short move, cut a long one.
 *
 * @param distance - Pixels the scroll position is about to travel (sign ignored)
 * @returns The scroll behavior to use
 */
export function scrollBehaviorForDistance(distance: number): ScrollBehavior {
    return Math.abs(distance) <= SMOOTH_SCROLL_MAX_DISTANCE ? 'smooth' : 'auto';
}

/**
 * Where to scroll to centre row `index`, assuming every row is `rowHeight` tall.
 *
 * Only ever an approximation — it is what gets the row RENDERED so
 * {@link centeredScrollTopFromRects} can be exact about it.
 *
 * @param index - Row index within the currently filtered items
 * @param rowHeight - Measured height of a rendered row
 * @param viewportHeight - Visible height of the scroll container
 * @returns A non-negative scrollTop
 */
export function estimateCenteredScrollTop(
    index: number,
    rowHeight: number,
    viewportHeight: number,
): number {
    return Math.max(0, index * rowHeight - viewportHeight / 2 + rowHeight / 2);
}

/**
 * Where to scroll to centre a row that IS rendered, from measured rectangles.
 *
 * Rectangles rather than `offsetTop`: a virtualized row is absolutely positioned
 * inside the list's own content layer, so its `offsetParent` is not dependably the
 * element that scrolls. Viewport-relative deltas hold whatever the offset ancestry.
 *
 * @param scrollTop - The scroll container's current scrollTop
 * @param rowTop - The row's viewport-relative top (`getBoundingClientRect().top`)
 * @param rowHeight - The row's rendered height
 * @param viewportTop - The scroll container's viewport-relative top
 * @param viewportHeight - The scroll container's visible height
 * @returns A non-negative scrollTop that centres the row
 */
export function centeredScrollTopFromRects(
    scrollTop: number,
    rowTop: number,
    rowHeight: number,
    viewportTop: number,
    viewportHeight: number,
): number {
    const offsetWithinViewport = rowTop - viewportTop;
    const centeredOffset = (viewportHeight - rowHeight) / 2;
    return Math.max(0, scrollTop + offsetWithinViewport - centeredOffset);
}
