/**
 * integrationUpdateCheck — which deployed integrations have newer code
 * (AB-13, step 5). The clone check is handed in; its real-git behaviour is
 * pinned in integrationSourceUpdate.test.ts.
 */

import type { UpdateCheckResult } from '@/features/app-builder/services/integrationSourceUpdate';
import {
    checkIntegrationUpdates,
    clearUpdateAvailable,
} from '@/features/app-builder/services/integrationUpdateCheck';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const NOW = '2026-09-17T12:00:00.000Z';
const SOURCE = { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' };

function component(overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind: 'integration', status: 'deployed', source: SOURCE, ...overrides };
}

function project(components: Record<string, AppBuilderComponentState>): Project {
    return createMockProject({
        appBuilderComponents: components,
        componentInstances: Object.fromEntries(
            Object.keys(components).map((id) => [id, { id, name: id, status: 'ready', path: `/p/components/${id}` }]),
        ),
    });
}

function deps(byPath: Record<string, UpdateCheckResult>, version?: string) {
    return {
        checkClone: jest.fn(async (path: string) => byPath[path] ?? { status: 'current' as const }),
        readAppVersion: jest.fn(async () => version),
        now: () => NOW,
    };
}

describe('checkIntegrationUpdates', () => {
    it('records the branch head for a clone that is behind, on the branch the record names', async () => {
        const p = project({ erp: component({ source: { ...SOURCE, branch: 'release' } }) });
        const d = deps({ '/p/components/erp': { status: 'available', to: 'abc123' } });

        const result = await checkIntegrationUpdates(p, d);

        expect(result).toEqual({ reports: [{ id: 'erp', available: true }], changed: true });
        expect(d.checkClone).toHaveBeenCalledWith('/p/components/erp', 'release');
        expect(p.appBuilderComponents?.erp?.updateAvailable).toEqual({ commit: 'abc123', checkedAt: NOW });
    });

    it('records a clone version Commerce does not have installed', async () => {
        const p = project({ erp: component({ installation: { status: 'installed', version: '0.1.0' } }) });

        const result = await checkIntegrationUpdates(p, deps({}, '0.2.0'));

        expect(result.changed).toBe(true);
        expect(p.appBuilderComponents?.erp?.updateAvailable).toEqual({ version: '0.2.0', checkedAt: NOW });
    });

    it('records nothing when the versions match or no version was ever installed', async () => {
        const p = project({
            same: component({ installation: { status: 'installed', version: '0.2.0' } }),
            unrecorded: component({ installation: { status: 'installed' } }),
        });

        const result = await checkIntegrationUpdates(p, deps({}, '0.2.0'));

        expect(result).toEqual({
            reports: [
                { id: 'same', available: false },
                { id: 'unrecorded', available: false },
            ],
            changed: false,
        });
    });

    it('clears an answer that no longer holds', async () => {
        const p = project({ erp: component({ updateAvailable: { commit: 'old', checkedAt: 'earlier' } }) });

        const result = await checkIntegrationUpdates(p, deps({}));

        expect(result.changed).toBe(true);
        expect(p.appBuilderComponents?.erp?.updateAvailable).toBeUndefined();
    });

    it('reports no change when the answer is the same, keeping its first check time', async () => {
        const p = project({ erp: component({ updateAvailable: { commit: 'abc123', checkedAt: 'earlier' } }) });

        const result = await checkIntegrationUpdates(
            p,
            deps({ '/p/components/erp': { status: 'available', to: 'abc123' } }),
        );

        expect(result.changed).toBe(false);
        expect(p.appBuilderComponents?.erp?.updateAvailable?.checkedAt).toBe('earlier');
    });

    it('keeps the previous answer when git cannot tell', async () => {
        const previous = { commit: 'abc123', checkedAt: 'earlier' };
        const p = project({ erp: component({ updateAvailable: previous }) });

        const result = await checkIntegrationUpdates(
            p,
            deps({ '/p/components/erp': { status: 'unknown', detail: 'Could not fetch main from GitHub: offline.' } }),
        );

        expect(result).toEqual({
            reports: [{ id: 'erp', available: true, detail: 'Could not fetch main from GitHub: offline.' }],
            changed: false,
        });
        expect(p.appBuilderComponents?.erp?.updateAvailable).toEqual(previous);
    });

    it('checks systems too, and skips meshes, undeployed components and components without a folder', async () => {
        const p = project({
            erp: component({ kind: 'system' }),
            mesh: component({ kind: 'mesh' }),
            broken: component({ status: 'error' }),
        });
        p.appBuilderComponents!.orphan = component();
        const d = deps({});

        const result = await checkIntegrationUpdates(p, d);

        expect(result.reports.map((r) => r.id)).toEqual(['erp']);
        expect(d.checkClone).toHaveBeenCalledTimes(1);
    });
});

describe('clearUpdateAvailable', () => {
    it('removes the recorded update', () => {
        const state = component({ updateAvailable: { commit: 'abc', checkedAt: NOW } });

        clearUpdateAvailable(state);

        expect(state).not.toHaveProperty('updateAvailable');
    });
});
