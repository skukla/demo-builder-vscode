/**
 * finishSetupHandlers — the project's Finish Setup steps (PL-101): list them, Skip / Undo Skip /
 * Mark as Done, and Check. Answers as the integration checklist's handlers do
 * (`{ success, data: { items } }`), so the setup guide's hook reads both the same way.
 *
 * Real: the StateManager fake, the install record on disk (a temp project folder), the root
 * step's check and the code step's comparison. Faked: the boundaries outside the extension:
 * Commerce (`openProjectStore`'s store), GitHub (`getGitHubServices`) and the live site (`fetch`).
 */

const mockOpenStore = jest.fn();
jest.mock('@/features/data-installer/handlers/storeChangesHandlers', () => ({
    openProjectStore: (...args: unknown[]) => mockOpenStore(...args),
}));
const mockGithub = { getLatestCommitSha: jest.fn(), getFileContent: jest.fn() };
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: () => ({ fileOperations: mockGithub }),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    handleCheckFinishSetupSteps,
    handleGetFinishSetup,
    handlePrepareFinishSetupChecks,
    handleSetFinishSetupStep,
} from '@/features/dashboard/handlers/finishSetupHandlers';
import type { ProjectStore } from '@/features/data-installer/handlers/storeChangesHandlers';
import {
    nodeRecordFiles,
    openInstallRecord,
    readInstallRecord,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { FinishSetupRecord, Project } from '@/types/base';
import type { CommerceGet } from '@/types/commerceWire';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';
import { makeStateManager } from '../../../helpers/stateManagerFake';

const PACK = { name: 'frescopa', version: 'main' };
const ROOT: PackRootStep = {
    state: 'open',
    storeCode: 'main_store',
    storeName: 'Main Store',
    rootId: 300,
    rootName: 'Frescopa',
    storeRootId: 2,
    sharedWith: 'Luma Store',
};

let projectDir: string;
const originalFetch = global.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-setup-'));
    mockGithub.getLatestCommitSha.mockResolvedValue('head');
    mockGithub.getFileContent.mockImplementation(async (_o: string, _r: string, file: string) => ({
        content: 'new',
        sha: 's',
        path: file,
    }));
});

afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(projectDir, { recursive: true, force: true });
});

/** The live site: a body per file (absent = 404). */
function serve(body: Record<string, string>): void {
    global.fetch = jest.fn(async (url: string) => {
        const text = body[new URL(url).pathname.slice(1)];
        return { ok: text !== undefined, text: async () => text };
    }) as unknown as typeof fetch;
}

/** The pack's install record on disk, holding its root step. */
async function recordRootStep(step: PackRootStep): Promise<void> {
    const recorder = await openInstallRecord(
        nodeRecordFiles,
        projectDir,
        PACK,
        () => '2026-11-17T09:00:00.000Z'
    );
    await recorder.setRootStep(step);
}

/** A store whose `store/storeGroups` shows the given root for Main Store. */
function storeShowing(rootId: number): void {
    const get: CommerceGet = async (route: string) =>
        route === 'store/storeGroups' ? [{ code: 'main_store', root_category_id: rootId }] : null;
    const store: ProjectStore = {
        project: createMockProject({ path: projectDir }),
        deps: {
            commerce: async () => ({ get, send: jest.fn() }),
            readPack: jest.fn(),
            describe: jest.fn(),
            projectPath: projectDir,
            target: undefined,
            log: jest.fn(),
        },
    };
    mockOpenStore.mockResolvedValue(store);
}

function setup(finishSetup?: Record<string, FinishSetupRecord>, withPack = false) {
    const eds = edsStorefrontInstance();
    const project = createMockProject({
        path: projectDir,
        selectedStack: 'eds-paas',
        componentInstances: {
            'eds-storefront': { ...eds, metadata: { githubRepo: 'acme/demo-storefront' } },
        },
        ...(finishSetup ? { finishSetup } : {}),
        ...(withPack ? { datapack: PACK } : {}),
    });
    const stateManager = makeStateManager(project);
    const context = createMockHandlerContext({ stateManager }) as HandlerContext;
    const saved = () =>
        (stateManager.saveProject as jest.Mock).mock.calls.at(-1)?.[0] as Project | undefined;
    return { context, saved };
}

const itemsOf = (result: HandlerResponse) => (result.data as { items: SetupChecklistItem[] }).items;
const CODE = { 'republish-code': { files: ['scripts/commerce.js'] } };

