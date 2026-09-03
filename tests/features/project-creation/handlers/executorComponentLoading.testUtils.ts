/**
 * The seven module walls both executor component-loading suites share.
 *
 * IMPORTING THIS FILE REGISTERS THE MOCKS. `jest.mock` hoists above the imports
 * of the module it appears in, not across modules, so this import must come
 * before each suite's import of the executor. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 *
 * MEASURED, NOT ASSUMED. Nine modules are mocked by both suites; seven of the
 * bodies are byte-identical with comments stripped and two are not —
 * `ComponentRegistryManager` and `componentManager` differ in what they answer,
 * and each suite keeps its own. Deleting these seven from one suite failed all
 * three of its tests, so they are load-bearing rather than leftovers (probed
 * 2026-09-02).
 *
 * NOT COVERED: `executor-edsStandardFlow` mocks this exact set PLUS four more.
 * It is a superset, not a variant, and adopting this file would be a fair next
 * step — left out here because its four extra walls were not compared.
 */

// The App Builder permission gate, stubbed so the mesh phase is a no-op.
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn(() => false),
}));

jest.mock('@/features/mesh/services/meshDeployment');
jest.mock('@/features/mesh/services/stalenessDetector');

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        }),
        getAuthenticationService: jest.fn().mockReturnValue({
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        }),
    },
}));

jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn().mockResolvedValue(undefined),
    generateComponentConfigFiles: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockRejectedValue(new Error('Not found')),
    readdir: jest.fn().mockResolvedValue([]),
    rm: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined),
}));

jest.mock(
    'vscode',
    () => ({
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue(3000),
            }),
        },
        window: {
            setStatusBarMessage: jest.fn(),
        },
        commands: {
            executeCommand: jest.fn(),
        },
    }),
    { virtual: true }
);

export {};
