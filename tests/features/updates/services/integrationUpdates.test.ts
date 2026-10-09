/**
 * integrationUpdates — integration pairs with newer code, across projects, as the
 * extension's update check and `apply_updates` see them (AB-73).
 *
 * The probe (the per-project check, the org step of the guard chain, the catalog)
 * is handed in; links are STORED on the records, so the catalog is empty. The
 * apply loop is driven with a fake pair updater on the context.
 */

import {
    OTHER_ORG_NOTE,
    applyIntegrationUpdates,
    describeIntegrationUpdate,
    findIntegrationPairUpdates,
    type IntegrationPairUpdate,
    type IntegrationUpdateProbe,
} from '@/features/updates/services/integrationUpdates';
import type { IntegrationPairUpdater } from '@/features/updates/services/updateCore';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const SOURCE = { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' };
const NEWER = { commit: 'abc', checkedAt: '2026-10-09T00:00:00.000Z' };

function deployed(overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind: 'integration', status: 'deployed', name: 'ERP Integration', source: SOURCE, ...overrides };
}

function pairProject(name: string, erp: Partial<AppBuilderComponentState> = {}, integration: Partial<AppBuilderComponentState> = {}): Project {
    return createMockProject({
        name,
        path: `/p/${name.toLowerCase()}`,
        appBuilderComponents: {
            'erp-integration': deployed({ systems: ['demo-erp'], ...integration }),
            'demo-erp': deployed({ kind: 'system', name: `${name} ERP`, usedBy: 'erp-integration', ...erp }),
        },
        componentInstances: {
            'erp-integration': { id: 'erp-integration', name: 'ERP Integration', status: 'ready', path: '/p/erp' },
            'demo-erp': { id: 'demo-erp', name: `${name} ERP`, status: 'ready', path: '/p/erp-system' },
        },
    });
}

/** The probe as the handler module binds it, with both answers scriptable. */
function probe() {
    const check: jest.MockedFunction<IntegrationUpdateProbe['check']> = jest.fn(async (project) => ({
        reports: Object.entries(project.appBuilderComponents ?? {}).map(([id, state]) => ({
            id,
            available: Boolean(state.updateAvailable),
        })),
        changed: false,
    }));
    const inOtherOrg = jest.fn<Promise<boolean>, [Project]>(async () => false);
    const p: IntegrationUpdateProbe = { check, inOtherOrg, catalog: [] };
    return { p, check, inOtherOrg };
}

function makeCtx() {
    const updateIntegrationPair = jest.fn<ReturnType<IntegrationPairUpdater>, Parameters<IntegrationPairUpdater>>(
        async () => ({ success: true, detail: 'Updated from a to b.' }),
    );
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        stateManager: createMockStateManager(),
        commandManager: createMockCommandExecutor(),
        logger: createMockLogger(),
        updateIntegrationPair,
    };
}

function pair(overrides: Partial<IntegrationPairUpdate> = {}): IntegrationPairUpdate {
    return {
        project: pairProject('Justrite', { updateAvailable: NEWER }),
        componentId: 'demo-erp',
        members: ['demo-erp'],
        label: 'ERP Integration and Justrite ERP',
        otherOrg: false,
        ...overrides,
    };
}

describe('findIntegrationPairUpdates', () => {
    it('a project with no deployed integrations is never checked', async () => {
        const { p, check, inOtherOrg } = probe();

        const found = await findIntegrationPairUpdates([createMockProject({ name: 'plain' })], p);

        expect(found).toStrictEqual([]);
        expect(check).not.toHaveBeenCalled();
        expect(inOtherOrg).not.toHaveBeenCalled();
    });

    it('one row per pair, named integration first, asked for the member with newer code', async () => {
        const project = pairProject('Justrite', { updateAvailable: NEWER });

        const found = await findIntegrationPairUpdates([project], probe().p);

        expect(found).toEqual([
            {
                project,
                componentId: 'demo-erp',
                members: ['demo-erp'],
                label: 'ERP Integration and Justrite ERP',
                otherOrg: false,
            },
        ]);
    });

    it('asks for the integration when it has newer code, so its ERP with newer code goes first', async () => {
        const project = pairProject('Justrite', { updateAvailable: NEWER }, { updateAvailable: NEWER });

        const [found] = await findIntegrationPairUpdates([project], probe().p);

        expect(found.componentId).toBe('erp-integration');
        expect(found.members).toEqual(['demo-erp', 'erp-integration']);
    });

    it('lists every project, in order, and leaves a current pair out', async () => {
        const justrite = pairProject('Justrite', { updateAvailable: NEWER });
        const bodea = pairProject('Bodea');
        const acme = pairProject('Acme', {}, { updateAvailable: NEWER });

        const found = await findIntegrationPairUpdates([justrite, bodea, acme], probe().p);

        expect(found.map((f) => [f.project.name, f.componentId])).toEqual([
            ['Justrite', 'demo-erp'],
            ['Acme', 'erp-integration'],
        ]);
    });

    it("marks a pair whose project's Adobe org the token does not reach, asking the chain's org step once per project", async () => {
        const project = pairProject('Justrite', { updateAvailable: NEWER });
        const { p, inOtherOrg } = probe();
        inOtherOrg.mockResolvedValue(true);

        const [found] = await findIntegrationPairUpdates([project], p);

        expect(found.otherOrg).toBe(true);
        expect(inOtherOrg).toHaveBeenCalledTimes(1);
        expect(inOtherOrg).toHaveBeenCalledWith(project);
    });

    it('does not ask about the org when nothing is newer', async () => {
        const { p, check, inOtherOrg } = probe();

        await findIntegrationPairUpdates([pairProject('Bodea')], p);

        expect(check).toHaveBeenCalledTimes(1);
        expect(inOtherOrg).not.toHaveBeenCalled();
    });

    it('a check that is not wired lists nothing', async () => {
        const { p, check } = probe();
        check.mockResolvedValue(undefined);

        const found = await findIntegrationPairUpdates([pairProject('Justrite', { updateAvailable: NEWER })], p);

        expect(found).toStrictEqual([]);
    });
});

