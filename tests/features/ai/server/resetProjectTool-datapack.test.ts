/**
 * reset_project's Uninstall Datapack (step-05 S7, owner 2026-11-13): the window's choice, with
 * delete_project's save answers (`removeData`, `changes`, `saveAs`). Both kinds of reset take it
 * through the window's own path: a headless reset hands the answer to `executeProjectReset`, a
 * storefront reset removes the data with `{ given }` before the storefront reset runs, as
 * `resetEdsProjectWithUI` does. Changes nobody answered refuse the call and remove nothing.
 *
 * The removal and the two reset cores are mocked, so what each is HANDED is asserted.
 */

jest.mock('@/features/lifecycle/services/projectResetService', () => ({
    executeProjectReset: jest.fn(),
}));
jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    executeEdsReset: jest.fn(),
}));
jest.mock('@/features/eds/services/reset/edsResetSampleData', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetSampleData'),
    removeProjectSampleDataOutcome: jest.fn(),
}));
jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetParams'),
    extractResetParams: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(),
    resolveByomOverlayConfig: jest.fn(),
}));
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({})),
}));
jest.mock('@/features/ai/server/edsToolGuards', () => ({
    requireGitHub: jest.fn(async () => undefined),
    requireDaLive: jest.fn(async () => undefined),
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: async () => ({ valid: true }) }),
        })),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
    },
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { extractResetParams } from '@/features/eds/services/reset/edsResetParams';
import { removeProjectSampleDataOutcome } from '@/features/eds/services/reset/edsResetSampleData';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import { FailedAfterDatapack } from '@/features/eds/services/reset/resetDatapackStep';
import { executeProjectReset } from '@/features/lifecycle/services/projectResetService';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';
import { callResetProject, getCurrentProject } from './resetProjectTool.testUtils';

const mockedHeadless = executeProjectReset as jest.MockedFunction<typeof executeProjectReset>;
const mockedEds = executeEdsReset as jest.MockedFunction<typeof executeEdsReset>;
const mockedRemove = removeProjectSampleDataOutcome as jest.MockedFunction<
    typeof removeProjectSampleDataOutcome
>;
const mockedParams = extractResetParams as jest.MockedFunction<typeof extractResetParams>;

/** A confirmed call: consent is not what these cases are about. */
const call = (args: Record<string, unknown>) => callResetProject({ confirm: true, ...args });

const PACK = { name: 'bodea', version: 'main', store: 'library' as const };
const project = (overrides: Partial<Project> = {}): Project =>
    createMockProject({
        name: 'acme',
        path: '/p/acme',
        status: 'ready',
        selectedStack: 'headless-paas',
        componentInstances: {},
        datapack: PACK,
        componentSelections: { backend: 'adobe-commerce-accs' },
        ...overrides,
    });
const storefront = (overrides: Partial<Project> = {}): Project =>
    project({ selectedStack: 'eds-paas', ...overrides });

const UNANSWERED = 'You changed 2 things since it was installed. They were not answered.';

beforeEach(() => {
    jest.clearAllMocks();
    mockedHeadless.mockResolvedValue({ success: true, meshRedeployed: false });
    mockedRemove.mockResolvedValue({});
    mockedParams.mockReturnValue({
        success: true,
        params: {
            repoOwner: 'me',
            repoName: 'shop',
            daLiveOrg: 'me',
            daLiveSite: 'shop',
            templateOwner: 't',
            templateRepo: 'tpl',
            project: storefront(),
        },
    });
    mockedEds.mockResolvedValue({
        success: true,
        filesReset: 1,
        contentCopied: 1,
        meshRedeployed: false,
    });
});

