/**
 * ProjectFileLoader integration tests (Step 02)
 *
 * Verifies the read-side migration of legacy `meshState`/`appState` into the
 * keyed `deployables` map happens through the REAL loader, and that loading a
 * project does NOT mutate the on-disk manifest (read-only migration in D1).
 */

import * as fs from 'fs/promises';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import { getMeshDeployable } from '@/features/app-builder/services/deployableState';
import type { Logger } from '@/types/logger';

jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;

function makeLogger(): Logger {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    } as unknown as Logger;
}

const PROJECT_PATH = '/tmp/legacy-demo';

function primeFsWithManifest(manifest: Record<string, unknown>): void {
    // access() resolves (path + manifest exist); components dir read fails (none).
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(JSON.stringify(manifest));
    mockedFs.readdir.mockRejectedValue(new Error('no components dir'));
    mockedFs.writeFile.mockResolvedValue(undefined);
}

describe('ProjectFileLoader — legacy deployable migration', () => {
    it('loads a manifest with legacy meshState into a migrated mesh deployable', async () => {
        primeFsWithManifest({
            name: 'legacy-demo',
            meshState: {
                envVars: {},
                sourceHash: 'abc123',
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://mesh/graphql',
            },
        });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project).not.toBeNull();
        const mesh = getMeshDeployable(project!);
        expect(mesh).toBeDefined();
        expect(mesh?.kind).toBe('mesh');
        expect(mesh?.endpoint).toBe('https://mesh/graphql');
        // Came from the keyed deployables map (the migration ran), not just read-through.
        expect(project!.deployables?.mesh?.endpoint).toBe('https://mesh/graphql');
    });

    it('does not write the manifest file during load (read-only migration in D1)', async () => {
        primeFsWithManifest({
            name: 'legacy-demo',
            meshState: {
                envVars: {},
                sourceHash: 'abc123',
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://mesh/graphql',
            },
        });

        const loader = new ProjectFileLoader(makeLogger());
        await loader.loadProject(PROJECT_PATH, () => []);

        expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });
});
