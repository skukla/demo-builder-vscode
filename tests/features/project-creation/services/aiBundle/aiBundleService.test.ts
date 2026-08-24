/**
 * AI Bundle Service — tiered refresh orchestration (ADR-013).
 *
 * Pins the tier API against the REAL writers (aiContextWriter, skillsWriter,
 * mcpConfigWriter) over a mocked fs, with a real GeneratedFileWriter — the
 * seam matrices themselves are pinned in generatedFileWriter.test.ts; this
 * suite asserts ROUTING through the seam and tier isolation:
 *
 * - `refreshMcpConfigs` (tier 1): both mcp.json files via `writer.write`,
 *   settings.json via merge + `writer.writeMerged` (never skipped),
 *   `.gitignore` stays OUTSIDE the seam. An edited `.mcp.json` is skipped
 *   and reported.
 * - `refreshContextAndSkills` (tier 2): AGENTS.md + CLAUDE.md pointers +
 *   skills through the seam.
 * - A tier-only run leaves the OTHER tier's recorded hashes intact — the
 *   activation sweep depends on this.
 * - `generateAIContextFiles` (tier 1+2): returns `{ skills, report }`,
 *   assigns `project.aiFileHashes = writer.hashes()` BEFORE the
 *   collected-errors throw. (Progress/serialization pins live in
 *   aiBundleService-aiContextProgress.test.ts; delegation-arg pins in
 *   generateAIContextFiles.test.ts.)
 */

import { createHash } from 'crypto';
import * as fsPromises from 'fs/promises';
import * as childProcess from 'child_process';
import { enoentError, makeTestWriter } from './generatedFileWriter.testUtils';
import {
    generateAIContextFiles,
    refreshContextAndSkills,
    refreshMcpConfigs,
} from '@/features/project-creation/services/aiBundle/aiBundleService';
import type { Project } from '@/types/base';

jest.mock('fs/promises', () => {
    const writeFile = jest.fn().mockResolvedValue(undefined);
    return {
        lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
        realpath: jest.fn(async (p: string) => p),
        mkdir: jest.fn().mockResolvedValue(undefined),
        writeFile,
        readFile: jest.fn(),
        appendFile: jest.fn().mockResolvedValue(undefined),
        unlink: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn(),
        // O_NOFOLLOW writes go through open(); the returned handle delegates to
        // the writeFile mock WITH the path, so path-based assertions keep working.
        open: jest.fn(async (p: unknown) => ({
            writeFile: jest.fn(async (d: unknown, e: unknown) => writeFile(p as string, d, e)),
            close: jest.fn(async () => undefined),
        })),
    };
});

// `resolveNodePath` shells out via promisify(execFile) when no nodePath is
// supplied (the generateAIContextFiles path) — keep it deterministic. `exec`
// must exist too: `browserUtils` (loaded transitively via aiContextWriter)
// promisifies it at module load.
jest.mock('child_process', () => ({
    exec: jest.fn(),
    execFile: jest.fn(
        (
            _cmd: string,
            _args: string[],
            cb: (err: Error | null, out: { stdout: string }) => void
        ) => cb(null, { stdout: '/usr/local/bin/node\n' })
    ),
}));

// The orchestrator builds its writer via getLogger(); jest never calls
// initializeLogger.
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_PATH = '/projects/test';
const EXTENSION_PATH = '/ext/path';
const NODE_PATH = '/usr/local/bin/node';

function sha256(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: PROJECT_PATH,
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: {},
        ...overrides,
    };
}

function makeEdsProject(): Project {
    return makeProject({
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/test/components/eds-storefront',
                metadata: { githubRepo: 'owner/my-repo' },
            },
        },
    });
}

/** All paths absent (ENOENT) unless a suffix matcher supplies content. */
function mockDisk(contentBySuffix: Record<string, string> = {}): void {
    (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
        const hit = Object.entries(contentBySuffix).find(([suffix]) =>
            String(p).endsWith(suffix)
        );
        if (hit) return hit[1];
        throw enoentError();
    });
}

function writtenPaths(): string[] {
    return (fsPromises.writeFile as jest.Mock).mock.calls.map(([p]: [string]) => String(p));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDisk();
});

// ─── refreshMcpConfigs (tier 1) ──────────────────────────────────────────────