describe('reset_project on a headless project, with removeData', () => {
    it("hands the reset the call's answer: a new datapack's name to save the changes as", async () => {
        getCurrentProject.mockResolvedValue(project());

        await call({ removeData: true, changes: 'keep', saveAs: { displayName: 'My Bodea' } });

        expect(mockedHeadless.mock.calls[0][2]).toStrictEqual({
            removeDatapack: true,
            changes: { saveAs: 'My Bodea' },
        });
    });

    it('hands it no answer about the changes when the call gave none', async () => {
        getCurrentProject.mockResolvedValue(project());

        await call({ removeData: true });

        expect(mockedHeadless.mock.calls[0][2]).toStrictEqual({
            removeDatapack: true,
            changes: undefined,
        });
    });

    it.each([{}, { removeData: false, changes: 'drop' }, { removeData: 'yes' }])(
        'removes nothing unless removeData is true: %j',
        async (args) => {
            getCurrentProject.mockResolvedValue(project());

            await call(args);

            expect(mockedHeadless.mock.calls[0][2]).toBeUndefined();
        }
    );

    it("says what happened to the datapack, in the window row's words", async () => {
        getCurrentProject.mockResolvedValue(project());
        mockedHeadless.mockResolvedValueOnce({
            success: true,
            meshRedeployed: false,
            datapackRemoval: {},
        });
        expect(await call({ removeData: true, changes: 'drop' })).toMatchObject({
            reset: true,
            datapack: 'Its datapack was uninstalled.',
        });

        mockedHeadless.mockResolvedValueOnce({
            success: true,
            meshRedeployed: false,
            datapackRemoval: { kept: 'Categories could not be removed.', partly: true },
        });
        expect(await call({ removeData: true, changes: 'drop' })).toMatchObject({
            reset: true,
            datapack: 'Part of its datapack was uninstalled: Categories could not be removed.',
        });
    });

    it('refuses, resetting nothing, when the changes were not answered, and says how to answer', async () => {
        getCurrentProject.mockResolvedValue(project());
        mockedHeadless.mockResolvedValueOnce({
            success: false,
            error: UNANSWERED,
            datapackRemoval: { kept: UNANSWERED, unanswered: true },
        });

        const res = await call({ removeData: true });

        expect(res).toMatchObject({ reset: false, project: 'acme', code: 'CHANGES_NEED_ANSWER' });
        expect(res.error).toContain(UNANSWERED);
        expect(res.error).toContain('Nothing was reset.');
        expect(res.error).toContain('changes:"keep" with saveAs');
        expect(res.error).toContain('changes:"drop"');
    });

    it('says what became of the datapack when the reset failed after uninstalling it', async () => {
        getCurrentProject.mockResolvedValue(project());
        mockedHeadless.mockRejectedValueOnce(
            new FailedAfterDatapack(new Error('git clone failed'), {})
        );

        expect(await call({ removeData: true, changes: 'drop' })).toMatchObject({
            reset: false,
            rerunSafe: true,
            datapack: 'Its datapack was uninstalled.',
        });
    });
});

describe('reset_project on a storefront, with removeData', () => {
    it('removes the data first, handing the removal this project and the answer as given', async () => {
        const held = storefront();
        getCurrentProject.mockResolvedValue(held);
        const order: string[] = [];
        mockedRemove.mockImplementation(async () => {
            order.push('remove');
            return {};
        });
        mockedEds.mockImplementation(async () => {
            order.push('reset');
            return { success: true, filesReset: 1, contentCopied: 1, meshRedeployed: false };
        });

        const res = await call({ removeData: true, changes: 'drop' });

        const [handed, , , answering] = mockedRemove.mock.calls[0];
        expect(handed).toBe(held);
        expect(answering).toStrictEqual({ given: 'drop' });
        expect(order).toStrictEqual(['remove', 'reset']);
        expect(res).toMatchObject({
            reset: true,
            kind: 'storefront',
            datapack: 'Its datapack was uninstalled.',
        });
    });

    it('refuses, resetting nothing, when the changes were not answered', async () => {
        getCurrentProject.mockResolvedValue(storefront());
        mockedRemove.mockResolvedValueOnce({ kept: UNANSWERED, unanswered: true });

        const res = await call({ removeData: true });

        expect(mockedRemove.mock.calls[0][3]).toStrictEqual({ given: undefined });
        expect(res).toMatchObject({ reset: false, code: 'CHANGES_NEED_ANSWER' });
        expect(res.error).toContain('Nothing was reset.');
        expect(mockedEds).not.toHaveBeenCalled();
    });

    it('goes on when the data stayed for another reason, saying why', async () => {
        getCurrentProject.mockResolvedValue(storefront());
        mockedRemove.mockResolvedValueOnce({ kept: 'The Data Installer is down.' });

        expect(await call({ removeData: true, changes: 'drop' })).toMatchObject({
            reset: true,
            datapack: 'Its datapack was not uninstalled: The Data Installer is down.',
        });
    });

    it('says what became of the datapack when the storefront reset failed after it', async () => {
        getCurrentProject.mockResolvedValue(storefront());
        mockedEds.mockResolvedValueOnce({
            success: false,
            error: 'Push refused',
            errorType: 'GITHUB',
        });

        expect(await call({ removeData: true, changes: 'drop' })).toMatchObject({
            reset: false,
            datapack: 'Its datapack was uninstalled.',
        });
    });

    it('says there was nothing to uninstall when the project has no datapack, and still resets', async () => {
        getCurrentProject.mockResolvedValue(storefront({ datapack: undefined }));

        const res = await call({ removeData: true });

        expect(mockedRemove).not.toHaveBeenCalled();
        expect(res).toMatchObject({ reset: true });
        expect(res.datapack).toContain('none to uninstall');
    });

    it('CONTROL: removes nothing without removeData:true', async () => {
        getCurrentProject.mockResolvedValue(storefront());

        const res = await call({ changes: 'drop' });

        expect(mockedRemove).not.toHaveBeenCalled();
        expect(res).toMatchObject({ reset: true });
        expect(res).not.toHaveProperty('datapack');
    });
});

describe('reset_project with removeData, before consent', () => {
    it('says in its refusal that the reset would also uninstall the datapack, and removes nothing', async () => {
        getCurrentProject.mockResolvedValue(project());

        const res = await callResetProject({ removeData: true });

        expect(res.error).toContain("It also uninstalls the project's datapack, removing its data from Commerce.");
        expect(mockedHeadless).not.toHaveBeenCalled();
        expect(mockedRemove).not.toHaveBeenCalled();
    });
});
