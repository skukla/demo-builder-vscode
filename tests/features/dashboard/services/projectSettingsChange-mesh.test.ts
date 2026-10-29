/**
 * stageSettingsChange — the mesh's "redeploy needed" flag (AB-79).
 *
 * The flag only ever went ON: a setting the mesh reads, changed and put back, kept the
 * mesh marked out of date with nothing to redeploy. The storefront's flag had the same
 * shape and was fixed on 2026-10-17. The mesh detector is handed in, so each case says
 * exactly what it found; the settings files are absent, so the settings are the manifest's.
 */

jest.mock('fs/promises', () => ({
    readFile: jest.fn(async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
}));

import { stageSettingsChange } from '@/features/dashboard/services/projectSettingsChange';
import type { MeshChanges } from '@/features/mesh/services/types';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const NO_CHANGE: MeshChanges = { hasChanges: false, envVarsChanged: false, sourceFilesChanged: false, changedEnvVars: [] };
const CHANGED: MeshChanges = { hasChanges: true, envVarsChanged: true, sourceFilesChanged: false, changedEnvVars: ['ACCS_STORE_VIEW_CODE'] };

function project(summary: Project['meshStatusSummary']): Project {
    return createMockProject({
        name: 'demo',
        path: '/p/demo',
        componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_VIEW_CODE: 'old' } },
        meshStatusSummary: summary,
    });
}

async function stage(p: Project, found: MeshChanges): Promise<Project['meshStatusSummary']> {
    await stageSettingsChange(p, { 'adobe-commerce-accs': { ACCS_STORE_VIEW_CODE: 'old' } }, {
        secrets: undefined,
        detectMeshChanges: async () => found,
        log: () => undefined,
        warn: () => undefined,
    });
    return p.meshStatusSummary;
}

describe('stageSettingsChange — the mesh flag', () => {
    it('marks the mesh out of date when a setting it reads changed', async () => {
        expect(await stage(project('deployed'), CHANGED)).toBe('stale');
    });

    it('marks it current again when the settings match what it was deployed with', async () => {
        expect(await stage(project('stale'), NO_CHANGE)).toBe('deployed');
        expect(await stage(project('update-declined'), NO_CHANGE)).toBe('deployed');
    });

    it("keeps it out of date when the deployed mesh could not be read: that is not a match", async () => {
        expect(await stage(project('stale'), { ...NO_CHANGE, unknownDeployedState: true })).toBe('stale');
    });

    it('CONTROL: leaves every other state as it was', async () => {
        for (const summary of ['config-incomplete', 'error', 'not-deployed', 'unknown', undefined] as const) {
            expect(await stage(project(summary), NO_CHANGE)).toBe(summary);
        }
    });
});
