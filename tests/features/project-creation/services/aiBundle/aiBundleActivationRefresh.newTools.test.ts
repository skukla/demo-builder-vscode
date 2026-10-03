/**
 * The v33 → v34 step, split from aiBundleActivationRefresh.test.ts at the
 * max-lines cap. v34 taught two tools the bundle had never named: reset_project
 * (AGENTS.md) and create_project_from_file (the create-eds-project skill).
 *
 * What an EXISTING project gets is the point: a project stamped 33 is refreshed
 * to the new text on the next activation, and a file its owner edited by hand is
 * skipped, not overwritten. The tier functions and the GeneratedFileWriter are
 * real; only the disk is mocked.
 */

import { fsPromises } from './aiBundleFsMock';
import { createHash } from 'crypto';
import * as path from 'path';
import { enoentError, makeMockLogger } from './generatedFileWriter.testUtils';
import { AI_CONTEXT_VERSION } from '@/core/constants';
import { refreshAiBundlesOnActivation } from '@/features/project-creation/services/aiBundle/aiBundleActivationRefresh';
import type { Project } from '@/types/base';

// `browserUtils` and `mcpConfigWriter` promisify these at module load.
jest.mock('child_process', () => ({ exec: jest.fn(), execFile: jest.fn() }));

const PROJECT_PATH = '/projects/demo-a';
const SKILL_REL = '.claude/skills/create-eds-project/SKILL.md';
const HASH_AT_33 = createHash('sha256').update('what we generated at v33', 'utf-8').digest('hex');

function projectAt33(aiFileHashes?: Record<string, string>): Project {
    return {
        name: 'demo-a',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: PROJECT_PATH,
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: {},
        aiContextVersion: 33,
        ...(aiFileHashes ? { aiFileHashes } : {}),
    };
}

/** All listed absolute paths exist with the given content; everything else ENOENTs. */
function mockDisk(contentByPath: Record<string, string>): void {
    (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
        if (String(p) in contentByPath) return contentByPath[String(p)];
        throw enoentError();
    });
}

/** Run the sweep over one project; returns the project as it was saved. */
async function sweep(project: Project): Promise<Project | undefined> {
    let saved: Project | undefined;
    await refreshAiBundlesOnActivation('/ext/path', makeMockLogger(), {
        scanner: {
            getAllProjects: jest
                .fn()
                .mockResolvedValue([
                    { name: 'demo-a', path: PROJECT_PATH, lastModified: new Date('2026-01-01') },
                ]),
        },
        loader: { loadProject: jest.fn().mockResolvedValue(project) },
        configWriter: {
            saveProjectConfig: jest.fn(async (p: Project) => {
                saved = JSON.parse(JSON.stringify(p)) as Project;
            }),
        },
        resolveNode: jest.fn().mockResolvedValue('/usr/local/bin/node'),
    });
    return saved;
}

function writtenContentOf(suffix: string): string | undefined {
    const call = (fsPromises.writeFile as jest.Mock).mock.calls.find(([p]: [string]) =>
        String(p).endsWith(suffix)
    );
    return call ? String(call[1]) : undefined;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDisk({});
    (fsPromises.readdir as jest.Mock).mockRejectedValue(enoentError());
});

describe('a project stamped 33 on its next activation', () => {
    it('gets the new guidance in AGENTS.md and the creation skill, and is stamped current', async () => {
        const saved = await sweep(projectAt33());

        expect(writtenContentOf('/AGENTS.md')).toContain('reset_project');
        expect(writtenContentOf(`/${SKILL_REL}`)).toContain('create_project_from_file');
        expect(saved?.aiContextVersion).toBe(AI_CONTEXT_VERSION);
    });

    it('keeps a hand-edited creation skill while AGENTS.md still refreshes', async () => {
        mockDisk({ [path.join(PROJECT_PATH, SKILL_REL)]: 'my own notes on creating projects' });

        const saved = await sweep(projectAt33({ [SKILL_REL]: HASH_AT_33 }));

        expect(writtenContentOf(`/${SKILL_REL}`)).toBeUndefined();
        expect(saved?.aiFileHashes?.[SKILL_REL]).toBe(HASH_AT_33);
        expect(writtenContentOf('/AGENTS.md')).toContain('reset_project');
    });
});
