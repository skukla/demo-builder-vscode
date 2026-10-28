/**
 * When the hook re-centres the selected row.
 *
 * The geometry is pinned by listScrollGeometry.test.ts; this suite pins the
 * TRIGGERS. The one that motivated it: filtering a long list kept the old scroll
 * offset while the grid measured rows it had only estimated, so a selected last
 * row ended up below the visible edge (release test, 2026-10). A filter change is
 * now a trigger, settled after typing pauses.
 */

import { renderHook } from '@testing-library/react';
import { useScrollToSelectedRow } from '@/core/ui/components/navigation/useScrollToSelectedRow';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

/**
 * A 200px grid that overflows, holding one selected row. Scrolling centres the
 * row (top 80); `pushOutOfView` puts it back at 300, which is what re-measuring
 * rows after a filter did to it.
 */
function buildList() {
    const container = document.createElement('div');
    const grid = document.createElement('div');
    grid.setAttribute('role', 'grid');
    Object.defineProperty(grid, 'scrollHeight', { value: 1000 });
    Object.defineProperty(grid, 'clientHeight', { value: 200 });
    grid.getBoundingClientRect = () => ({ top: 0, height: 200 }) as DOMRect;

    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.setAttribute('data-key', 'p1');
    let rowTop = 300;
    row.getBoundingClientRect = () => ({ top: rowTop, height: 40 }) as DOMRect;

    const scrollTo = jest.fn(() => {
        rowTop = 80;
    });
    grid.scrollTo = scrollTo as unknown as typeof grid.scrollTo;

    grid.appendChild(row);
    container.appendChild(grid);
    return {
        container,
        scrollTo,
        pushOutOfView: () => {
            rowTop = 300;
        },
    };
}

describe('useScrollToSelectedRow triggers', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const settle = () => jest.advanceTimersByTime(FRONTEND_TIMEOUTS.SCROLL_SETTLE);

    function mount(filterQuery: string) {
        const list = buildList();
        const containerRef = { current: list.container };
        const hook = renderHook(
            (props: { filterQuery: string }) =>
                useScrollToSelectedRow({
                    containerRef,
                    selectedId: 'p1',
                    selectedIndex: 0,
                    hasItems: true,
                    filterQuery: props.filterQuery,
                }),
            { initialProps: { filterQuery } },
        );
        settle();
        // Let the follow-up check run (it finds the row centred and stops).
        jest.runOnlyPendingTimers();
        list.scrollTo.mockClear();
        list.pushOutOfView();
        return { ...hook, ...list };
    }

    it('centres the selected row once the selection is in place', () => {
        const list = buildList();
        renderHook(() =>
            useScrollToSelectedRow({
                containerRef: { current: list.container },
                selectedId: 'p1',
                selectedIndex: 0,
                hasItems: true,
            }),
        );
        settle();

        expect(list.scrollTo).toHaveBeenCalledTimes(1);
    });

    it('centres it again when the filter changes, so a re-measured list cannot hide it', () => {
        const { scrollTo, rerender } = mount('');

        rerender({ filterQuery: 'Kukla' });
        settle();

        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('waits for typing to pause: each keystroke cancels the pending pass', () => {
        const { scrollTo, rerender } = mount('');

        rerender({ filterQuery: 'K' });
        jest.advanceTimersByTime(FRONTEND_TIMEOUTS.SCROLL_SETTLE - 1);
        rerender({ filterQuery: 'Ku' });
        jest.advanceTimersByTime(FRONTEND_TIMEOUTS.SCROLL_SETTLE - 1);

        expect(scrollTo).not.toHaveBeenCalled();

        settle();
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('does not re-centre on a re-render that changes nothing', () => {
        const { scrollTo, rerender } = mount('Kukla');

        rerender({ filterQuery: 'Kukla' });
        settle();

        expect(scrollTo).not.toHaveBeenCalled();
    });
});