describe('refreshMcpConfigs', () => {
    it('routes both mcp.json files through the seam and records their hashes', async () => {
        const writer = makeTestWriter(PROJECT_PATH);

        await refreshMcpConfigs(PROJECT_PATH, makeProject(), EXTENSION_PATH, writer, NODE_PATH);

        const report = writer.report();
        expect(report.written).toEqual(
            expect.arrayContaining(['.mcp.json', '.claude/mcp.json'])
        );
        expect(Object.keys(writer.hashes())).toEqual(
            expect.arrayContaining(['.mcp.json', '.claude/mcp.json'])
        );
    });

    it('writes settings.json via merge + writeMerged — never skipped, user content preserved', async () => {
        // Disk settings.json carries user content AND its recorded hash mismatches
        // (i.e. the user edited it) — writeMerged must still land it, because the
        // merged content already incorporates the user's edits.
        const userSettings = JSON.stringify({ permissions: { allow: ['Bash(ls)'] } });
        mockDisk({ '/.claude/settings.json': userSettings });
        const writer = makeTestWriter(PROJECT_PATH, {
            '.claude/settings.json': 'hash-that-does-not-match-disk',
        });

        await refreshMcpConfigs(PROJECT_PATH, makeEdsProject(), EXTENSION_PATH, writer, NODE_PATH);

        const report = writer.report();
        expect(report.written).toContain('.claude/settings.json');
        expect(report.skipped).not.toContain('.claude/settings.json');

        const settingsCall = (fsPromises.writeFile as jest.Mock).mock.calls.find(([p]) =>
            String(p).endsWith('/.claude/settings.json')
        );
        const written = JSON.parse(settingsCall![1] as string);
        expect(written.permissions).toEqual({ allow: ['Bash(ls)'] });
        expect(JSON.stringify(written)).toContain('AI: sync files');
    });

    it('skips an edited .mcp.json (reported), while .claude/mcp.json still refreshes', async () => {
        const edited = '{"mcpServers":{"user":"edited"}}';
        mockDisk({ '/.mcp.json': edited });
        // Recorded hash differs from the disk content → user-edited → skip.
        const writer = makeTestWriter(PROJECT_PATH, {
            '.mcp.json': sha256('what-we-wrote-last-time'),
        });

        await refreshMcpConfigs(PROJECT_PATH, makeProject(), EXTENSION_PATH, writer, NODE_PATH);

        const report = writer.report();
        expect(report.skipped).toContain('.mcp.json');
        expect(report.written).toContain('.claude/mcp.json');
        expect(report.written).not.toContain('.mcp.json');
        expect(writtenPaths().some((p) => p.endsWith('/.mcp.json'))).toBe(false);
        // The edited file's recorded hash is left as-is (they own it now).
        expect(writer.hashes()['.mcp.json']).toBe(sha256('what-we-wrote-last-time'));
    });

    it('keeps .gitignore maintenance OUTSIDE the seam', async () => {
        const writer = makeTestWriter(PROJECT_PATH);

        await refreshMcpConfigs(PROJECT_PATH, makeProject(), EXTENSION_PATH, writer, NODE_PATH);

        const appended = (fsPromises.appendFile as jest.Mock).mock.calls
            .map(([, content]: [string, string]) => content)
            .join('');
        expect(appended).toContain('.mcp.json');
        expect(appended).toContain('.claude/mcp.json');
        expect(Object.keys(writer.hashes())).not.toContain('.gitignore');
        expect(writer.report().written).not.toContain('.gitignore');
    });

    it('leaves the other tier\'s recorded hashes intact (tier-1-only run)', async () => {
        const writer = makeTestWriter(PROJECT_PATH, {
            'AGENTS.md': 'tier2-hash-a',
            '.claude/skills/add-component.md': 'tier2-hash-b',
        });

        await refreshMcpConfigs(PROJECT_PATH, makeProject(), EXTENSION_PATH, writer, NODE_PATH);

        expect(writer.hashes()['AGENTS.md']).toBe('tier2-hash-a');
        expect(writer.hashes()['.claude/skills/add-component.md']).toBe('tier2-hash-b');
    });

    it('does not shell out for the node binary when nodePath is supplied', async () => {
        const writer = makeTestWriter(PROJECT_PATH);

        await refreshMcpConfigs(PROJECT_PATH, makeProject(), EXTENSION_PATH, writer, NODE_PATH);

        expect(childProcess.execFile as unknown as jest.Mock).not.toHaveBeenCalled();
    });
});

