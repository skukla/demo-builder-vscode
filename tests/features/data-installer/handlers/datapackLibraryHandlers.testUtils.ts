/**
 * Shared setup for the `datapackLibraryHandlers` suites (the base one and -rename).
 *
 * Both fake one boundary, the access guard, which hands back per-store clients, so a test can
 * see which store each call reached; both drive the library's own address. Per
 * webview-test-authoring §3 this file owns the subject's import too, so neither spec binds the
 * handlers before the mock is registered.
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));

// Below the mock on purpose — see webview-test-authoring §3.
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { datapackLibraryHandlers } from '@/features/data-installer/handlers/datapackLibraryHandlers';

export { datapackLibraryHandlers };

/** The access guard, mocked: each suite says what it hands back. */
export const mockAccess = resolveDataInstallerAccess as jest.Mock;

/** The datapack library's address in every suite. */
export const STORE = 'https://library.example.test/api/v1/web/datapack-store';
