/**
 * The activation sweep's `.node-version` pass, against a real project folder.
 *
 * The AI-bundle tiers are stubbed: this suite is about the one pass that is not the
 * bundle, and the bundle has its own suites. The file rules themselves are pinned in
 * nodeVersionFile.test.ts; here it is the wiring: which components the sweep visits,
 * that it reads the catalog once, and that a failure in this pass never stops the rest.
 */
jest.mock('@/features/project-creation/services/aiBundle/aiBundleService', () => ({
    refreshMcpConfigs: jest.fn(async () => undefined),
    refreshContextAndSkills: jest.fn(async () => undefined),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AI_CONTEXT_VERSION } from '@/core/constants';
import { refreshAiBundlesOnActivation } from '@/features/project-creation/services/aiBundle/aiBundleActivationRefresh';
import type { ComponentInstance, Project } from '@/types/base';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

let root: string;

/** A component folder under the project, with `.node-version` holding `content` (or none). */
function componentWith(id: string, content: string | null): ComponentInstance {
    const dir = path.join(root, 'components', id);
    fs.mkdirSync(dir, { recursive: true });
    if (content !== null) fs.writeFileSync(path.join(dir, '.node-version'), content);
    return { id, name: id, status: 'ready', path: dir };
}

const nodeVersionOf = (id: string) =>
    fs.readFileSync(path.join(root, 'components', id, '.node-version'), 'utf-8');

function sweep(instances: Record<string, ComponentInstance>, overrides: Record<string, unknown> = {}) {
    const project: Project = createMockProject({
        path: root,
        componentInstances: instances,
        aiContextVersion: AI_CONTEXT_VERSION,
    });
    const nodeVersions = jest.fn(async () => ({
        'eds-commerce-mesh': '24',
        'headless-commerce-mesh': '24',
        'commerce-demo-ingestion': '24',
    }));
    const logger = createMockLogger();
    const run = refreshAiBundlesOnActivation('/ext/path', logger, {
        scanner: { getAllProjects: async () => [{ name: 'demo', path: root, lastModified: new Date() }] },
        loader: { loadProject: async () => project },
        configWriter: { saveProjectConfig: jest.fn(async () => undefined) },
        resolveNode: async () => '/usr/local/bin/node',
        nodeVersions,
        isTracked: async () => false,
        ...overrides,
    });
    return { run, logger, nodeVersions };
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-node-version-'));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe('the activation sweep — component .node-version files', () => {
    it('rewrites what an earlier install wrote, and leaves an edited one alone', async () => {
        const { run } = sweep({
            'eds-commerce-mesh': componentWith('eds-commerce-mesh', '20\n'),
            'commerce-demo-ingestion': componentWith('commerce-demo-ingestion', '22\n'),
        });

        await run;

        expect(nodeVersionOf('eds-commerce-mesh')).toBe('24\n');
        expect(nodeVersionOf('commerce-demo-ingestion')).toBe('22\n');
    });

    it('does not create a file for a component that has none', async () => {
        const { run } = sweep({ 'eds-commerce-mesh': componentWith('eds-commerce-mesh', null) });

        await run;

        expect(fs.existsSync(path.join(root, 'components', 'eds-commerce-mesh', '.node-version'))).toBe(false);
    });

    it('reads the catalog once for the whole sweep', async () => {
        const { run, nodeVersions } = sweep({ 'eds-commerce-mesh': componentWith('eds-commerce-mesh', '20\n') });

        await run;

        expect(nodeVersions).toHaveBeenCalledTimes(1);
    });

    it('carries on when the catalog cannot be read, changing nothing', async () => {
        const { run, logger } = sweep(
            { 'eds-commerce-mesh': componentWith('eds-commerce-mesh', '20\n') },
            { nodeVersions: async () => { throw new Error('no catalog'); } },
        );

        await run;

        expect(nodeVersionOf('eds-commerce-mesh')).toBe('20\n');
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
