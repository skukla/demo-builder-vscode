/**
 * What `Demo Builder: Repair Site Configuration` shows while it runs (progress
 * vocabulary slice 3, owner 2026-10-16).
 *
 * A notification shows one line, so each half names its STEP, as the same job is named
 * everywhere else: "Updating the site configuration", then "Publishing the settings". Until
 * then the republish half was titled "Republishing storefront" and showed the config
 * step's own lines ("Extracting configuration", "Syncing to GitHub and CDN") as if each
 * were the step.
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));
const mockRepair = jest.fn();
jest.mock('@/features/eds/services/configService/repairSiteConfigForProject', () => ({
    repairSiteConfigForProject: (...a: unknown[]) => mockRepair(...a),
}));
const mockRepublishConfig = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: (...a: unknown[]) => mockRepublishConfig(...a),
}));
const mockEnsureDaLiveAuth = jest.fn();
jest.mock('@/features/eds/handlers/daLive/daLiveAuthGuard', () => ({
    ensureDaLiveAuth: (...a: unknown[]) => mockEnsureDaLiveAuth(...a),
}));

import * as vscode from 'vscode';
import { RepairSiteConfigurationCommand } from '@/commands/repairSiteConfiguration';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { StateManager } from '@/core/state/stateManager';
import type { Logger } from '@/types/logger';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockProject } from '../helpers/projectFake';
import { createMockStateManager } from '../helpers/stateManagerFake';

const TITLE = 'Repairing Site Configuration';

/** Each notification the command opened under its title, with the lines it showed. */
function notifications(): Array<{ title: string; lines: string[] }> {
    return shown.filter((n) => n.title === TITLE);
}
const shown: Array<{ title: string; lines: string[] }> = [];

beforeEach(() => {
    jest.clearAllMocks();
    shown.length = 0;
    (vscode.window.withProgress as jest.Mock).mockImplementation(
        async (options: { title: string }, task: (p: { report: (u: { message?: string }) => void }) => unknown) => {
            const entry = { title: options.title, lines: [] as string[] };
            shown.push(entry);
            return task({ report: ({ message }) => message && entry.lines.push(message) });
        },
    );
    mockRepair.mockImplementation(async (...a: unknown[]) => {
        // Whatever the registrar says while it works is detail, not the step.
        const onProgress = a[4] as ((m: string) => void) | undefined;
        onProgress?.('Re-registering me/shop');
        return { status: 'repaired', verified: true, site: 'me/shop' };
    });
    mockRepublishConfig.mockImplementation(async (params: { onProgress?: (m: string) => void }) => {
        params.onProgress?.('Publishing the settings: Writing config.json');
        return { success: true };
    });
});

/** The command over one open project, with the context and logger it was built with. */
function repairCommand() {
    const project = createMockProject({ name: 'shop', path: '/p/shop' });
    const context = createMockExtensionContext();
    const logger = createMockLogger() as unknown as Logger;
    const command = new RepairSiteConfigurationCommand(
        context,
        createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        }) as unknown as StateManager,
        logger,
    );
    return { command, context, logger };
}

it('names each half by its step, under one title', async () => {
    const { command } = repairCommand();

    await command.execute();

    expect(notifications()).toStrictEqual([
        { title: TITLE, lines: [OPERATION_STAGES.updatingSiteConfig.label] },
        { title: TITLE, lines: [OPERATION_STAGES.publishingSettings.label] },
    ]);
});

// PL-104 fix 11 (F258): a palette command has a person there, so the CDN publish asks for the
// DA.live sign-in as every other door of the settings republish does.
it('asks for the DA.live sign-in before the CDN publish, as the Configure save does', async () => {
    const SESSION = { authenticated: true };
    mockEnsureDaLiveAuth.mockResolvedValue(SESSION);
    const { command, context, logger } = repairCommand();

    await command.execute();

    const params = mockRepublishConfig.mock.calls[0][0] as {
        ensureDaLiveSession: (() => Promise<unknown>) | null;
    };
    expect(params.ensureDaLiveSession).not.toBeNull();
    expect(await params.ensureDaLiveSession!()).toBe(SESSION);
    expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith({ context, logger }, '[Repair Site Configuration]');
});

it('says the storefront still serves the old settings when the CDN publish did not land', async () => {
    const cdnError = 'No DA.live session — sign in to DA.live and republish from the dashboard.';
    mockRepublishConfig.mockResolvedValue({ success: true, cdnError });
    const { command } = repairCommand();

    await command.execute();

    const said = (vscode.window.showWarningMessage as jest.Mock).mock.calls.map((c) => c[0]);
    expect(said).toStrictEqual([
        `Site configuration was repaired, but the live storefront still serves the previous settings: ${cdnError}`,
    ]);
    expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
});
