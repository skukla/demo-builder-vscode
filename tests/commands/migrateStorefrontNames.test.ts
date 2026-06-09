/**
 * MigrateStorefrontNamesCommand tests
 *
 * Covers the "Demo Builder: Migrate Storefront Names" palette command —
 * the one-shot, no-reset path that heals pre-`164fd251` storefronts.
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Mocks — must precede imports.
// ---------------------------------------------------------------------------

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    })),
    initializeLogger: jest.fn(),
}));

jest.mock('@/features/eds/services/storefrontNameMigration', () => ({
    migrateStorefrontNamingIfNeeded: jest.fn(),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
    getDaLiveAuthService: jest.fn(() => ({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
    })),
    resolveByomOverlayConfig: jest.fn((fromConfig?: string) => fromConfig),
}));

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getAccessToken: jest.fn() })),
}));

jest.mock('@/features/eds/services/configurationService', () => ({
    ConfigurationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/eds/services/edsResetParams', () => ({
    resolveStorefrontConfig: jest.fn(() => ({
        templateOwner: 'template-org',
        templateRepo: 'template-repo',
        byomOverlayUrl: 'https://overlay.example.com/render-pdp',
    })),
}));

// demo-packages.json is intentionally NOT mocked: resolveStorefrontConfig
// (mocked above) is the only consumer of its `packages`, and the stub ignores
// the argument — so the real bundled config loads harmlessly. Mocking the
// config leaf would violate the no-config-leaf-mocks SOP for no behavioral gain.

// ---------------------------------------------------------------------------
// Imports.
// ---------------------------------------------------------------------------

import { MigrateStorefrontNamesCommand } from '@/commands/migrateStorefrontNames';
import { migrateStorefrontNamingIfNeeded } from '@/features/eds/services/storefrontNameMigration';
import { ensureDaLiveAuth } from '@/features/eds/handlers/edsHelpers';
import type { StateManager } from '@/core/state';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import { COMPONENT_IDS } from '@/core/constants';

const migrateMock = migrateStorefrontNamingIfNeeded as jest.Mock;
const ensureAuthMock = ensureDaLiveAuth as jest.Mock;

function makeLogger(): Logger {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    } as unknown as Logger;
}

function makeProject(
    name: string,
    overrides: { daLiveSite?: string; daLiveOrg?: string; githubRepo?: string } = {},
): Project {
    const {
        daLiveSite = `${name}-content`, // legacy mismatched default
        daLiveOrg = 'skukla',
        githubRepo = `skukla/${name}`,
    } = overrides;
    return {
        name,
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                metadata: { daLiveOrg, daLiveSite, githubRepo },
            },
        },
    } as unknown as Project;
}

function makeStateManager(projectsByPath: Record<string, Project>): StateManager {
    return {
        getAllProjects: jest.fn().mockResolvedValue(
            Object.keys(projectsByPath).map((path) => ({
                name: projectsByPath[path].name,
                path,
                lastModified: new Date(),
            })),
        ),
        loadProjectFromPath: jest.fn((path: string) =>
            Promise.resolve(projectsByPath[path] ?? null),
        ),
        saveProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;
}

function makeCommand(stateManager: StateManager) {
    const logger = makeLogger();
    const context = {} as unknown as vscode.ExtensionContext;
    return new MigrateStorefrontNamesCommand(context, stateManager, logger);
}

describe('MigrateStorefrontNamesCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Most tests need showInformationMessage to return "Migrate" so the
        // happy path is reachable; tests that exercise the cancel branch
        // override per-test.
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Migrate');

        // Default: each migrate call succeeds.
        migrateMock.mockResolvedValue({ skipped: false, migrated: true });

        // withProgress: run the callback with a stub progress reporter.
        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_opts: unknown, task: (progress: { report: jest.Mock }) => Promise<unknown>) =>
                task({ report: jest.fn() }),
        );

        ensureAuthMock.mockResolvedValue({ authenticated: true });
    });

    describe('scan phase', () => {
        it('shows an info message and does NOT prompt when no projects need migration', async () => {
            const sm = makeStateManager({});
            await makeCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
            // The "nothing to do" message is shown via showInformationMessage.
            // BaseCommand.showInfo appends an 'OK' button arg.
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('No storefronts need migration'),
                'OK',
            );
        });

        it('ignores projects without an eds-storefront component instance', async () => {
            const noEds = { name: 'no-eds', componentInstances: {} } as unknown as Project;
            const sm = makeStateManager({ '/a': noEds });

            await makeCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        it('ignores projects whose daLiveSite already matches the repo name', async () => {
            // daLiveSite === repoName → not a candidate
            const alreadyMatching = makeProject('b2b', { daLiveSite: 'b2b' });
            const sm = makeStateManager({ '/a': alreadyMatching });

            await makeCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        it('finds mismatched projects (daLiveSite differs from the repo half of githubRepo)', async () => {
            // daLiveSite=b2b-content vs githubRepo=skukla/b2b → repo half is "b2b" → mismatch
            const mismatched = makeProject('b2b', {
                daLiveSite: 'b2b-content',
                githubRepo: 'skukla/b2b',
            });
            const sm = makeStateManager({ '/a': mismatched });

            await makeCommand(sm).execute();

            expect(migrateMock).toHaveBeenCalledTimes(1);
            const [ctx] = migrateMock.mock.calls[0];
            expect(ctx.daLiveSite).toBe('b2b-content');
            expect(ctx.repoName).toBe('b2b');
            expect(ctx.repoOwner).toBe('skukla');
        });
    });

    describe('confirmation', () => {
        it('does NOT run migrations when the user cancels', async () => {
            const mismatched = makeProject('b2b');
            const sm = makeStateManager({ '/a': mismatched });

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Cancel');

            await makeCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        it('does NOT run migrations when the user dismisses the dialog (returns undefined)', async () => {
            const mismatched = makeProject('b2b');
            const sm = makeStateManager({ '/a': mismatched });

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);

            await makeCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        it('shows every candidate in the confirmation detail', async () => {
            const a = makeProject('a-store');
            const b = makeProject('b-store');
            const sm = makeStateManager({ '/a': a, '/b': b });

            await makeCommand(sm).execute();

            // The confirmation goes out as a modal info message; the
            // `detail` field holds the per-project list.
            const callArgs = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0];
            const opts = callArgs[1];
            expect(opts.modal).toBe(true);
            expect(opts.detail).toContain('a-store');
            expect(opts.detail).toContain('b-store');
        });
    });

    describe('authentication', () => {
        it('aborts when DA.live auth is not granted (user cancelled)', async () => {
            const mismatched = makeProject('b2b');
            const sm = makeStateManager({ '/a': mismatched });

            ensureAuthMock.mockResolvedValueOnce({ authenticated: false, cancelled: true });

            await makeCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        it('aborts when DA.live auth fails outright (error response)', async () => {
            const mismatched = makeProject('b2b');
            const sm = makeStateManager({ '/a': mismatched });

            ensureAuthMock.mockResolvedValueOnce({
                authenticated: false,
                error: 'token revoked',
            });

            await makeCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });
    });

    describe('happy path', () => {
        it('migrates every confirmed project and persists each manifest', async () => {
            const a = makeProject('a-store');
            const b = makeProject('b-store');
            const c = makeProject('c-store');
            const sm = makeStateManager({ '/a': a, '/b': b, '/c': c });

            await makeCommand(sm).execute();

            expect(migrateMock).toHaveBeenCalledTimes(3);
            expect(sm.saveProject).toHaveBeenCalledTimes(3);
        });

        it('reports success when every migration succeeds', async () => {
            const a = makeProject('a-store');
            const sm = makeStateManager({ '/a': a });

            await makeCommand(sm).execute();

            // First call = confirmation; second = success summary.
            const calls = (vscode.window.showInformationMessage as jest.Mock).mock.calls;
            const summary = calls.at(-1)?.[0] ?? '';
            expect(summary).toMatch(/Migrated 1 storefront/);
        });
    });

    describe('partial failure', () => {
        it('continues to the next project when one migration fails', async () => {
            const a = makeProject('a-store');
            const b = makeProject('b-store');
            const sm = makeStateManager({ '/a': a, '/b': b });

            // First call fails, second succeeds.
            migrateMock
                .mockResolvedValueOnce({ skipped: false, migrated: false, error: 'DA copy timeout' })
                .mockResolvedValueOnce({ skipped: false, migrated: true });

            await makeCommand(sm).execute();

            expect(migrateMock).toHaveBeenCalledTimes(2);
            // Only the successful one persists its manifest.
            expect(sm.saveProject).toHaveBeenCalledTimes(1);
        });

        it('surfaces a warning summary when any project fails', async () => {
            const a = makeProject('a-store');
            const sm = makeStateManager({ '/a': a });

            migrateMock.mockResolvedValueOnce({
                skipped: false,
                migrated: false,
                error: 'DA copy timeout',
            });

            await makeCommand(sm).execute();

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('failed'),
                'OK',
            );
        });

        it('catches thrown errors and reports them per-project (not as a crash)', async () => {
            const a = makeProject('a-store');
            const b = makeProject('b-store');
            const sm = makeStateManager({ '/a': a, '/b': b });

            migrateMock
                .mockRejectedValueOnce(new Error('network blip'))
                .mockResolvedValueOnce({ skipped: false, migrated: true });

            await makeCommand(sm).execute();

            // Both attempts happened; only the success persisted.
            expect(migrateMock).toHaveBeenCalledTimes(2);
            expect(sm.saveProject).toHaveBeenCalledTimes(1);
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });
    });
});
