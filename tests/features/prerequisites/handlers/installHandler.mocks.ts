/**
 * The module wall five installHandler suites declare identically.
 *
 * `installHandler.testUtils.ts` used to open with "each test file using these
 * utilities must include the following at the top", followed by the wall — an
 * instruction to duplicate, and duplicated it duly was. Importing this module
 * registers the same mocks instead.
 *
 * WHY A SECOND FILE rather than folding it into the testUtils: eleven suites
 * import those utilities and only some share this wall. `installHandler-byId`
 * deliberately mocks nothing, and `installHandler-plugins` has its own set.
 * Putting the wall where all eleven pick it up would change what two of them
 * exercise, which is not a de-duplication.
 *
 * Import this BEFORE anything that loads the handler: `jest.mock` hoists above
 * the imports of the module it appears in, not across modules.
 */

jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getRequiredNodeVersions: jest.fn(),
        getNodeVersionMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
    };
});

jest.mock('@/core/di/serviceLocator');

jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ url })),
    },
}));

export {};
