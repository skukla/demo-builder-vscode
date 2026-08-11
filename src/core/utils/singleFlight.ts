/**
 * SingleFlight — collapse concurrent calls for the same work onto ONE promise.
 *
 * A cache dedupes callers arriving AFTER a fetch completes. It does nothing for
 * callers arriving DURING one: they all check, all miss, and all start their own
 * fetch. For anything expensive that is a real multiplier — the 2026-07-31 logs
 * showed the Adobe org list fetched twice in one dashboard open (2.5s + 1.4s
 * overlapping) because `orgContextCheck` and the API picker's handler raced.
 *
 * Extracted at the third occurrence (project Rule of Three): the sign-in prompt
 * guard (`core/auth/adobeAuthGuard`), the org-list fetch, and the token
 * inspection. All three had hand-rolled the same five lines.
 *
 * **The correctness property is synchronous check-and-set.** `run` must call
 * `fn()` and assign its promise with no `await` in between, or two callers can
 * both pass the check before either assigns. Keep it that way.
 *
 * @module core/utils/singleFlight
 */

/**
 * A single-flight slot for one kind of work.
 *
 * Hold one per distinct operation — as a class field for per-instance work, or a
 * module-level constant for process-wide work.
 *
 * @example
 * private readonly orgListFlight = new SingleFlight<AdobeOrg[]>();
 * // …
 * return this.orgListFlight.run(() => this.fetchOrgs());
 */
export class SingleFlight<T> {
    private flight: Promise<T> | undefined;

    /**
     * Run `fn`, or join the run already in progress.
     *
     * The flight is released on BOTH success and failure — a rejected flight left
     * in place would wedge every later caller for the lifetime of the slot.
     *
     * @param fn - the work to run; invoked only when no flight is in progress
     * @param onJoin - optional side effect when a caller JOINS an existing flight
     *                 (e.g. a log line); never fires for the caller that starts one
     * @returns the shared promise
     */
    run(fn: () => Promise<T>, onJoin?: () => void): Promise<T> {
        if (this.flight) {
            onJoin?.();
            return this.flight;
        }
        // Synchronous check-and-set — see the module note.
        this.flight = fn().finally(() => {
            this.flight = undefined;
        });
        return this.flight;
    }

    /** True while a flight is in progress (diagnostics and tests). */
    get isInFlight(): boolean {
        return this.flight !== undefined;
    }
}
