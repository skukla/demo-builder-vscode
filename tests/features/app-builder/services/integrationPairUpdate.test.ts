/**
 * integrationPairUpdate — the pair update the dashboard's Update button and the
 * extension's update check both run (AB-73).
 *
 * The runner's update is mocked; the order and the row telegraphs are the subject.
 * Links are STORED on the records (`systems` / `usedBy`), so the catalog is empty.
 */

import {
    componentNameOf,
    pairUpdateOrder,
    updateIntegrationPair,
    type PairUpdateDeps,
} from '@/features/app-builder/services/integrationPairUpdate';
import type { AppBuilderComponentRunnerDeps } from '@/features/app-builder/services/appBuilderComponentRunner';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { OperationPosition } from '@/types/webviewPayloads';
import { createDeps } from './appBuilderComponentRunner.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

const mockUpdate = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderRedeployRun', () => ({
    updateAppBuilderComponent: (...a: unknown[]) => mockUpdate(...a),
}));

const CATALOG: readonly AppBuilderComponentCatalogEntry[] = [];
const SOURCE = { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' };
const NEWER = { commit: 'abc', checkedAt: '2026-10-09T00:00:00.000Z' };

function deployed(overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind: 'integration', status: 'deployed', name: 'ERP Integration', source: SOURCE, ...overrides };
}

function pairProject(
    integration: Partial<AppBuilderComponentState> = {},
    erp: Partial<AppBuilderComponentState> = {},
): Project {
    return createMockProject({
        name: 'Justrite',
        path: '/p/justrite',
        appBuilderComponents: {
            'erp-integration': deployed({ systems: ['demo-erp'], ...integration }),
            'demo-erp': deployed({ kind: 'system', name: 'Justrite ERP', usedBy: 'erp-integration', ...erp }),
        },
    });
}

/**
 * The runner is mocked, so the deps it is handed are never read: the canonical
 * runner deps builder stands in, one bag per position, and the test asserts
 * the runner got THAT bag.
 */
function fakeDeps() {
    const rows = jest.fn<Promise<void>, Parameters<PairUpdateDeps['postRowStatus']>>(async () => undefined);
    const runnerDepsFor = jest.fn<Promise<AppBuilderComponentRunnerDeps>, [OperationPosition | undefined]>(
        async () => createDeps(),
    );
    const deps: PairUpdateDeps = { runnerDepsFor, postRowStatus: rows };
    return { deps, rows, runnerDepsFor };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ success: true, detail: 'Updated from a to b.' });
});

describe('pairUpdateOrder', () => {
    it('from the integration: its ERP with newer code first, then the integration', () => {
        expect(pairUpdateOrder(pairProject({}, { updateAvailable: NEWER }), 'erp-integration', CATALOG))
            .toEqual(['demo-erp', 'erp-integration']);
    });

    it('from the integration: the integration alone when its ERP is current', () => {
        expect(pairUpdateOrder(pairProject(), 'erp-integration', CATALOG)).toEqual(['erp-integration']);
    });

    it("from the ERP: the ERP alone when the integration has nothing newer", () => {
        expect(pairUpdateOrder(pairProject({}, { updateAvailable: NEWER }), 'demo-erp', CATALOG)).toEqual(['demo-erp']);
    });

    it('from the ERP: both when the integration has newer code too', () => {
        expect(pairUpdateOrder(pairProject({ updateAvailable: NEWER }, { updateAvailable: NEWER }), 'demo-erp', CATALOG))
            .toEqual(['demo-erp', 'erp-integration']);
    });

    it('a member whose last deploy failed is updated even with nothing newer', () => {
        expect(pairUpdateOrder(pairProject({}, { status: 'error' }), 'erp-integration', CATALOG))
            .toEqual(['demo-erp', 'erp-integration']);
    });
});

describe('componentNameOf', () => {
    it('is the recorded name, else the id', () => {
        const project = pairProject();
        expect(componentNameOf(project, 'demo-erp')).toBe('Justrite ERP');
        expect(componentNameOf(project, 'nope')).toBe('nope');
    });
});

describe('updateIntegrationPair', () => {
    it('updates each member in order through the runner, with deps built for its place in the pair', async () => {
        const project = pairProject();
        const { deps, runnerDepsFor } = fakeDeps();

        const result = await updateIntegrationPair(project, ['demo-erp', 'erp-integration'], deps);

        expect(result).toEqual({ success: true, detail: 'Updated from a to b.' });
        expect(mockUpdate.mock.calls.map((call) => call[1])).toEqual(['demo-erp', 'erp-integration']);
        expect(runnerDepsFor.mock.calls.map(([position]) => position)).toEqual([
            { index: 1, total: 2, name: 'Justrite ERP' },
            { index: 2, total: 2, name: 'ERP Integration' },
        ]);
        // The runner gets the deps built for that member, not another's.
        expect(mockUpdate.mock.calls[0][2]).toBe(await runnerDepsFor.mock.results[0].value);
    });

    it('every card the update covers says so at once: the rest wait their turn', async () => {
        const { deps, rows } = fakeDeps();

        await updateIntegrationPair(pairProject(), ['demo-erp', 'erp-integration'], deps);

        const calls = rows.mock.calls;
        const waiting = calls.findIndex((call) => call[0] === 'erp-integration' && call[2] === 'Waiting to update');
        const erpUpdating = calls.findIndex((call) => call[0] === 'demo-erp' && call[2] === 'Updating');
        const integrationUpdating = calls.findIndex((call) => call[0] === 'erp-integration' && call[2] === 'Updating');
        expect(waiting).toBeGreaterThanOrEqual(0);
        expect(waiting).toBeLessThan(erpUpdating);
        expect(erpUpdating).toBeLessThan(integrationUpdating);
        expect(rows).toHaveBeenLastCalledWith('erp-integration', 'deployed');
    });

    it('a lone update carries no position', async () => {
        const { deps, runnerDepsFor } = fakeDeps();

        await updateIntegrationPair(pairProject(), ['erp-integration'], deps);

        expect(runnerDepsFor).toHaveBeenCalledWith(undefined);
    });

    it('a failed ERP stops the pair, says what it left alone, and releases the waiting card', async () => {
        const { deps, rows } = fakeDeps();
        mockUpdate.mockResolvedValueOnce({ success: false, error: 'npm ERR! ERESOLVE' });

        const result = await updateIntegrationPair(pairProject(), ['demo-erp', 'erp-integration'], deps);

        expect(result).toEqual({
            success: false,
            error: 'Justrite ERP did not update, so ERP Integration was left as it is: npm ERR! ERESOLVE',
        });
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        expect(rows).toHaveBeenCalledWith('demo-erp', 'error', 'npm ERR! ERESOLVE');
        expect(rows).toHaveBeenLastCalledWith(
            'erp-integration',
            'deployed',
            'Left as it is: Justrite ERP did not update.',
        );
    });

    it("passes the last member's refusal through, with its row in error", async () => {
        const { deps, rows } = fakeDeps();
        mockUpdate.mockResolvedValue({ success: false, error: 'The integration folder has changes of its own (a.js).' });

        const result = await updateIntegrationPair(pairProject(), ['erp-integration'], deps);

        expect(result).toEqual({ success: false, error: 'The integration folder has changes of its own (a.js).' });
        expect(rows).toHaveBeenLastCalledWith(
            'erp-integration',
            'error',
            'The integration folder has changes of its own (a.js).',
        );
    });
});
