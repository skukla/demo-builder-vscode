/**
 * Shared harness for the `migrateStorefrontNames` suite family.
 *
 * The mock wall below is what the command's real collaborator graph costs, and
 * it is identical for both specs. It may live here because this file also owns
 * the SUBJECT import — `babel-plugin-jest-hoist` lifts `jest.mock` above the
 * imports of the module it appears in, so a spec importing the command from
 * here gets the mocked graph and one importing it directly would not
 * (`.claude/skills/webview-test-authoring/` §3).
 *
 * A spec calls `resetMigrateMocks()` from its OWN `beforeEach`.
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Mocks — must precede imports.
// ---------------------------------------------------------------------------

jest.mock('@/features/eds/services/storefront/storefrontNameMigration', () => ({
    migrateStorefrontNamingIfNeeded: jest.fn(),
}));

jest.mock('@/features/eds/services/pdp/publishKeyRegistrar', () => ({
    registerPublishKey: jest.fn().mockResolvedValue({ registered: true }),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
    getDaLiveAuthService: jest.fn(() => ({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
    })),
    resolveByomOverlayConfig: jest.fn((fromConfig?: string) => fromConfig),
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getAccessToken: jest.fn() })),
}));

// ConfigurationService is NOT mocked, and does not need to be. Its constructor is
// two field assignments, the migration function this command calls is mocked, so the
// instance is never touched — the mock silenced nothing and cost the suite its ability
// to see what was constructed.

jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    resolveStorefrontConfig: jest.fn(() => ({
        templateOwner: 'template-org',
        templateRepo: 'template-repo',
        byomOverlayUrl: 'https://overlay.example.com/render-pdp',
    })),
}));

// Note: demo-packages.json is intentionally NOT mocked here.
// The command imports it for the `packages` array, but the array is passed
// straight into the mocked `resolveStorefrontConfig` above — so the real JSON
// loads and is never read by the test path. Mocking the JSON directly would
// violate the no-config-leaf-mocks SOP (tests/sop/no-config-leaf-mocks.test.ts).

// ---------------------------------------------------------------------------
// Imports.
// ---------------------------------------------------------------------------

import { MigrateStorefrontNamesCommand } from '@/commands/migrateStorefrontNames';
import { migrateStorefrontNamingIfNeeded } from '@/features/eds/services/storefront/storefrontNameMigration';
import { ensureDaLiveAuth } from '@/features/eds/handlers/edsHelpers';
import { registerPublishKey } from '@/features/eds/services/pdp/publishKeyRegistrar';
import type { StateManager } from '@/types/state';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import { COMPONENT_IDS } from '@/core/constants';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockStateManager } from '../helpers/stateManagerFake';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockProject } from '../helpers/projectFake';

const migrateMock = migrateStorefrontNamingIfNeeded as jest.Mock;
const ensureAuthMock = ensureDaLiveAuth as jest.Mock;
const registerPublishKeyMock = registerPublishKey as jest.Mock;

export function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

export function makeProject(
    name: string,
    overrides: { daLiveSite?: string; daLiveOrg?: string; githubRepo?: string } = {}
): Project {
    const {
        daLiveSite = `${name}-content`, // legacy mismatched default
        daLiveOrg = 'skukla',
        githubRepo = `skukla/${name}`,
    } = overrides;
    return createMockProject({
        name,
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                metadata: { daLiveOrg, daLiveSite, githubRepo },
            },
        },
    });
}

export function makeStateManager(projectsByPath: Record<string, Project>): StateManager {
    return createMockStateManager({
        getAllProjects: jest.fn().mockResolvedValue(
            Object.keys(projectsByPath).map((path) => ({
                name: projectsByPath[path].name,
                path,
                lastModified: new Date(),
            }))
        ),
        loadProjectFromPath: jest.fn((path: string) =>
            Promise.resolve(projectsByPath[path] ?? null)
        ),
    });
}

export { MigrateStorefrontNamesCommand, migrateMock, ensureAuthMock, registerPublishKeyMock };

/**
 * The command plus the extension context and logger it was handed — both of
 * which it forwards to `ensureDaLiveAuth`, so a spec has to be able to name them.
 */
export function makeCommandWith(stateManager: StateManager): {
    command: MigrateStorefrontNamesCommand;
    context: ReturnType<typeof createMockExtensionContext>;
    logger: Logger;
} {
    const logger = makeLogger();
    const context = createMockExtensionContext();
    return {
        command: new MigrateStorefrontNamesCommand(context, stateManager, logger),
        context,
        logger,
    };
}

export function makeCommand(stateManager: StateManager): MigrateStorefrontNamesCommand {
    return makeCommandWith(stateManager).command;
}

/** Every `progress.report(...)` argument the last run produced, in order. */
export const progressReports: Array<{ increment?: number; message?: string }> = [];

/**
 * Call from each spec's OWN `beforeEach`. The default is a run that can reach
 * the migration: the user confirms, DA.live auth is granted, every migration
 * succeeds, and `withProgress` simply runs its task.
 */
export function resetMigrateMocks(): void {
    jest.clearAllMocks();
    progressReports.length = 0;

    // Most tests need showInformationMessage to return "Migrate" so the happy
    // path is reachable; tests that exercise the cancel branch override per-test.
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Migrate');
    migrateMock.mockReset().mockResolvedValue({ skipped: false, migrated: true });
    registerPublishKeyMock.mockReset().mockResolvedValue({ registered: true });
    ensureAuthMock.mockReset().mockResolvedValue({ authenticated: true });

    (vscode.window.withProgress as jest.Mock).mockImplementation(
        async (
            _opts: unknown,
            task: (progress: {
                report: (value: { increment?: number; message?: string }) => void;
            }) => Promise<unknown>
        ) => task({ report: (value) => void progressReports.push(value) })
    );
}
