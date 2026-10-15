/**
 * Configure after a store change (EDS-44), at the command.
 *
 * The prompt reads "The store changed. Republish the storefront?" with what that does to
 * the pages, on the same Republish/Later buttons; the Republish ends with the
 * store-change sentence instead of the generic success line. The words and the run are
 * `configureStorefrontRepublish.ts` (its own suite); here the run is walled so the
 * command's use of its outcome is what is checked.
 */

import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import * as vscode from 'vscode';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockRepublishFromConfigure = jest.fn();
jest.mock('@/features/dashboard/commands/configureStorefrontRepublish', () => ({
    ...jest.requireActual('@/features/dashboard/commands/configureStorefrontRepublish'),
    republishFromConfigure: (...a: unknown[]) => mockRepublishFromConfigure(...a),
}));
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: { refreshStatus: jest.fn().mockResolvedValue(undefined) },
}));

const SENTENCE = 'Now on CitiSignal: 11 category pages and 39 product pages published. 30 old product pages removed.';

interface Internals {
    handleStorefrontOnlyNotification(project: Project): Promise<boolean>;
    republishStorefront(project: Project): Promise<void>;
    showSuccessMessage(message: string): Promise<void>;
}

/** An Edge Delivery ACCS project now set to CitiSignal, last published on Main Website. */
function storeChangedProject(): Project {
    return createMockProject({
        name: 'shop',
        path: '/p/shop',
        selectedStack: 'eds-accs',
        componentSelections: { frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_WEBSITE_CODE: 'citisignal',
                ACCS_STORE_CODE: 'citisignal_store',
                ACCS_STORE_VIEW_CODE: 'citisignal_us',
            },
        },
        edsStorefrontState: {
            envVars: { ACCS_WEBSITE_CODE: 'base', ACCS_STORE_CODE: 'main_website_store', ACCS_STORE_VIEW_CODE: 'default' },
            lastPublished: '2026-10-01T00:00:00.000Z',
        },
    });
}

let command: Internals;

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(true);
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    command = new ConfigureProjectWebviewCommand(
        createMockExtensionContext(),
        createMockStateManager(),
        createMockLogger() as unknown as Logger,
    ) as unknown as Internals;
});

it('asks "The store changed. Republish the storefront?" with Republish and Later', async () => {
    await command.handleStorefrontOnlyNotification(storeChangedProject());

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "The store changed. Republish the storefront? Its product and category pages are replaced with the new store's.",
        'Republish',
        'Later',
    );
});

it('ends the Republish with the store-change sentence', async () => {
    mockRepublishFromConfigure.mockResolvedValue({
        success: true,
        published: { success: true, cdnPublished: true },
        storePages: SENTENCE,
    });
    const success = jest.spyOn(command, 'showSuccessMessage').mockResolvedValue(undefined);

    await command.republishStorefront(storeChangedProject());

    expect(success).toHaveBeenCalledWith(SENTENCE);
});

it('keeps the usual success line when no pages were replaced', async () => {
    mockRepublishFromConfigure.mockResolvedValue({ success: true, published: { success: true } });
    const success = jest.spyOn(command, 'showSuccessMessage').mockResolvedValue(undefined);

    await command.republishStorefront(storeChangedProject());

    expect(success).toHaveBeenCalledWith('Storefront configuration republished successfully');
});
