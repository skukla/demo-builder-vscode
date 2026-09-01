/**
 * Manifest write-back migration sweep tests.
 *
 * The round-trip cases drive the REAL ProjectFileLoader and ProjectConfigWriter
 * over a temp directory — the point of the sweep is that load-time conversions
 * become durable on disk, and a mocked loader/writer pair would prove nothing
 * about that (a mock answers the same whatever it is handed).
 *
 * Fixture keys copied from a real ~/.demo-builder project manifest (2026-08-24,
 * per the fixtures-from-real-artifacts rule); the legacy fields come from the
 * shapes the migration code itself declares (`appBuilderComponentMigration`
 * reads meshState.{endpoint,sourceHash,lastDeployed,envVars}; `migrateApiPicks`
 * reads additionalConsoleApis: string[]).
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    sweepManifestFormat,
    type ManifestFormatSweepDeps,
} from '@/core/state/manifestFormatSweep';
import { ProjectConfigWriter, MANIFEST_FORMAT_VERSION } from '@/core/state/projectConfigWriter';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../helpers/loggerFake';

const silentLogger = createMockLogger() as unknown as Logger;

/** A pre-stamp manifest carrying every legacy shape the sweep must retire. */
function legacyManifest(name: string): Record<string, unknown> {
    return {
        name,
        version: '1.0.0',
        created: '2026-01-15T00:00:00.000Z',
        lastModified: '2026-01-15T00:00:00.000Z',
        adobe: { organization: 'org-1', projectId: 'p-1', workspace: 'w-1' },
        componentSelections: {
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-accs',
            dependencies: [],
            integrations: [],
            appBuilder: [],
        },
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
            },
        },
        componentConfigs: {},
        components: ['eds-storefront'],
        // Legacy shape 1: singular mesh deploy record (pre ADR-011 keyed map)
        meshState: {
            endpoint: 'https://edge-graph.example/api/abc123/graphql',
            sourceHash: 'deadbeef',
            lastDeployed: '2026-01-10T00:00:00.000Z',
            envVars: { PAAS_URL: 'https://example.test' },
        },
        // Legacy shape 2: flat unattributed console API list
        additionalConsoleApis: ['CommerceCloudManager'],
    };
}

async function writeProject(dir: string, name: string, manifest: Record<string, unknown>) {
    const projectPath = path.join(dir, name);
    await fs.mkdir(projectPath, { recursive: true });
    await fs.writeFile(
        path.join(projectPath, '.demo-builder.json'),
        JSON.stringify(manifest, null, 2)
    );
    return projectPath;
}

async function readManifest(projectPath: string): Promise<Record<string, unknown>> {
    return JSON.parse(
        await fs.readFile(path.join(projectPath, '.demo-builder.json'), 'utf8')
    ) as Record<string, unknown>;
}

/** Deps wired to the REAL loader + writer (no vscode terminal reads). */
function realDeps(projectPaths: string[]): ManifestFormatSweepDeps & { logLines: string[] } {
    const loader = new ProjectFileLoader(silentLogger);
    const writer = new ProjectConfigWriter(silentLogger);
    const logLines: string[] = [];
    return {
        projectPaths,
        loadProject: (p) => loader.loadProject(p, () => []),
        saveProject: (project: Project) => writer.saveProjectConfig(project),
        log: (line) => logLines.push(line),
        logLines,
    };
}

