/**
 * Copy from Existing opens the wizard with exactly what Import from File would
 * (PL-56e): the file Export writes, read back through `readProjectFile`, the one
 * reader. Before 2026-10-04 Copy built its own seed in memory, so a copy carried
 * the source project's credentials and its storefront, and an import of the same
 * project did not.
 *
 * The real serializer and the real reader run; only VS Code and the picker are
 * doubles. What is asserted is the ARGUMENT the wizard is opened with.
 */

const mockExecuteCommand = jest.fn();
const mockQuickPick = jest.fn();
jest.mock(
    'vscode',
    () => ({
        commands: { executeCommand: (...args: unknown[]) => mockExecuteCommand(...args) },
    }),
    { virtual: true },
);
jest.mock('@/core/utils/quickPickUtils', () => ({
    showWebviewQuickPick: (...args: unknown[]) => mockQuickPick(...args),
}));

import { CATALOG_API_KEY } from '@/core/config/envVarKeys';
import { readProjectFile } from '@/core/state/projectFileReader';
import {
    createExportSettings,
} from '@/features/projects-dashboard/services/settingsSerializer';
import { copySettingsFromProject } from '@/features/projects-dashboard/services/settingsTransferService';
import { answerOperationPrompt, isAwaitingAnswer, withModalAsking } from '@/core/vscode/operationPrompt';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const SOURCE: Project = createMockProject({
    name: 'bodea-demo',
    path: '/projects/bodea-demo',
    title: 'Bodea Demo',
    selectedStack: 'eds-accs',
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_STORE_VIEW_CODE: 'bodea_us',
            [CATALOG_API_KEY]: 'fake-test-pw-not-a-secret',
        },
    },
    componentInstances: {
        'eds-storefront': {
            ...edsStorefrontInstance(),
            metadata: { githubRepo: 'someone/bodea-demo', daLiveOrg: 'someone' },
        },
    },
});

function contextWith(project: Project) {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getAllProjects: jest.fn().mockResolvedValue([{ name: project.name, path: project.path }]),
            loadProjectFromPath: jest.fn().mockResolvedValue(project),
        }),
    });
}

/** What Import from File would open the wizard with for this project's export. */
function importedFileOf(project: Project) {
    const read = readProjectFile(JSON.stringify(createExportSettings(project, '1.0.0-test')));
    if (!read.ok) throw new Error(read.error);
    return read.file;
}

describe('copySettingsFromProject', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuickPick.mockResolvedValue({ label: SOURCE.name, detail: SOURCE.path });
        mockExecuteCommand.mockResolvedValue(undefined);
    });

    it('opens the wizard with the file Import would read, apart from when and by which build', async () => {
        await copySettingsFromProject(contextWith(SOURCE));

        expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
        const [command, args] = mockExecuteCommand.mock.calls[0];
        expect(command).toBe('demoBuilder.createProject');
        const imported = importedFileOf(SOURCE);
        expect(args).toStrictEqual({
            importedSettings: {
                ...imported,
                exportedAt: expect.any(String),
                source: { ...imported.source, extension: expect.any(String) },
            },
            sourceDescription: 'bodea-demo',
        });
    });

    it('carries no credential and no storefront of the source project', async () => {
        await copySettingsFromProject(contextWith(SOURCE));

        const seed = mockExecuteCommand.mock.calls[0][1].importedSettings;
        // Control: the setting beside the credential did travel.
        expect(seed.configs['adobe-commerce-accs'].ACCS_STORE_VIEW_CODE).toBe('bodea_us');
        expect(seed.configs['adobe-commerce-accs']).not.toHaveProperty(CATALOG_API_KEY);
        expect(seed).not.toHaveProperty('edsConfig');
        // The source's repository is provenance, as in an exported file.
        expect(seed.source.storefront).toStrictEqual({
            githubRepo: 'someone/bodea-demo',
            daLiveOrg: 'someone',
            daLiveSite: 'bodea-demo',
        });
    });

    it('answers the settings it opened the wizard with', async () => {
        const result = await copySettingsFromProject(contextWith(SOURCE));

        expect(result).toStrictEqual({
            success: true,
            data: {
                success: true,
                settings: mockExecuteCommand.mock.calls[0][1].importedSettings,
                sourceDescription: 'bodea-demo',
            },
        });
    });

    describe('asked in the projects list modal', () => {
        async function copyAndAsk() {
            const done = withModalAsking('copy-settings', () => copySettingsFromProject(contextWith(SOURCE)));
            for (let i = 0; i < 200 && !isAwaitingAnswer('copy-settings'); i++) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            expect(isAwaitingAnswer('copy-settings')).toBe(true);
            return { done };
        }

        it('opens the wizard from the project chosen there, with no QuickPick', async () => {
            const { done } = await copyAndAsk();
            answerOperationPrompt('copy-settings', 'Copy settings', { project: SOURCE.path });
            await done;

            expect(mockQuickPick).not.toHaveBeenCalled();
            expect(mockExecuteCommand.mock.calls[0][1].sourceDescription).toBe(SOURCE.name);
        });

        it('opens nothing when the modal is dismissed', async () => {
            const { done } = await copyAndAsk();
            answerOperationPrompt('copy-settings', undefined, { project: SOURCE.path });

            expect((await done).data).toEqual({ success: false, error: 'cancelled' });
            expect(mockExecuteCommand).not.toHaveBeenCalled();
        });
    });
});
