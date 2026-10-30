/**
 * Every export door asks about a private pack (owner, 2026-10-30): the projects list's Export and
 * the dashboard's bundle ask a person first; `export_project_settings` and an agent's
 * `export_demo_bundle` answer the note instead. The question itself has its own suite
 * (`privatePackPrompt.test.ts`); here it is mocked and WHERE it is asked is asserted.
 */

jest.mock('@/features/data-installer/handlers/privatePackPrompt', () => ({
    offerToShareBeforeExport: jest.fn(async () => 'declined'),
    privatePackNote: jest.fn(async () => 'NOTE'),
}));
jest.mock('@/features/projects-dashboard/services/settingsTransferService', () => ({
    exportProjectSettings: jest.fn(async () => ({ success: true, data: { success: true, filePath: '/p/acme.json' } })),
    exportProjectSettingsToFile: jest.fn(async () => ({ path: '/p/acme.json', verify: 'ok' })),
}));

import { handleExportDemoBundle } from '@/features/dashboard/handlers/exportDemoBundleHandler';
import { handleExportProjectSettings } from '@/features/dashboard/handlers/projectManagementHandlers';
import { offerToShareBeforeExport, privatePackNote } from '@/features/data-installer/handlers/privatePackPrompt';
import { handleExportProject } from '@/features/projects-dashboard/handlers/projectsListTransfer';
import { exportProjectSettings } from '@/features/projects-dashboard/services/settingsTransferService';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';
import { libraryPackProject } from './privatePackPrompt.testUtils';

const PROJECT = libraryPackProject();
const mockedOffer = offerToShareBeforeExport as jest.Mock;
const mockedNote = privatePackNote as jest.Mock;
const mockedDialog = exportProjectSettings as jest.Mock;

function contextWith(panel: boolean): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(PROJECT),
            loadProjectFromPath: jest.fn().mockResolvedValue(PROJECT),
        }),
        ...(panel ? { panel: createMockWebviewPanel() as unknown as HandlerContext['panel'] } : {}),
    }) as HandlerContext;
}

beforeEach(() => jest.clearAllMocks());

it("the projects list's Export asks before the save dialog opens", async () => {
    const order: string[] = [];
    mockedOffer.mockImplementationOnce(async () => (order.push('ask'), 'declined'));
    mockedDialog.mockImplementationOnce(async () => (order.push('save dialog'), { success: true }));

    await handleExportProject(contextWith(true), { projectPath: PROJECT.path });

    expect(order).toEqual(['ask', 'save dialog']);
    expect(mockedOffer).toHaveBeenCalledWith(expect.anything(), PROJECT);
});

it('export_project_settings answers the note, asking no one', async () => {
    const res = await handleExportProjectSettings(contextWith(false), {});

    expect(res).toEqual({ success: true, data: { path: '/p/acme.json', verify: 'ok', packNote: 'NOTE' } });
    expect(mockedOffer).not.toHaveBeenCalled();
});

it("the dashboard's export asks a person once, and carries no note", async () => {
    const res = await handleExportDemoBundle(contextWith(true), { setup: true, storefront: false });

    expect(mockedOffer).toHaveBeenCalledTimes(1);
    expect(mockedNote).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
});

it("an agent's export_demo_bundle answers the note, asking no one", async () => {
    const res = await handleExportDemoBundle(contextWith(false), { setup: true, storefront: false, path: 'acme.json' });

    expect(res).toEqual({ success: true, data: { path: '/p/acme.json', fileCount: 1, parts: ['setup'], packNote: 'NOTE' } });
    expect(mockedOffer).not.toHaveBeenCalled();
});

it('a bundle without its setup part asks nothing: it names no pack', async () => {
    await handleExportDemoBundle(contextWith(false), { setup: false, storefront: true });

    expect(mockedOffer).not.toHaveBeenCalled();
    expect(mockedNote).not.toHaveBeenCalled();
});
