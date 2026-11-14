/**
 * Skills Writer — a renamed skill leaves no stale copy behind (ADR-013).
 *
 * The `import-datapack` guide became `datapacks` (v66, owner answer Q5 of the
 * datapack simplification). An existing project still carries the old guide,
 * which names tools that no longer exist. The writer removes it through the
 * seam: only with proof it is ours (its recorded hash), and an edited copy is
 * the SC's, so it is left and reported.
 */

import { fsPromises } from './aiBundleFsMock';
import { createHash } from 'crypto';
import { makeEdsProject } from './aiBundleFixtures';
import {
    enoentError,
    makeTestWriter as makeWriter,
    mcpToolsManifest,
} from './generatedFileWriter.testUtils';
import { writeSkillFiles } from '@/features/project-creation/services/aiBundle/skillsWriter';

const PROJECT = '/projects/test';
const OLD_KEY = '.claude/skills/import-datapack/SKILL.md';
const OLD_ABS = `${PROJECT}/${OLD_KEY}`;
const NEW_ABS = `${PROJECT}/.claude/skills/datapacks/SKILL.md`;
const OLD_GENERATED = '---\nname: import-datapack\n---\n\nThe old guide, as generated.\n';

function sha256(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function writtenFiles(): string[] {
    return (fsPromises.writeFile as jest.Mock).mock.calls.map(([p]: [string]) => p);
}

function unlinkedFiles(): string[] {
    return (fsPromises.unlink as jest.Mock).mock.calls.map(([p]: [string]) => p);
}

/** Disk holds the old guide with `content` (or not at all); everything else is absent. */
function disk(oldGuide: string | undefined): void {
    (fsPromises.readdir as jest.Mock).mockImplementation(async () => {
        throw enoentError();
    });
    (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
        if (p === OLD_ABS && oldGuide !== undefined) return oldGuide;
        if (p.endsWith('.demo-builder-mcp/package.json')) {
            return mcpToolsManifest(['@playwright/mcp']);
        }
        throw enoentError();
    });
}

describe('skillsWriter — renamed skills (import-datapack to datapacks)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('removes an unedited old guide and writes the new one', async () => {
        disk(OLD_GENERATED);
        const writer = makeWriter(PROJECT, { [OLD_KEY]: sha256(OLD_GENERATED) });

        await writeSkillFiles(PROJECT, makeEdsProject(), writer);

        expect(unlinkedFiles()).toContain(OLD_ABS);
        expect(writer.report().removed).toContain(OLD_KEY);
        expect(writer.hashes()).not.toHaveProperty([OLD_KEY]);
        expect(writtenFiles()).toContain(NEW_ABS);
    });

    it('leaves an edited old guide in place and reports it', async () => {
        disk('# my own notes on installing datapacks');
        const writer = makeWriter(PROJECT, { [OLD_KEY]: sha256(OLD_GENERATED) });

        await writeSkillFiles(PROJECT, makeEdsProject(), writer);

        expect(unlinkedFiles()).not.toContain(OLD_ABS);
        expect(writer.report().skipped).toContain(OLD_KEY);
        expect(writtenFiles()).toContain(NEW_ABS);
    });

    it('reports nothing for a project that never had the old guide', async () => {
        disk(undefined);
        const writer = makeWriter(PROJECT);

        await writeSkillFiles(PROJECT, makeEdsProject(), writer);

        expect(writer.report().skipped).not.toContain(OLD_KEY);
        expect(writer.report().removed).not.toContain(OLD_KEY);
    });
});
