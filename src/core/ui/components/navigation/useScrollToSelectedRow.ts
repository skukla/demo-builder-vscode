/**
 * useScrollToSelectedRow — bring a virtualized list's selected row into view.
 *
 * The DOM half of the two-phase strategy described in
 * {@link module:core/ui/components/navigation/listScrollGeometry}: estimate from a
 * measured row and jump there instantly so virtualization renders the target, then
 * correct against the row's own rectangle.
 *
 * Lives beside {@link SearchableList} rather than in `core/ui/hooks/` because it is
 * specific to a Spectrum `ListView`'s DOM (its `[role="row"]` / `data-key`
 * attributes) — the shared hooks directory is for host-agnostic behaviour.
 *
 * @module core/ui/components/navigation/useScrollToSelectedRow
 */

import { useEffect, useRef, type RefObject } from 'react';
import {
    CENTERED_TOLERANCE,
    FALLBACK_ROW_HEIGHT,
    MAX_CORRECTION_PASSES,
    centeredScrollTopFromRects,
    estimateCenteredScrollTop,
    scrollBehaviorForDistance,
} from './listScrollGeometry';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

/** Escape a key for use in a CSS attribute selector (ids can carry punctuation). */
function escapeKey(key: string): string {
    return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(key)
        : key.replace(/["\\]/g, '\\$&');
}

/**
 * The element that actually scrolls — the ListView's grid, or its parent when the
 * grid itself is not the overflow owner.
 */
function findScrollable(root: HTMLElement): HTMLElement | null {
    const grid = root.querySelector('[role="grid"]') as HTMLElement | null;
    if (grid && grid.scrollHeight > grid.clientHeight) return grid;
    const parent = grid?.parentElement;
    if (parent && parent.scrollHeight > parent.clientHeight) return parent;
    return null;
}

/** The selected row, if virtualization has it rendered right now. */
function findSelectedRow(root: HTMLElement, selectedId: string): HTMLElement | null {
    const byKey = root.querySelector<HTMLElement>(
        `[role="row"][data-key="${escapeKey(selectedId)}"]`,
    );
    return byKey ?? root.querySelector<HTMLElement>('[role="row"][aria-selected="true"]');
}

/**
 * A real row's height. Any rendered row beats the constant — rows differ, but every
 * one of them is closer to the truth than a guess made when this code was written.
 */
function measureRowHeight(root: HTMLElement): number {
    const row = root.querySelector<HTMLElement>('[role="row"]');
    const height = row?.getBoundingClientRect().height ?? 0;
    return height > 0 ? height : FALLBACK_ROW_HEIGHT;
}

/** Centre a rendered row exactly; returns false when it was already centred. */
function centerRenderedRow(scroller: HTMLElement, row: HTMLElement): boolean {
    const rowRect = row.getBoundingClientRect();
    const viewRect = scroller.getBoundingClientRect();
    const target = centeredScrollTopFromRects(
        scroller.scrollTop,
        rowRect.top,
        rowRect.height,
        viewRect.top,
        viewRect.height,
    );
    const distance = target - scroller.scrollTop;
    if (Math.abs(distance) <= CENTERED_TOLERANCE) return false;
    scroller.scrollTo({ top: target, behavior: scrollBehaviorForDistance(distance) });
    return true;
}

export interface UseScrollToSelectedRowOptions {
    /** Container wrapping the ListView (the search header must stay outside it). */
    containerRef: RefObject<HTMLElement | null>;
    /** The selected item's id, or undefined when nothing is selected. */
    selectedId: string | undefined;
    /** Index of the selected item within the CURRENTLY filtered items, or -1. */
    selectedIndex: number;
    /** Whether the list currently has rows to scroll through. */
    hasItems: boolean;
}

/**
 * Scroll the selected row to the middle of the list when the selection changes or
 * when rows first arrive.
 *
 * @param options - Container ref, the selection, and whether rows exist yet
 */
export function useScrollToSelectedRow({
    containerRef,
    selectedId,
    selectedIndex,
    hasItems,
}: UseScrollToSelectedRowOptions): void {
    // Read inside the async passes without making them a dependency: the index moves
    // as the user filters, and re-running the effect for that would fight the typing.
    const selectedIndexRef = useRef(selectedIndex);
    selectedIndexRef.current = selectedIndex;

    // "id:hasItems" — re-attempting when data ARRIVES is the point, so a scroll
    // attempted against an empty list must not count as handled.
    const handledRef = useRef<string | null>(null);

    useEffect(() => {
        if (!selectedId) {
            handledRef.current = null;
            return;
        }
        const attempt = `${selectedId}:${hasItems}`;
        if (handledRef.current === attempt || !hasItems) return;
        handledRef.current = attempt;

        let cancelled = false;
        let frame = 0;

        const pass = (attemptsLeft: number): void => {
            const container = containerRef.current;
            if (cancelled || !container) return;
            const scroller = findScrollable(container);
            if (!scroller) return;

            const row = findSelectedRow(container, selectedId);
            if (row) {
                // Rendered: correct exactly. A correction that MOVED the list may have
                // scrolled a differently-sized stretch into place, so re-check once more.
                const moved = centerRenderedRow(scroller, row);
                if (moved && attemptsLeft > 0) {
                    frame = requestAnimationFrame(() => pass(attemptsLeft - 1));
                }
                return;
            }

            // Not rendered: jump to the best estimate we can make so it becomes
            // rendered, then correct on the next frame. Instant — this is the long
            // move, and animating it is the "endless scroll" nobody wants to watch.
            if (attemptsLeft <= 0 || selectedIndexRef.current === -1) return;
            scroller.scrollTo({
                top: estimateCenteredScrollTop(
                    selectedIndexRef.current,
                    measureRowHeight(container),
                    scroller.clientHeight,
                ),
                behavior: 'auto',
            });
            frame = requestAnimationFrame(() => pass(attemptsLeft - 1));
        };

        const timer = setTimeout(
            () => pass(MAX_CORRECTION_PASSES),
            FRONTEND_TIMEOUTS.SCROLL_SETTLE,
        );

        return () => {
            cancelled = true;
            clearTimeout(timer);
            cancelAnimationFrame(frame);
        };
    }, [selectedId, hasItems, containerRef]);
}
