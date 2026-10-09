/**
 * integrationUpdatePicker — the Check for Updates shell around integration pairs
 * (AB-73): the rows, the context that can run deploys, and the toasts.
 *
 * The dashboard handler module's boundary functions are mocked (the probe and
 * the guarded pair update); the row building and the apply loop are real.
 */

import * as vscode from 'vscode';
import { createHeadlessHandlerContext } from '@/features/ai/server/headlessHandlerContext';
import {
    integrationUpdateProbe,
    updateIntegrationPairFor,
} from '@/features/dashboard/handlers/integrationUpdateHandlers';
import {
    detectIntegrationUpdateItems,
    integrationPairUpdater,
    performIntegrationUpdates,
} from '@/features/updates/commands/integrationUpdatePicker';
import type { IntegrationUpdateItem } from '@/features/updates/commands/updateTypes';
import { OTHER_ORG_NOTE, type IntegrationUpdateProbe } from '@/features/updates/services/integrationUpdates';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/ai/server/headlessHandlerContext', () => ({
    createHeadlessHandlerContext: jest.fn(() => ({ headless: true })),
}));
jest.mock('@/features/dashboard/handlers/integrationUpdateHandlers', () => ({
    integrationUpdateProbe: jest.fn(),
    updateIntegrationPairFor: jest.fn(),
}));

const headlessMock = createHeadlessHandlerContext as jest.Mock;
const probeMock = integrationUpdateProbe as jest.Mock;
const updateForMock = updateIntegrationPairFor as jest.Mock;
const showInfo = vscode.window.showInformationMessage as jest.Mock;
const showError = vscode.window.showErrorMessage as jest.Mock;
const withProgress = vscode.window.withProgress as jest.Mock;

const SOURCE = { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' };
const NEWER = { commit: 'abc', checkedAt: '2026-10-09T00:00:00.000Z' };

function deployed(overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind: 'integration', status: 'deployed', name: 'ERP Integration', source: SOURCE, ...overrides };
}

function pairProject(name = 'Justrite'): Project {
    return createMockProject({
        name,
        path: `/p/${name.toLowerCase()}`,
        appBuilderComponents: {
            'erp-integration': deployed({ systems: ['demo-erp'] }),
            'demo-erp': deployed({ kind: 'system', name: `${name} ERP`, usedBy: 'erp-integration', updateAvailable: NEWER }),
        },
        componentInstances: {
            'erp-integration': { id: 'erp-integration', name: 'ERP Integration', status: 'ready', path: '/p/erp' },
            'demo-erp': { id: 'demo-erp', name: `${name} ERP`, status: 'ready', path: '/p/erp-system' },
        },
    });
}

function parts() {
    return {
        context: createMockExtensionContext({ extensionPath: '/ext' }),
        stateManager: createMockStateManager(),
        logger: createMockLogger(),
    };
}

function probe(inOtherOrg = false): IntegrationUpdateProbe {
    return {
        check: async (project) => ({
            reports: Object.entries(project.appBuilderComponents ?? {}).map(([id, state]) => ({
                id,
                available: Boolean(state.updateAvailable),
            })),
            changed: false,
        }),
        inOtherOrg: async () => inOtherOrg,
        catalog: [],
    };
}

function row(project: Project, otherOrg = false): IntegrationUpdateItem {
    return {
        label: project.name,
        update: { project, componentId: 'demo-erp', members: ['demo-erp'], label: 'ERP Integration and Justrite ERP', otherOrg },
        isIntegrationUpdate: true,
    };
}

function makeCtx(updateIntegrationPair = jest.fn()) {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        stateManager: createMockStateManager(),
        commandManager: createMockCommandExecutor(),
        logger: createMockLogger(),
        updateIntegrationPair,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    probeMock.mockReturnValue(probe());
    withProgress.mockImplementation(async (_options: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
        task({ report: jest.fn() }),
    );
});

