/**
 * listScrollGeometry Tests
 *
 * The numbers behind "scroll the selected row into view" in a virtualized list.
 * Pinned here because they were the bug: a hardcoded 40px row assumption put the
 * selected project ~40% short of its actual position in a 726-row list, and a
 * smooth scroll across that distance was an unwatchable blur.
 */

import {
    CENTERED_TOLERANCE,
    FALLBACK_ROW_HEIGHT,
    MAX_CORRECTION_PASSES,
    SMOOTH_SCROLL_MAX_DISTANCE,
    centeredScrollTopFromRects,
    estimateCenteredScrollTop,
    scrollBehaviorForDistance,
} from '@/core/ui/components/navigation/listScrollGeometry';

describe('scrollBehaviorForDistance', () => {
    it('animates a short move', () => {
        expect(scrollBehaviorForDistance(120)).toBe('smooth');
    });

    it('animates a short move in either direction', () => {
        expect(scrollBehaviorForDistance(-120)).toBe('smooth');
    });

    it('animates right up to the threshold', () => {
        expect(scrollBehaviorForDistance(SMOOTH_SCROLL_MAX_DISTANCE)).toBe('smooth');
    });

    // REGRESSION: the effect used `behavior: 'smooth'` unconditionally. Centring row
    // 700 of 726 is a ~46,000px animation — seconds of streaming rows that tell the
    // user nothing about where their selection is.
    it('cuts instantly across a long list rather than animating tens of thousands of pixels', () => {
        expect(scrollBehaviorForDistance(SMOOTH_SCROLL_MAX_DISTANCE + 1)).toBe('auto');
        expect(scrollBehaviorForDistance(46_000)).toBe('auto');
    });
});

describe('estimateCenteredScrollTop', () => {
    it('centres a row in the middle of the list', () => {
        // Row 10 spans 400-440; centring it in a 200px viewport puts its middle
        // (420) at the viewport middle → scrollTop 320.
        expect(estimateCenteredScrollTop(10, 40, 200)).toBe(320);
    });

    it('never scrolls above the top of the list', () => {
        expect(estimateCenteredScrollTop(0, 40, 400)).toBe(0);
        expect(estimateCenteredScrollTop(1, 40, 400)).toBe(0);
    });

    // REGRESSION: the row height IS the bug. With rows actually ~66px tall, the old
    // hardcoded 40 aimed at 40/66 of the true offset — about 18,000px short at row
    // 700, which is far outside any viewport, so the selection never came into view.
    it('tracks the measured row height, not a hardcoded one', () => {
        const withRealHeight = estimateCenteredScrollTop(700, 66, 420);
        const withOldAssumption = estimateCenteredScrollTop(700, 40, 420);

        expect(withRealHeight).toBeGreaterThan(withOldAssumption + 18_000);
    });
});

describe('centeredScrollTopFromRects', () => {
    it('centres a row rendered below the middle', () => {
        // Viewport 100-500 (400 tall), row at 380 and 40 tall. Centred means the row
        // sits at 100 + (400-40)/2 = 280, so scroll down by 100 from 1000.
        expect(centeredScrollTopFromRects(1000, 380, 40, 100, 400)).toBe(1100);
    });

    it('centres a row rendered above the middle by scrolling back up', () => {
        expect(centeredScrollTopFromRects(1000, 180, 40, 100, 400)).toBe(900);
    });

    it('leaves an already-centred row where it is', () => {
        expect(centeredScrollTopFromRects(1000, 280, 40, 100, 400)).toBe(1000);
    });

    it('never scrolls above the top of the list', () => {
        expect(centeredScrollTopFromRects(10, 100, 40, 100, 400)).toBe(0);
    });

    it('accounts for the row height, so a tall row centres on its own middle', () => {
        // A 100px row centres at 100 + (400-100)/2 = 250; it renders at 380.
        expect(centeredScrollTopFromRects(1000, 380, 100, 100, 400)).toBe(1130);
    });
});

describe('constants', () => {
    it('keeps a fallback row height for before anything is rendered', () => {
        expect(FALLBACK_ROW_HEIGHT).toBeGreaterThan(0);
    });

    it('allows more than one correction pass — one estimate rarely lands centred', () => {
        expect(MAX_CORRECTION_PASSES).toBeGreaterThan(1);
    });

    it('tolerates sub-pixel error so corrections terminate instead of jittering', () => {
        expect(CENTERED_TOLERANCE).toBeGreaterThan(0);
    });
});
