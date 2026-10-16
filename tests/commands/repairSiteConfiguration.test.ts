/**
 * What `Demo Builder: Repair Site Configuration` shows while it runs (progress
 * vocabulary slice 3, owner 2026-10-16).
 *
 * A notification shows one line, so each half names its STEP, as the same job is named
 * everywhere else: "Updating the site config", then "Publishing the settings". Until
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

import * as vscode from 'vscode';
import { RepairSiteConfigurationCommand } from '@/commands/repairSiteConfiguration';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { StateManager } from '@/core/state/stateManager';
import type { Logger } from '@/types/logger';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockProject } from '../helpers/projectFake';
import { createMockStateManager } from '../helpers/stateManagerFake';

const TITLE = 'Repairing site configuration';

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
        params.onProgress?.('Publishing the settings: writing config.json');
        return { success: true };
    });
});

it('names each half by its step, under one title', async () => {
    const project = createMockProject({ name: 'shop', path: '/p/shop' });
    const command = new RepairSiteConfigurationCommand(
        createMockExtensionContext(),
        createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        }) as unknown as StateManager,
        createMockLogger() as unknown as Logger,
    );

    await command.execute();

    expect(notifications()).toStrictEqual([
        { title: TITLE, lines: [OPERATION_STAGES.updatingSiteConfig.label] },
        { title: TITLE, lines: [OPERATION_STAGES.publishingSettings.label] },
    ]);
});
