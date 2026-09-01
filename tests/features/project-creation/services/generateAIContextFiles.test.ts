/**
 * generateAIContextFiles Tests
 *
 * Tests the AI context file generation orchestration:
 * - Delegates to writeAgentsMd, writeMcpConfigs, writeSkillFiles
 * - Passes the right positional arguments to each writer
 * - Aggregates errors when one or more writers fail
 */

import { generateAIContextFiles } from '@/features/project-creation/services/aiBundle/aiBundleService';
import { AI_CONTEXT_VERSION } from '@/core/constants';
import { writeAgentsMd } from '@/features/project-creation/services/aiBundle/aiContextWriter';
import { writeMcpConfigs } from '@/features/project-creation/services/aiBundle/mcpConfigWriter';
import { writeSkillFiles } from '@/features/project-creation/services/aiBundle/skillsWriter';
import type { Project } from '@/types/base';

jest.mock('@/features/project-creation/services/aiBundle/aiContextWriter', () => ({
    writeAgentsMd: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/services/aiBundle/mcpConfigWriter', () => ({
    writeMcpConfigs: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/services/aiBundle/skillsWriter', () => ({
    writeSkillFiles: jest.fn().mockResolvedValue({ written: [] }),
}));

// The real createGeneratedFileWriter is used (it only touches disk when a
// writer method runs, and the three writers above are mocked) — but it needs
// a logger, and jest never calls initializeLogger.

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/test',
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: {},
        ...overrides,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateAIContextFiles', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('calls writeAgentsMd with projectPath and project', async () => {
        const project = makeProject();
        await expect(
            generateAIContextFiles('/projects/test', project, '/ext/path')
        ).resolves.toMatchObject({ skills: expect.any(Array) });

        // Third argument is stacksConfig.stacks loaded from stacks.json — verify it contains
        // real stack data (not an empty array), and that each element has the expected shape.
        // Fourth argument is the ADR-013 GeneratedFileWriter seam.
        expect(writeAgentsMd).toHaveBeenCalledWith(
            '/projects/test',
            project,
            expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
            expect.objectContaining({ write: expect.any(Function), hashes: expect.any(Function) })
        );
    });

    it('calls writeMcpConfigs with projectPath, project, dist path, and the writer seam', async () => {
        const project = makeProject();
        await expect(
            generateAIContextFiles('/projects/test', project, '/ext/path')
        ).resolves.toMatchObject({ skills: expect.any(Array) });

        // Positional: projectPath, project, distPath, ADR-013 writer seam, and
        // nodePath (undefined here — writeMcpConfigs resolves it itself; the
        // activation sweep passes a pre-resolved one).
        expect(writeMcpConfigs).toHaveBeenCalledWith(
            '/projects/test',
            project,
            '/ext/path/dist',
            expect.objectContaining({ write: expect.any(Function), hashes: expect.any(Function) }),
            undefined
        );
    });

    it('returns the writer report alongside skills (additive contract)', async () => {
        // Existing callers destructure `skills` only; the update paths log the
        // report's skipped list. With all three writers mocked, nothing flows
        // through the writer, so the report is present-but-empty.
        const result = await generateAIContextFiles('/projects/test', makeProject(), '/ext/path');

        expect(result.report).toEqual({ written: [], skipped: [], removed: [] });
    });

    it('calls writeSkillFiles with projectPath and project (no settings)', async () => {
        const project = makeProject();
        await expect(
            generateAIContextFiles('/projects/test', project, '/ext/path')
        ).resolves.toMatchObject({ skills: expect.any(Array) });

        // writeSkillFiles takes projectPath, project, and the ADR-013 writer seam —
        // SkillsSettings is gone; external MCPs come from the session catalog.
        expect(writeSkillFiles).toHaveBeenCalledWith(
            '/projects/test',
            project,
            expect.objectContaining({ write: expect.any(Function), hashes: expect.any(Function) })
        );
    });

    // ADR-013: the orchestrator seeds ONE writer from the recorded hashes and
    // persists the writer's full updated map back onto the project. Callers
    // save the manifest afterwards — unchanged contract.
    it('seeds the writer from project.aiFileHashes and assigns writer.hashes() back', async () => {
        const project = makeProject({ aiFileHashes: { 'AGENTS.md': 'recorded-hash' } });

        await generateAIContextFiles('/projects/test', project, '/ext/path');

        // Writers are mocked (no files touched), so the seeded map survives intact —
        // the untouched-entries-survive guarantee at the orchestrator level.
        expect(project.aiFileHashes).toEqual({ 'AGENTS.md': 'recorded-hash' });
    });

    it('initializes project.aiFileHashes to an empty map for a pre-ADR project', async () => {
        const project = makeProject();
        expect(project.aiFileHashes).toBeUndefined();

        await generateAIContextFiles('/projects/test', project, '/ext/path');

        expect(project.aiFileHashes).toEqual({});
    });

    it('stamps AI_CONTEXT_VERSION onto the passed project (single point for all callers)', async () => {
        const project = makeProject();
        expect(project.aiContextVersion).toBeUndefined();

        await generateAIContextFiles('/projects/test', project, '/ext/path');

        expect(project.aiContextVersion).toBe(AI_CONTEXT_VERSION);
    });

    it('still calls all three writers when one fails', async () => {
        (writeAgentsMd as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
        // writeMcpConfigs and writeSkillFiles still resolve

        await expect(
            generateAIContextFiles('/projects/test', makeProject(), '/ext')
        ).rejects.toThrow('AI context file generation failed');

        // All three were still called despite writeAgentsMd failing
        expect(writeAgentsMd).toHaveBeenCalledTimes(1);
        expect(writeMcpConfigs).toHaveBeenCalledTimes(1);
        expect(writeSkillFiles).toHaveBeenCalledTimes(1);
    });

    it('aggregates multiple writer errors into a single thrown error', async () => {
        (writeAgentsMd as jest.Mock).mockRejectedValueOnce(new Error('error A'));
        (writeMcpConfigs as jest.Mock).mockRejectedValueOnce(new Error('error B'));

        await expect(
            generateAIContextFiles('/projects/test', makeProject(), '/ext')
        ).rejects.toThrow(/error A.*error B|error B.*error A/);
    });
});