describe('getFinishSetup', () => {
    it("lists the project's steps: the code step, then the datapack's root step from its install record", async () => {
        await recordRootStep(ROOT);
        const { context } = setup(CODE, true);

        const result = await handleGetFinishSetup(context, undefined);

        expect(result.success).toBe(true);
        expect(itemsOf(result).map((item) => [item.id, item.title, item.state])).toStrictEqual([
            ['republish-code', 'Republish the Code', 'open'],
            ['pack-root-category', 'Set the Root Category', 'open'],
        ]);
    });

    it('lists nothing for a project no run left anything on', async () => {
        const { context } = setup();

        await expect(handleGetFinishSetup(context, undefined)).resolves.toStrictEqual({
            success: true,
            data: { items: [] },
        });
    });

    it('refuses when no project is open', async () => {
        const context = createMockHandlerContext({
            stateManager: makeStateManager(null),
        }) as HandlerContext;

        await expect(handleGetFinishSetup(context, undefined)).resolves.toMatchObject({
            success: false,
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
    });
});

describe('setFinishSetupStep', () => {
    it('Skip saves the step dismissed on the project, keeping its files', async () => {
        const { context, saved } = setup(CODE);

        const result = await handleSetFinishSetupStep(context, {
            stepId: 'republish-code',
            state: 'dismissed',
        });

        expect(saved()?.finishSetup).toStrictEqual({
            'republish-code': { files: ['scripts/commerce.js'], state: 'dismissed' },
        });
        expect(itemsOf(result)[0].state).toBe('dismissed');
    });

    it('Undo Skip opens the step again', async () => {
        const { context, saved } = setup({
            'republish-code': { files: ['scripts/commerce.js'], state: 'dismissed' },
        });

        await handleSetFinishSetupStep(context, { stepId: 'republish-code', state: 'open' });

        expect(saved()?.finishSetup).toStrictEqual(CODE);
    });

    it("Mark as Done on the datapack's step saves it done on the project", async () => {
        await recordRootStep(ROOT);
        const { context, saved } = setup(undefined, true);

        const result = await handleSetFinishSetupStep(context, {
            stepId: 'pack-root-category',
            state: 'done',
        });

        expect(saved()?.finishSetup).toStrictEqual({ 'pack-root-category': { state: 'done' } });
        expect(itemsOf(result)[0]).toMatchObject({ id: 'pack-root-category', state: 'done' });
    });

    it('refuses a step the project does not have, and a state that is not done, dismissed or open', async () => {
        const { context, saved } = setup(CODE);

        await expect(
            handleSetFinishSetupStep(context, { stepId: 'nope', state: 'done' })
        ).resolves.toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
        await expect(
            handleSetFinishSetupStep(context, { stepId: 'republish-code', state: 'later' })
        ).resolves.toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
        expect(saved()).toBeUndefined();
    });
});

describe('checkFinishSetupSteps', () => {
    it('marks the code step done when the live site serves its files, reading only', async () => {
        serve({ 'scripts/commerce.js': 'new' });
        const { context, saved } = setup(CODE);

        const result = await handleCheckFinishSetupSteps(context, { stepId: 'republish-code' });

        expect(saved()?.finishSetup?.['republish-code']).toMatchObject({
            files: ['scripts/commerce.js'],
            state: 'done',
            lastCheck: 'passed',
        });
        expect(itemsOf(result)[0]).toMatchObject({ state: 'done', checkState: 'passed' });
        expect(mockGithub.getFileContent).toHaveBeenCalledWith(
            'acme',
            'demo-storefront',
            'scripts/commerce.js',
            'head'
        );
    });

    it('leaves the code step open, naming the file, when the site still serves the old code', async () => {
        serve({ 'scripts/commerce.js': 'old' });
        const { context, saved } = setup({
            'republish-code': { files: ['scripts/commerce.js'], state: 'done' },
        });

        await handleCheckFinishSetupSteps(context, { stepId: 'republish-code' });

        const record = saved()?.finishSetup?.['republish-code'];
        expect(record).not.toHaveProperty('state');
        expect(record).toMatchObject({ lastCheck: 'failed' });
        expect(record?.note).toContain('scripts/commerce.js');
    });

    it("marks the datapack's step done on its install record when the store shows the pack's root", async () => {
        await recordRootStep(ROOT);
        storeShowing(300);
        const { context, saved } = setup({ 'pack-root-category': { state: 'dismissed' } }, true);

        const result = await handleCheckFinishSetupSteps(context, { stepId: 'pack-root-category' });

        expect(itemsOf(result)[0]).toMatchObject({
            id: 'pack-root-category',
            state: 'done',
            checkState: 'passed',
        });
        expect((await readInstallRecord(nodeRecordFiles, projectDir, PACK))?.rootStep?.state).toBe(
            'done'
        );
        // The check decides now: the Skip the SC gave it no longer stands over it.
        expect(saved()?.finishSetup).toBeUndefined();
    });

    it("answers the store's refusal when the project's store cannot be opened", async () => {
        await recordRootStep(ROOT);
        const refusal = {
            success: false,
            error: 'Use "Switch IMS Org" to continue.',
            code: ErrorCode.ORG_MISMATCH,
        };
        mockOpenStore.mockResolvedValue({ response: refusal });
        const { context } = setup(undefined, true);

        await expect(
            handleCheckFinishSetupSteps(context, { stepId: 'pack-root-category' })
        ).resolves.toStrictEqual(refusal);
    });

    it('refuses a step it cannot check', async () => {
        const { context } = setup(CODE);

        await expect(
            handleCheckFinishSetupSteps(context, { stepId: 'nope' })
        ).resolves.toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
    });
});

describe('prepareFinishSetupChecks', () => {
    it('answers the steps, signing in to nothing ahead', async () => {
        const { context } = setup(CODE);

        const result = await handlePrepareFinishSetupChecks(context, undefined);

        expect(itemsOf(result).map((item) => item.id)).toStrictEqual(['republish-code']);
        expect(mockOpenStore).not.toHaveBeenCalled();
    });
});
