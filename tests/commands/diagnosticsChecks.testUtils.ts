/**
 * Shared setup for the diagnosticsChecks suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   diagnosticsChecks-aioVersionReuse.test.ts
 *   diagnosticsChecks-auth.test.ts
 *   diagnosticsChecks-parallelProbes.test.ts
 */

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        logCommand: jest.fn(),
    })),
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: () => ({ execute: (...a: unknown[]) => mockExecute(...a) }),
    },
}));
const mockExecute = jest.fn();
const ranCommands = (): string[] => mockExecute.mock.calls.map((c) => String(c[0]));


export {
    mockExecute,
    ranCommands,
};
