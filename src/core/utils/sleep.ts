/**
 * The one sleep.
 *
 * This exists as its own module for a testing reason, not a code-size one. A bare
 * `await new Promise(resolve => setTimeout(resolve, ms))` is unmockable: the node
 * jest project runs on REAL timers, so every such sleep is waited through for real.
 * Five suites were spending ~72s of wall clock doing nothing but that, and the
 * response had been to raise `jest.setTimeout` rather than to stop sleeping.
 *
 * Routing sleeps through one importable function makes them mockable in one line:
 *
 * ```ts
 * jest.mock('@/core/utils/sleep');   // every delay in the path resolves immediately
 * ```
 *
 * Keep it in its OWN module rather than folding it into `promiseUtils` — mocking
 * that would also stub `withTimeout`, which several of those same suites rely on.
 *
 * Note for tests that mock this: polling loops stop being rate-limited and run at
 * full speed. Assert on the SEQUENCE of attempts, never on elapsed duration.
 *
 * Not for use where the delay itself is under test — `processCleanup` spawns real
 * child processes and measures real SIGTERM→SIGKILL escalation, so it must keep
 * using real timers.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