// ─── refreshContextAndSkills (tier 2) ────────────────────────────────────────

describe('refreshContextAndSkills', () => {
    it('writes AGENTS.md, both CLAUDE.md pointers, and skills through the seam', async () => {
        const writer = makeTestWriter(PROJECT_PATH);

        const result = await refreshContextAndSkills(
            PROJECT_PATH,
            makeProject(),
            EXTENSION_PATH,
            writer
        );

        const report = writer.report();
        expect(report.written).toEqual(
            expect.arrayContaining([
                'AGENTS.md',
                'CLAUDE.md',
                '.claude/CLAUDE.md',
                '.claude/skills/add-component.md',
            ])
        );
        // Skills return contract: the attempted Demo-Builder skill filenames.
        expect(result.skills).toContain('add-component.md');
        expect(result.skills.length).toBeGreaterThan(0);
    });

    it('leaves the other tier\'s recorded hashes intact (tier-2-only run)', async () => {
        const writer = makeTestWriter(PROJECT_PATH, { '.mcp.json': 'tier1-hash' });

        await refreshContextAndSkills(PROJECT_PATH, makeProject(), EXTENSION_PATH, writer);

        expect(writer.hashes()['.mcp.json']).toBe('tier1-hash');
    });
});

// ─── generateAIContextFiles (tier 1 + tier 2) ────────────────────────────────

describe('generateAIContextFiles (integration over mocked fs)', () => {
    it('returns { skills, report } and surfaces an edited file in report.skipped', async () => {
        mockDisk({ '/AGENTS.md': 'user edited this file' });
        const project = makeProject({
            aiFileHashes: { 'AGENTS.md': sha256('what-we-generated-before') },
        });

        const result = await generateAIContextFiles(PROJECT_PATH, project, EXTENSION_PATH);

        expect(result.report.skipped).toContain('AGENTS.md');
        expect(result.report.written).toEqual(expect.arrayContaining(['.mcp.json', 'CLAUDE.md']));
        expect(result.skills.length).toBeGreaterThan(0);
        // The edit survives in the hash map too — entry untouched.
        expect(project.aiFileHashes?.['AGENTS.md']).toBe(sha256('what-we-generated-before'));
        // Tier-1 entries were recorded onto the project.
        expect(project.aiFileHashes?.['.mcp.json']).toBeDefined();
    });

    it('assigns project.aiFileHashes = writer.hashes() BEFORE the collected-errors throw', async () => {
        // Skills fail to write; the mcp/agents hashes that DID land must survive
        // on the project, or the next refresh misreads those files as pre-ADR.
        (fsPromises.writeFile as jest.Mock).mockImplementation(async (p: string) => {
            if (String(p).includes('/.claude/skills/')) {
                throw new Error('disk full');
            }
        });
        const project = makeProject();

        await expect(
            generateAIContextFiles(PROJECT_PATH, project, EXTENSION_PATH)
        ).rejects.toThrow('AI context file generation failed');

        expect(project.aiFileHashes?.['.mcp.json']).toBeDefined();
        expect(project.aiFileHashes?.['AGENTS.md']).toBeDefined();
    });
});

// Phase-4 review finding: a failed run must not stamp itself current, and the
// hashes of files that DID land must still be assigned for the caller's
// best-effort persistence.
describe('partial failure', () => {
    it('does NOT stamp aiContextVersion when a step fails, but still assigns hashes', async () => {
        const project = makeProject();
        project.aiContextVersion = 3;
        (fsPromises.readFile as jest.Mock).mockRejectedValue(enoentError());
        (fsPromises.writeFile as jest.Mock).mockImplementation(async (p: string) => {
            if (String(p).endsWith('AGENTS.md')) return undefined;
            throw new Error('disk full');
        });

        await expect(
            generateAIContextFiles(PROJECT_PATH, project, EXTENSION_PATH)
        ).rejects.toThrow(/generation failed/);

        expect(project.aiContextVersion).toBe(3); // untouched — the run did not complete
        expect(Object.keys(project.aiFileHashes ?? {})).toContain('AGENTS.md'); // landed hash survives
    });
});
