/**
 * The two validator walls every dashboard handler suite installs identically.
 *
 * Eleven files in this directory carry these two, byte-identical with comments
 * stripped (measured 2026-09-02). They are here and nothing else is.
 *
 * WHY ONLY TWO. The imported wall WINS over a suite's own — whichever
 * `jest.mock` registration runs last takes effect, and a suite's own calls hoist
 * to the very top, so a file it imports registers afterwards. That means
 * anything in here is imposed on every consumer with no way to override it. Two
 * more walls were briefly in this file and had to come out:
 * `projectDeletionService`, because `dashboardHandlers-actions` needs a
 * different one and would have been silently overridden, and
 * `ProjectNameValidator`, which only two suites use at all.
 *
 * SEPARATE FROM `dashboardHandlers.testUtils` for the same reason. That file
 * installs a `vscode` wall beside its context builders, and this directory needs
 * fifteen different vscode walls across sixteen files — so a suite cannot take
 * testUtils for the validators and keep its own vscode. Splitting the validators
 * out is what makes them shareable at all.
 *
 * IMPORT THIS BEFORE the handlers under test. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 */

jest.mock('@/core/validation/URLValidator', () => ({
    validateURL: jest.fn(),
}));

jest.mock('@/core/validation/validators/AdobeResourceValidator', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
}));

export {};
