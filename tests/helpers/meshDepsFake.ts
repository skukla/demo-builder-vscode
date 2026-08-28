/**
 * The collaborators mesh-touching code receives (ADR-015): a shell executor and
 * an auth service.
 *
 * WHY THIS EXISTS. This object was written out ELEVEN times — once per suite,
 * in three near-identical variants that differed only in which auth method the
 * fake happened to carry. All eleven were added in a single day, by the same
 * conversion work that removes module mocks: every service converted to receive
 * its dependencies creates demand for a fake, and with no shared builder each
 * suite invents one. The architecture work was manufacturing the divergence the
 * audit was measuring.
 *
 * The default auth fake carries BOTH methods any caller has needed. A superset
 * costs nothing and removes the guessing that produced three variants.
 *
 * Per PL-16.
 */

/** A fake auth service carrying every method the mesh paths have asked for. */
function defaultAuthManager() {
    return {
        getTokenStatus: jest.fn(async () => ({ isAuthenticated: true })),
        getCachedOrganization: jest.fn(),
    };
}

/**
 * Build the mesh deps fake.
 *
 * @param overrides - swap either collaborator. Suites that assert ON the auth
 *   service pass their own so the assertions see the same object.
 */
export function createMeshDepsFake(
    overrides: {
        commandManager?: unknown;
        authManager?: unknown;
    } = {}
) {
    return {
        commandManager: overrides.commandManager ?? { execute: jest.fn() },
        authManager: overrides.authManager ?? defaultAuthManager(),
    } as never;
}