describe('sweepManifestFormat', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-sweep-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('rewrites an unstamped legacy manifest: stamped, keyed, legacy shapes gone', async () => {
        const projectPath = await writeProject(
            tmpDir,
            'legacy-proj',
            legacyManifest('legacy-proj')
        );
        const deps = realDeps([projectPath]);

        // Pin what the loader derives BEFORE the rewrite, to prove no data loss.
        const before = await deps.loadProject(projectPath);
        expect(before).not.toBeNull();

        const result = await sweepManifestFormat(deps);
        expect(result).toEqual({ scanned: 1, migrated: 1, alreadyCurrent: 0, failed: 0 });

        const after = await readManifest(projectPath);
        // Stamped
        expect(after.formatVersion).toBe(MANIFEST_FORMAT_VERSION);
        // Legacy shapes are gone from disk
        expect(after).not.toHaveProperty('meshState');
        expect(after).not.toHaveProperty('additionalConsoleApis');
        // The keyed deploy record carries the legacy mesh data forward
        const keyed = after.appBuilderComponents as Record<
            string,
            { endpoint?: string; envVars?: Record<string, string> }
        >;
        expect(keyed).toBeDefined();
        const meshEntry = Object.values(keyed)[0];
        expect(meshEntry.endpoint).toBe('https://edge-graph.example/api/abc123/graphql');
        expect(meshEntry.envVars).toEqual({ PAAS_URL: 'https://example.test' });
        // The attributed picks carry the flat API list forward
        expect(after.componentApiPicks).toBeDefined();
        expect(JSON.stringify(after.componentApiPicks)).toContain('CommerceCloudManager');
    });

    it('round trip is lossless: the rewritten manifest loads to the same project the legacy one did', async () => {
        const projectPath = await writeProject(tmpDir, 'lossless', legacyManifest('lossless'));
        const deps = realDeps([projectPath]);

        const before = (await deps.loadProject(projectPath)) as Project;
        await sweepManifestFormat(deps);
        const after = (await deps.loadProject(projectPath)) as Project;

        // Compare the fields the migration is responsible for (timestamps and
        // load-derived runtime fields legitimately differ).
        expect(after.appBuilderComponents).toEqual(before.appBuilderComponents);
        expect(after.componentApiPicks).toEqual(before.componentApiPicks);
        expect(after.componentSelections).toEqual(before.componentSelections);
        expect(after.name).toBe(before.name);
    });

    it('is idempotent: a second run reads the stamp and never loads or saves', async () => {
        const projectPath = await writeProject(tmpDir, 'idem', legacyManifest('idem'));
        const deps = realDeps([projectPath]);
        await sweepManifestFormat(deps);

        const loadSpy = jest.fn(deps.loadProject);
        const saveSpy = jest.fn(deps.saveProject);
        const second = await sweepManifestFormat({
            ...deps,
            loadProject: loadSpy,
            saveProject: saveSpy,
        });

        expect(second).toEqual({ scanned: 1, migrated: 0, alreadyCurrent: 1, failed: 0 });
        expect(loadSpy).not.toHaveBeenCalled();
        expect(saveSpy).not.toHaveBeenCalled();
    });

    it('a manifest already at or above the current version is skipped without loading', async () => {
        const stamped = { ...legacyManifest('future'), formatVersion: MANIFEST_FORMAT_VERSION + 1 };
        const projectPath = await writeProject(tmpDir, 'future', stamped);
        const deps = realDeps([projectPath]);
        const loadSpy = jest.fn(deps.loadProject);

        const result = await sweepManifestFormat({ ...deps, loadProject: loadSpy });
        expect(result.alreadyCurrent).toBe(1);
        expect(loadSpy).not.toHaveBeenCalled();
    });

    it('a broken manifest costs only its own migration — the sweep continues', async () => {
        const badPath = await writeProject(tmpDir, 'broken', {});
        await fs.writeFile(path.join(badPath, '.demo-builder.json'), 'not json {');
        const goodPath = await writeProject(tmpDir, 'good', legacyManifest('good'));
        const deps = realDeps([badPath, goodPath]);

        const result = await sweepManifestFormat(deps);
        expect(result).toEqual({ scanned: 2, migrated: 1, alreadyCurrent: 0, failed: 1 });
        expect((await readManifest(goodPath)).formatVersion).toBe(MANIFEST_FORMAT_VERSION);
    });

    it('a project the loader rejects is counted failed, not thrown', async () => {
        // Manifest parses as JSON but the directory disappears before load
        const projectPath = await writeProject(tmpDir, 'vanishing', legacyManifest('vanishing'));
        const deps = realDeps([projectPath]);
        const result = await sweepManifestFormat({
            ...deps,
            loadProject: async () => null,
        });
        expect(result).toEqual({ scanned: 1, migrated: 0, alreadyCurrent: 0, failed: 1 });
    });
});

describe('activation chain sequencing (source pin)', () => {
    it('the sweep runs INSIDE the sequenced upkeep chain, after the other manifest-writers', () => {
        // The chain is sequential because every sweep saves whole manifests; a
        // sweep added beside it (a separate `void` call) would race the others
        // and silently drop their fields. Pin the shape, not line numbers.
        const realFs = jest.requireActual('fs');
        const realPath = jest.requireActual('path');
        const src = realFs.readFileSync(
            realPath.resolve(__dirname, '../../../src/extension.ts'),
            'utf8'
        );
        const chain = src.slice(src.indexOf('void (async () => {'), src.indexOf('})().catch'));
        const order = [
            'refreshAiBundlesOnActivation',
            'sweepPublishKeyRenewals',
            'sweepCommerceSecretStorage',
            'sweepManifestFormats',
        ].map((name) => chain.indexOf(`await ${name}`));
        // All four present, in this order, all awaited inside the one chain.
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
});
