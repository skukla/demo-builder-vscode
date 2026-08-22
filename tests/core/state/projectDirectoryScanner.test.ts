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

const logger: Logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
} as unknown as Logger;

describe('ProjectDirectoryScanner', () => {
    let prevProjectsDir: string | undefined;
    let tempRoot: string;

    beforeEach(async () => {
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

    it('returns [] when the projects root does not exist (the test-sandbox default)', async () => {
        process.env.DEMO_BUILDER_PROJECTS_DIR = path.join(tempRoot, 'nonexistent');

        const projects = await new ProjectDirectoryScanner(logger).getAllProjects();

        expect(projects).toEqual([]);
    });
});