describe('detectIntegrationUpdateItems', () => {
    it('builds nothing for projects without deployed integrations', async () => {
        const items = await detectIntegrationUpdateItems(parts(), [createMockProject({ name: 'plain' })], null);

        expect(items).toStrictEqual([]);
        expect(headlessMock).not.toHaveBeenCalled();
    });

    it('one row per pair, under its project, with the current project first in line and ticked', async () => {
        const p = parts();
        const justrite = pairProject('Justrite');
        const bodea = pairProject('Bodea');

        const items = await detectIntegrationUpdateItems(p, [justrite, bodea], bodea);

        expect(headlessMock).toHaveBeenCalledWith(p.context, p.stateManager, p.logger);
        expect(probeMock).toHaveBeenCalledWith({ headless: true });
        expect(items.map((item) => [item.label, item.picked, item.update.project])).toEqual([
            ['Justrite', false, justrite],
            ['Bodea (current)', true, bodea],
        ]);
        expect(items[0].detail).toContain('ERP Integration and Justrite ERP');
        expect(items[0].detail).toContain('update available');
        expect(items[0].description).toBe('skukla/commerce-erp-integration');
    });

    it("a pair in another Adobe org is listed unticked, saying to open that project", async () => {
        probeMock.mockReturnValue(probe(true));
        const justrite = pairProject();

        const [item] = await detectIntegrationUpdateItems(parts(), [justrite], justrite);

        expect(item.picked).toBe(false);
        expect(item.update.otherOrg).toBe(true);
        expect(item.detail).toContain(OTHER_ORG_NOTE);
    });

    it('a check that throws costs only the integration rows, and says so in the log', async () => {
        const p = parts();
        probeMock.mockReturnValue({ ...probe(), check: async () => { throw new Error('git is not installed'); } });

        const items = await detectIntegrationUpdateItems(p, [pairProject()], null);

        expect(items).toStrictEqual([]);
        expect(p.logger.warn).toHaveBeenCalledTimes(1);
    });
});

describe('integrationPairUpdater', () => {
    it('runs the guarded pair update the card runs, under one headless context', async () => {
        const p = parts();
        const project = pairProject();
        const report = jest.fn();
        updateForMock.mockResolvedValue({ success: true, detail: 'done' });

        const update = integrationPairUpdater(p);
        const first = await update(project, 'demo-erp', report);
        await update(project, 'erp-integration', report);

        expect(first).toEqual({ success: true, detail: 'done' });
        expect(updateForMock).toHaveBeenCalledWith({ headless: true }, project, 'demo-erp', report);
        expect(headlessMock).toHaveBeenCalledTimes(1);
    });
});

describe('performIntegrationUpdates', () => {
    it('updates under one progress and says what each update did', async () => {
        const ctx = makeCtx(jest.fn(async () => ({ success: true, detail: 'Updated from a to b.' })));

        await performIntegrationUpdates([row(pairProject())], ctx);

        expect(withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Updating Integrations' }),
            expect.any(Function),
        );
        expect(ctx.updateIntegrationPair).toHaveBeenCalledWith(expect.anything(), 'demo-erp', expect.any(Function));
        expect(showInfo).toHaveBeenCalledWith('Updated from a to b.');
        expect(showError).not.toHaveBeenCalled();
    });

    it('a failed update is reported in plain words, and nothing else pretends it worked', async () => {
        const ctx = makeCtx(jest.fn(async () => ({ success: false, error: 'The integration folder has changes of its own (a.js).' })));

        await performIntegrationUpdates([row(pairProject())], ctx);

        expect(showError).toHaveBeenCalledWith(
            'ERP Integration and Justrite ERP in Justrite did not update: The integration folder has changes of its own (a.js).',
        );
        expect(showInfo).not.toHaveBeenCalled();
    });

    it('a pair in another Adobe org is not deployed from this one: it says to open that project', async () => {
        const ctx = makeCtx();

        await performIntegrationUpdates([row(pairProject(), true)], ctx);

        expect(ctx.updateIntegrationPair).not.toHaveBeenCalled();
        expect(showInfo).toHaveBeenCalledWith(`ERP Integration and Justrite ERP in Justrite ${OTHER_ORG_NOTE}.`);
    });
});
