/**
 * The manifest carries the display title, and its absence stays absent.
 *
 * A project has two names. `name` is the SLUG — the folder, the dedupe key, the
 * path `renameProjectCore` moves. `title` is what the user typed, and exists
 * only to be read.
 *
 * `title` is optional forever: every project created before it existed has only
 * a slug and must keep rendering exactly as it does today. Two consequences,
 * both easy to undo with a well-meant tidy-up:
 *
 * 1. The writer must OMIT the key when there is no title. `title: undefined`
 *    serialises a null into every legacy manifest for no gain. (Same contract
 *    as `commerceStoreStructure` — see projectManifest-storeStructure.test.ts.)
 * 2. Nothing may backfill it from the slug. Seeding `title = name` renders
 *    identically today and then persists the slug as a genuine user title; a
 *    later rename would move the folder and leave that stale title on screen.
 */

import * as fs from 'fs/promises';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../helpers/loggerFake';

jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

const mockLogger = createMockLogger();

function createTestProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'bodea-demo',
        path: '/test/path',
        created: new Date('2026-01-01T00:00:00Z'),
        componentSelections: {},
        componentInstances: [],
        componentConfigs: {},
        componentVersions: {},
        ...overrides,
    } as Project;
}

/** The JSON the writer actually handed to disk. */
function writtenManifest(): Record<string, unknown> {
    const call = mockFs.writeFile.mock.calls.at(-1);
    return JSON.parse(String(call?.[1]));
}

async function write(project: Project): Promise<void> {
    const writer = new ProjectConfigWriter(mockLogger as never) as unknown as {
        writeManifest(project: unknown): Promise<void>;
    };
    await writer.writeManifest(project);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFs.access.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
});

describe('a project with a title', () => {
    it('writes the title alongside the slug, not instead of it', async () => {
        await write(createTestProject({ title: 'Bodea B2B Demo' }));

        expect(writtenManifest().title).toBe('Bodea B2B Demo');
        // The slug is what the folder and the dedupe key are built from; a title
        // must never displace it.
        expect(writtenManifest().name).toBe('bodea-demo');
    });

    it('keeps a title that differs from the slug in more than case', async () => {
        await write(createTestProject({ name: 'bodea-demo', title: 'Bodea B2B Demo' }));

        expect(writtenManifest().title).not.toBe(writtenManifest().name);
    });
});

describe('a project with no title — everything that predates this', () => {
    it('omits the key entirely rather than writing a null', async () => {
        await write(createTestProject());

        expect('title' in writtenManifest()).toBe(false);
    });

    it('does not backfill it from the slug', async () => {
        await write(createTestProject());

        expect(writtenManifest().title).toBeUndefined();
    });

    it('still writes the slug, so the project is not orphaned', async () => {
        await write(createTestProject());

        expect(writtenManifest().name).toBe('bodea-demo');
    });
});
