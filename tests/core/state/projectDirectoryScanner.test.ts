/**
 * ProjectDirectoryScanner Tests
 *
 * The load-bearing assertion is the env override: the scanner feeds the
 * activation AI-bundle sweep, which WRITES into every project it finds. If the
 * scanner ever goes back to a hand-copied `os.homedir()` expression (as it was
 * until 2026-08-22), jest runs that exercise the real activate() sweep the
 * developer's real ~/.demo-builder/projects — that day it clobbered a real
 * project's .mcp.json with the test's mock extension path.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ProjectDirectoryScanner } from '@/core/state/projectDirectoryScanner';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../helpers/loggerFake';

// Real fs throughout; only `readdir` is a passthrough mock so ONE test can hand the
// scanner a permission failure. A `jest.spyOn` on the namespace import does not reach
// the module under test (see reference_jest_os_mock_factory).
jest.mock('fs/promises', () => {
    const actual = jest.requireActual<typeof import('fs/promises')>('fs/promises');
    return { ...actual, readdir: jest.fn(actual.readdir) };
});

let logger: jest.Mocked<Logger>;

/** A project directory whose manifest carries the given mtime (what the scanner sorts by). */
async function writeProject(root: string, name: string, mtime: Date): Promise<void> {
    await fs.mkdir(path.join(root, name));
    const manifest = path.join(root, name, '.demo-builder.json');
    await fs.writeFile(manifest, '{}');
    await fs.utimes(manifest, mtime, mtime);
}

describe('ProjectDirectoryScanner', () => {
    let prevProjectsDir: string | undefined;
    let tempRoot: string;

    beforeEach(async () => {
        logger = createMockLogger();
        prevProjectsDir = process.env.DEMO_BUILDER_PROJECTS_DIR;
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scanner-test-'));
        process.env.DEMO_BUILDER_PROJECTS_DIR = tempRoot;
    });

    afterEach(async () => {
        if (prevProjectsDir === undefined) {
            delete process.env.DEMO_BUILDER_PROJECTS_DIR;
        } else {
            process.env.DEMO_BUILDER_PROJECTS_DIR = prevProjectsDir;
        }
        await fs.rm(tempRoot, { recursive: true, force: true });
    });

    it('scans the DEMO_BUILDER_PROJECTS_DIR override, not the homedir default', async () => {
        // Positive control: a valid project (dir + manifest) inside the override.
        await fs.mkdir(path.join(tempRoot, 'demo-a'));
        await fs.writeFile(path.join(tempRoot, 'demo-a', '.demo-builder.json'), '{}');

        const projects = await new ProjectDirectoryScanner(logger).getAllProjects();

        expect(projects).toHaveLength(1);
        expect(projects[0].name).toBe('demo-a');
        expect(projects[0].path).toBe(path.join(tempRoot, 'demo-a'));
    });

    it('skips directories without a .demo-builder.json manifest', async () => {
        await fs.mkdir(path.join(tempRoot, 'not-a-project'));

        const projects = await new ProjectDirectoryScanner(logger).getAllProjects();

        expect(projects).toEqual([]);
    });

    it('orders projects newest manifest first, regardless of directory order', async () => {
        await writeProject(tempRoot, 'a-old', new Date('2026-01-01T00:00:00Z'));
        await writeProject(tempRoot, 'b-newest', new Date('2026-03-01T00:00:00Z'));
        await writeProject(tempRoot, 'c-middle', new Date('2026-02-01T00:00:00Z'));

        const projects = await new ProjectDirectoryScanner(logger).getAllProjects();

        expect(projects.map((p) => p.name)).toEqual(['b-newest', 'c-middle', 'a-old']);
        expect(projects[0].lastModified).toEqual(new Date('2026-03-01T00:00:00Z'));
    });

    it('ignores plain files at the root without treating them as project candidates', async () => {
        await fs.writeFile(path.join(tempRoot, 'stray.txt'), 'not a project');

        const projects = await new ProjectDirectoryScanner(logger).getAllProjects();

        expect(projects).toEqual([]);
        // A file is not a candidate, so it is never reported as a skipped DIRECTORY.
        expect(logger.debug).not.toHaveBeenCalledWith(expect.stringContaining('stray.txt'));
    });

    it('reports a manifest-less directory by name at debug level and keeps scanning', async () => {
        await fs.mkdir(path.join(tempRoot, 'not-a-project'));
        await writeProject(tempRoot, 'real', new Date('2026-01-01T00:00:00Z'));

        const projects = await new ProjectDirectoryScanner(logger).getAllProjects();

        expect(projects.map((p) => p.name)).toEqual(['real']);
        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('not-a-project'));
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('returns [] when the projects root does not exist (the test-sandbox default)', async () => {
        process.env.DEMO_BUILDER_PROJECTS_DIR = path.join(tempRoot, 'nonexistent');

        const projects = await new ProjectDirectoryScanner(logger).getAllProjects();

        expect(projects).toEqual([]);
        // A missing root is the normal first-run state, not a failure.
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledTimes(1);
    });

    it('reports any other readdir failure as an error carrying the cause', async () => {
        // Permission denied is the case the ENOENT branch exists to be distinguished
        // from. Thrown from the test realm so `instanceof Error` holds as it does in
        // the extension host (a real fs error crosses jest's vm boundary and does not).
        const denied = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
        jest.mocked(fs.readdir).mockRejectedValueOnce(denied);

        const projects = await new ProjectDirectoryScanner(logger).getAllProjects();

        expect(projects).toEqual([]);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error.mock.calls[0][1]).toBe(denied);
        expect(logger.debug).not.toHaveBeenCalled();
    });
});
