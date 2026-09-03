/**
 * The `withOrgContext` wall six of the seven runner suites install identically.
 *
 * `withOrgContext` wraps every Adobe-facing operation the runner performs, so
 * every suite has to let it through — and all six spell that the same way, with
 * the same passthrough and the same `requireActual` spread so the module's other
 * exports stay real (bodies compared with comments stripped, 2026-09-02).
 *
 * THE HANDLE LIVES HERE TOO, and is exported, because the wall closes over it
 * and a wall in a shared file cannot reach a handle its consumer declares.
 * Three suites assert `toHaveBeenCalled()` on it, so it has to be reachable.
 * Re-establish the passthrough in a `beforeEach` — `clearAllMocks` clears calls
 * but `mockReset` elsewhere would drop the implementation.
 *
 * IMPORT THIS BEFORE the runner under test; `jest.mock` hoists above the imports
 * of the module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 *
 * `appConfigPackages` is deliberately NOT here: all seven suites mock it and no
 * two agree on what it answers.
 */

/** Records every wrapped call, and by default just runs the wrapped function. */
export const mockWithOrgContext = jest.fn(
    (_target: unknown, fn: () => Promise<unknown>) => fn()
);

jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) =>
        mockWithOrgContext(target, fn),
}));
