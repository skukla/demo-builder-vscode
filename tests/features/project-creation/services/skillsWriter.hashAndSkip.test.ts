/**
 * Skills Writer — ADR-013 hash-and-skip routing.
 *
 * Every skill write flows through the GeneratedFileWriter seam: a user-edited
 * skill is skipped (and reported on the writer), not overwritten. No gating
 * yet (that lands with skill gating) — this suite pins ROUTING only. The
 * matrices themselves are pinned in generatedFileWriter.test.ts; here we
 * assert that writeSkillFiles routes through them with correct
 * project-relative keys.
 *
 * Split from skillsWriter.test.ts (that file sits at the max-lines cap).
 */

import { createHash } from 'crypto';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import {
    enoentError,
    makeTestWriter as makeWriter,
    mcpToolsManifest,
} from './generatedFileWriter.testUtils';
import { writeSkillFiles } from '@/features/project-creation/services/skillsWriter';
import type { Project, ComponentInstance } from '@/types/base';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn(),
    readFile: jest.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function makeEdsInstance(): ComponentInstance {
    return {
        id: 'eds-storefront',
        name: 'EDS Storefront',
        status: 'ready',
        path: '/projects/test/components/eds-storefront',
        metadata: { githubRepo: 'owner/my-repo', daLiveOrg: 'my-org', daLiveSite: 'my-site' },
    };
}

function makeEdsProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/test-project',
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: { 'eds-storefront': makeEdsInstance() },
        ...overrides,
    };
}

function writtenFiles(): string[] {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    return writeFileMock.mock.calls.map(([p]: [string]) => p);
}

function writtenContentForPath(filePath: string): string | undefined {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    const call = writeFileMock.mock.calls.find(([p]: [string]) => p === filePath);
    return call?.[1] as string | undefined;
}

const ADOBE_BUNDLE_RELATIVE =
    'node_modules/@adobe-commerce/commerce-extensibility-tools/dist/aem-boilerplate-commerce/skills';
const EDS_STOREFRONT_BUNDLE_PATH = `/projects/test/components/eds-storefront/${ADOBE_BUNDLE_RELATIVE}`;

function makeDirent(
    name: string,
    isDirectory: boolean
): { name: string; isDirectory: () => boolean } {
    return { name, isDirectory: () => isDirectory };
}

/** Same shape as skillsWriter.test.ts: bundle folders under the EDS storefront. */
function mockAdobeSkillBundle(skillFiles: Record<string, string[]>): void {
    (fsPromises.readdir as jest.Mock).mockImplementation(async (dirPath: string) => {
        if (dirPath === EDS_STOREFRONT_BUNDLE_PATH) {
            return Object.keys(skillFiles).map((name) => makeDirent(name, true));
        }
        const skillName = Object.keys(skillFiles).find(
            (name) => dirPath === path.join(EDS_STOREFRONT_BUNDLE_PATH, name)
        );
        if (skillName) {
            return skillFiles[skillName].map((filename) => makeDirent(filename, false));
        }
        throw enoentError();
    });
    (fsPromises.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('.demo-builder-mcp/package.json')) {
            return mcpToolsManifest(['@playwright/mcp']);
        }
        const skillName = path.basename(path.dirname(filePath));
        return `---\nname: ${skillName}\ndescription: Adobe skill ${skillName}\n---\n\n# ${skillName}\n`;
    });
}

function mockMissingAdobeBundle(): void {
    (fsPromises.readdir as jest.Mock).mockImplementation(async () => {
        throw enoentError();
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('skillsWriter — hash-and-skip routing (ADR-013)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockMissingAdobeBundle();
        // Default: nothing on disk — the writer's presence probe ENOENTs, so
        // every skill lands on the absent→write matrix row — EXCEPT the
        // installed-tools manifest, which declares playwright so the gated
        // skills stay deliverable and this suite's count pins hold.
        (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
            if (p.endsWith('.demo-builder-mcp/package.json')) {
                return mcpToolsManifest(['@playwright/mcp']);
            }
            throw enoentError();
        });
    });

    it('skips a user-edited skill while the other thirteen still write', async () => {
        const editedAbs = '/projects/test/.claude/skills/sync-changes.md';
        (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
            if (p === editedAbs) return '# user rewrote this skill';
            if (p.endsWith('.demo-builder-mcp/package.json')) {
                return mcpToolsManifest(['@playwright/mcp']);
            }
            throw enoentError();
        });
        const writer = makeWriter('/projects/test', {
            '.claude/skills/sync-changes.md': sha256('what we generated last time'),
        });

        await writeSkillFiles('/projects/test', makeEdsProject(), writer);

        expect(writtenFiles()).not.toContain(editedAbs);
        expect(writtenFiles()).toHaveLength(13);
        expect(writer.report().skipped).toEqual(['.claude/skills/sync-changes.md']);
    });

    it('keeps the written return contract unchanged when a skill is skipped', async () => {
        const editedAbs = '/projects/test/.claude/skills/sync-changes.md';
        (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
            if (p === editedAbs) return '# user rewrote this skill';
            if (p.endsWith('.demo-builder-mcp/package.json')) {
                return mcpToolsManifest(['@playwright/mcp']);
            }
            throw enoentError();
        });
        const writer = makeWriter('/projects/test', {
            '.claude/skills/sync-changes.md': sha256('what we generated last time'),
        });

        const summary = await writeSkillFiles('/projects/test', makeEdsProject(), writer);

        // The handler-boundary contract stays as-is: the attempted skill list.
        // Skip visibility lives on writer.report(), not on `written`.
        expect(summary.written).toHaveLength(14);
        expect(summary.written).toContain('sync-changes.md');
    });

    it('records project-relative posix hash keys for every skill written', async () => {
        const writer = makeWriter('/projects/test');

        await writeSkillFiles('/projects/test', makeEdsProject(), writer);

        const keys = Object.keys(writer.hashes());
        expect(keys).toHaveLength(14);
        for (const key of keys) {
            expect(key.startsWith('.claude/skills/')).toBe(true);
            expect(key).not.toContain('\\');
        }
    });

    it('routes Adobe bundle copies through the seam with project-relative keys', async () => {
        mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });
        const writer = makeWriter('/projects/test');

        await writeSkillFiles('/projects/test', makeEdsProject(), writer);

        expect(writer.report().written).toContain('.claude/skills/aem-block-developer/SKILL.md');
        expect(writer.hashes()).toHaveProperty(['.claude/skills/aem-block-developer/SKILL.md']);
    });

    it('skips a user-edited Adobe bundle skill copy while still copying nothing over it', async () => {
        mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });
        // Recorded hash differs from whatever is on disk → user-edited → skip.
        const writer = makeWriter('/projects/test', {
            '.claude/skills/aem-block-developer/SKILL.md': sha256('our last generation'),
        });

        await writeSkillFiles('/projects/test', makeEdsProject(), writer);

        expect(
            writtenContentForPath('/projects/test/.claude/skills/aem-block-developer/SKILL.md')
        ).toBeUndefined();
        expect(writer.report().skipped).toEqual(['.claude/skills/aem-block-developer/SKILL.md']);
    });
});