describe('describeIntegrationUpdate', () => {
    it('is the pair, with the other-org note when the project must be opened', () => {
        expect(describeIntegrationUpdate(pair())).toBe('ERP Integration and Justrite ERP');
        expect(describeIntegrationUpdate(pair({ otherOrg: true }))).toBe(
            `ERP Integration and Justrite ERP (${OTHER_ORG_NOTE})`,
        );
    });
});

describe('applyIntegrationUpdates', () => {
    it('runs the pair update the card runs, for the project and member asked, reporting each step', async () => {
        const ctx = makeCtx();
        const item = pair();
        const onProgress = jest.fn();
        ctx.updateIntegrationPair.mockImplementation(async (_project, _id, report) => {
            report('Fetching the update');
            report('Deploying', 'Running aio app deploy');
            return { success: true, detail: 'Updated from a to b.' };
        });

        const result = await applyIntegrationUpdates([item], ctx, onProgress);

        expect(ctx.updateIntegrationPair).toHaveBeenCalledWith(item.project, 'demo-erp', expect.any(Function));
        expect(onProgress.mock.calls.map(([m]) => m)).toEqual([
            'Updating ERP Integration and Justrite ERP in Justrite',
            'ERP Integration and Justrite ERP in Justrite: Fetching the update',
            'ERP Integration and Justrite ERP in Justrite: Running aio app deploy',
        ]);
        expect(result).toEqual({ successCount: 1, failCount: 0, errors: [], applied: ['Updated from a to b.'] });
    });

    it('a failed update is a failure in plain words, and the next pair still runs', async () => {
        const ctx = makeCtx();
        ctx.updateIntegrationPair
            .mockResolvedValueOnce({ success: false, error: 'The integration folder has changes of its own (a.js).' })
            .mockResolvedValueOnce({ success: true });

        const result = await applyIntegrationUpdates(
            [pair(), pair({ project: pairProject('Bodea', { updateAvailable: NEWER }), label: 'ERP Integration and Bodea ERP' })],
            ctx,
        );

        expect(result).toEqual({
            successCount: 1,
            failCount: 1,
            errors: ['ERP Integration and Justrite ERP in Justrite did not update: The integration folder has changes of its own (a.js).'],
        });
        expect(ctx.updateIntegrationPair).toHaveBeenCalledTimes(2);
    });

    it("a pair in another Adobe org is not deployed from this one: it is deferred, saying to open the project", async () => {
        const ctx = makeCtx();

        const result = await applyIntegrationUpdates([pair({ otherOrg: true })], ctx);

        expect(ctx.updateIntegrationPair).not.toHaveBeenCalled();
        expect(result).toEqual({
            successCount: 0,
            failCount: 0,
            errors: [],
            deferred: [`ERP Integration and Justrite ERP in Justrite ${OTHER_ORG_NOTE}.`],
        });
    });

    it('a context that cannot run deploys says so instead of pretending', async () => {
        const { updateIntegrationPair: _unused, ...ctx } = makeCtx();

        const result = await applyIntegrationUpdates([pair()], ctx);

        expect(result).toEqual({
            successCount: 0,
            failCount: 1,
            errors: ['ERP Integration and Justrite ERP in Justrite did not update: Updating integrations is not available here.'],
        });
    });

    it('nothing selected: nothing reported', async () => {
        expect(await applyIntegrationUpdates([], makeCtx())).toEqual({ successCount: 0, failCount: 0, errors: [] });
    });
});
