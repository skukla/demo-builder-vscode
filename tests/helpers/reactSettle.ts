/**
 * Settling a webview component's in-flight requests (ADR-016 § Fixtures and fakes).
 *
 * WHY THIS EXISTS — the finding that produced it, because the fix is not the
 * obvious one and the obvious one does nothing.
 *
 * Every React suite here runs under fake timers (`tests/setup/react.ts` calls
 * `jest.useFakeTimers()` for all of them). Components fire requests from mount
 * effects and from user actions; the mocked client answers with a PROMISE, so
 * the resulting `setState` lands on a microtask, not a timer.
 *
 * `findBy*` and `waitFor` are where those updates escape `act()`. Under fake
 * timers, testing-library's wait loop alternates between advancing timers and
 * yielding, and a promise that resolves in the yield gap commits its update with
 * no act scope on the stack — which is exactly the "not wrapped in act" warning.
 * The component is genuinely half-settled at that moment, so the warning is
 * reporting something true: an assertion landing there sees a state the user
 * never would.
 *
 * MEASURED, because four plausible fixes did nothing. On one suite family
 * (`ImportDatapackModal`, 165 warnings) these all left the count unchanged at
 * exactly 9 for a single isolated test:
 *
 *   - draining more microtask ticks inside one act()
 *   - `jest.advanceTimersByTime(0)` before the drain
 *   - a real timer tick inside act()
 *   - three separate act() calls in a row
 *   - wrapping the setup file's `afterEach` timer flush in act()
 *
 * What worked was moving the drain to the OTHER SIDE of the query. Settling
 * BEFORE `findBy*` means the pending responses are applied inside act(), the
 * element is already in the DOM, and the query returns on its first synchronous
 * check without ever entering the wait loop. Same suite family: 165 -> 0, with
 * all 85 tests still passing unchanged.
 *
 *   settle() then findBy*   ->  0 warnings
 *   findBy* then settle()   ->  9 warnings   (the drain never gets the chance)
 *
 * So the rule is: **drain before you query, not after.** `press` and `change`
 * below bake that in — they settle after the interaction, which is the same
 * moment as "before whatever the spec asserts next".
 *
 * THE COROLLARY, and it is the one that costs the most to rediscover: **no
 * `await` may sit between the render (or interaction) and its settle.** An await
 * yields, and the response resolves in that yield — after the render, before the
 * settle can start, out of reach of anything the spec does.
 *
 * RepoSelectionInline is the case that proved it. Its render helper was a
 * dynamic `import(...).then(render)`, so awaiting the import opened exactly that
 * gap. Six settle placements were tried and every one left the count at exactly
 * 20 — because none of them could run early enough. Tracing the order showed it
 * plainly:
 *
 *     before-render -> request -> RESOLVED -> after-render
 *
 * The response had already committed before the helper returned. Hoisting the
 * import into `beforeAll` closed the gap and took the suite to zero, with all
 * 116 tests unchanged.
 *
 * If a suite resists every settle placement, look for an await between the
 * render and the settle before looking anywhere else.
 */

import { act, fireEvent } from '@testing-library/react';

/**
 * How many microtask ticks one settle drains.
 *
 * A response reaches `setState` several ticks behind the promise: the mocked
 * client is an async function, `useVSCodeRequest.execute` awaits it, and only
 * then sets data and loading. Four covers the deepest chain measured here (a
 * target load that triggers a website list that triggers store views). Raising
 * it is harmless; the loop exits immediately once nothing is queued.
 */
const DRAIN_TICKS = 4;

/**
 * Let every request the component has in flight finish, INSIDE act().
 *
 * Call this before asserting, and before any `findBy*` / `waitFor`. See the
 * module docstring for why the order is the whole point.
 */
export async function settle(): Promise<void> {
    await act(async () => {
        for (let i = 0; i < DRAIN_TICKS; i++) {
            await Promise.resolve();
        }
    });
}

/**
 * Click something, then settle.
 *
 * Actions in these components dispatch a request; `fireEvent.click` returns as
 * soon as the click's own synchronous work is done, leaving the response to land
 * during the spec's next line.
 *
 * A spec that deliberately asserts the IN-FLIGHT view — a spinner, a
 * momentarily-disabled button — must keep using bare `fireEvent.click`, because
 * settling skips past the very state it is testing.
 */
export async function press(el: HTMLElement): Promise<void> {
    fireEvent.click(el);
    await settle();
}

/**
 * Change a field, then settle — the `fireEvent.change` counterpart to `press`.
 *
 * Dependent pickers re-query on change (choosing a website reloads its store
 * views), so a change dispatches a request exactly as a click does.
 */
export async function change(el: HTMLElement, value: string): Promise<void> {
    fireEvent.change(el, { target: { value } });
    await settle();
}
