/**
 * The vscode shell and block-collection stub both updateExecutor suites build.
 *
 * Identical in each, verbatim: a `withProgress` that runs its callback straight
 * through, the three message boxes, and the block-collection installer the
 * executor calls on its way past. Their third mock differs — one stubs the
 * Adobe MCP update core, the other the sync path — so only these two move.
 */

jest.mock(
    'vscode',
    () => ({
        window: {
            withProgress: jest.fn((_opts: unknown, cb: (p: { report: jest.Mock }) => unknown) =>
                cb({ report: jest.fn() })
            ),
            showWarningMessage: jest.fn(),
            showErrorMessage: jest.fn(),
            showInformationMessage: jest.fn(),
        },
        workspace: { getConfiguration: jest.fn() },
        ProgressLocation: { Notification: 15 },
    }),
    { virtual: true }
);

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

export {};
