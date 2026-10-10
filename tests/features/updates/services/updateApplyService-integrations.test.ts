/**
 * updateApplyService — integration pairs are one more category the headless
 * path computes, counts and applies (AB-73), through the probe and pair update
 * the calling boundary hands it.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    edsProject,
    emptySelections,
    makeCtx,
    recordsIntegrationProbe,
    resetFakes,
} from './updateApplyService.testUtils';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';
import {
    computeProjectUpdateSelections,
    countSelections,
} from '@/features/updates/services/updateSelections';
import type { IntegrationUpdateProbe } from '@/features/updates/services/integrationUpdates';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const SOURCE = { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' };
const NEWER = { commit: 'abc', checkedAt: '2026-10-09T00:00:00.000Z' };

function deployed(overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind: 'integration', status: 'deployed', name: 'ERP Integration', source: SOURCE, ...overrides };
}

function pairProject(): Project {
    return edsProject({
        name: 'Justrite',
        path: '/p/justrite',
        appBuilderComponents: {
            'erp-integration': deployed({ systems: ['demo-erp'] }),
            'demo-erp': deployed({ kind: 'system', name: 'Justrite ERP', usedBy: 'erp-integration', updateAvailable: NEWER }),
        },
        componentInstances: {
            'erp-integration': { id: 'erp-integration', name: 'ERP Integration', status: 'ready', path: '/p/erp' },
            'demo-erp': { id: 'demo-erp', name: 'Justrite ERP', status: 'ready', path: '/p/erp-system' },
        },
    });
}

beforeEach(() => {
    resetFakes();
});

describe('computeProjectUpdateSelections — integrations', () => {
    it('selects the pair with newer code through the probe it is handed', async () => {
        const probe = recordsIntegrationProbe();
        const project = pairProject();

        const sel = await computeProjectUpdateSelections(project, createMockHandlerContext(), probe);

        expect(probe.check).toHaveBeenCalledWith(project);
        expect(sel.integration).toEqual([
            {
                project,
                componentId: 'demo-erp',
                members: ['demo-erp'],
                label: 'ERP Integration and Justrite ERP',
                otherOrg: false,
            },
        ]);
        expect(countSelections(sel)).toBe(1);
    });

    it('a project with no integrations selects none and asks no probe', async () => {
        const probe = recordsIntegrationProbe();

        const sel = await computeProjectUpdateSelections(edsProject(), createMockHandlerContext(), probe);

        expect(sel.integration).toStrictEqual([]);
        expect(probe.check).not.toHaveBeenCalled();
    });

    it('a check that throws costs only this category', async () => {
        const handlerCtx = createMockHandlerContext();
        const probe: IntegrationUpdateProbe = {
            ...recordsIntegrationProbe(),
            check: async () => { throw new Error('git is not installed'); },
        };

        const sel = await computeProjectUpdateSelections(pairProject(), handlerCtx, probe);

        expect(sel.integration).toStrictEqual([]);
        expect(handlerCtx.logger.warn).toHaveBeenCalledTimes(1);
    });
});

describe('applyUpdatesHeadless — integrations', () => {
    it('applies the pair through the context updater, last, and counts it', async () => {
        const ctx = { ...makeCtx(), updateIntegrationPair: jest.fn(async () => ({ success: true, detail: 'Updated from a to b.' })) };
        const project = pairProject();
        const sel = {
            ...emptySelections(),
            integration: [{ project, componentId: 'demo-erp', members: ['demo-erp'], label: 'ERP Integration and Justrite ERP', otherOrg: false }],
        };
        const onProgress = jest.fn();

        const res = await applyUpdatesHeadless(sel, ctx, onProgress);

        expect(ctx.updateIntegrationPair).toHaveBeenCalledWith(project, 'demo-erp', expect.any(Function));
        expect(res.integration).toEqual({ successCount: 1, failCount: 0, errors: [], applied: ['Updated from a to b.'] });
        expect(res.totalApplied).toBe(1);
        expect(onProgress).toHaveBeenCalledWith('Updating ERP Integration and Justrite ERP in Justrite');
    });

    it('a failed pair counts as failed, in words', async () => {
        const ctx = { ...makeCtx(), updateIntegrationPair: jest.fn(async () => ({ success: false, error: 'npm ERR! ERESOLVE' })) };
        const sel = {
            ...emptySelections(),
            integration: [{ project: pairProject(), componentId: 'demo-erp', members: ['demo-erp'], label: 'ERP Integration and Justrite ERP', otherOrg: false }],
        };

        const res = await applyUpdatesHeadless(sel, ctx);

        expect(res.integration.errors).toEqual(['ERP Integration and Justrite ERP in Justrite did not update: npm ERR! ERESOLVE']);
        expect(res.totalFailed).toBe(1);
    });
});
