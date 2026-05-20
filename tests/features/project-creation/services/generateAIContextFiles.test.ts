/**
 * generateAIContextFiles Tests
 *
 * Tests the AI context file generation orchestration:
 * - Reads AI settings from VS Code configuration
 * - Delegates to writeAgentsMd, writeMcpConfigs, writeSkillFiles
 * - Passes correct settings derived from VS Code config to each writer
 */

import { generateAIContextFiles } from '@/features/project-creation/services/projectFinalizationService';
import { writeAgentsMd } from '@/features/project-creation/services/aiContextWriter';
import { writeMcpConfigs } from '@/features/project-creation/services/mcpConfigWriter';
import { writeSkillFiles } from '@/features/project-creation/services/skillsWriter';
import type { Project } from '@/types/base';

jest.mock('@/features/project-creation/services/aiContextWriter', () => ({
    writeAgentsMd: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/services/mcpConfigWriter', () => ({
    writeMcpConfigs: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/services/skillsWriter', () => ({
    writeSkillFiles: jest.fn().mockResolvedValue(undefined),
}));

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
        await expect(generateAIContextFiles('/projects/test', project, '/ext/path')).resolves.toBeUndefined();

        // Third argument is stacksConfig.stacks loaded from stacks.json — verify it contains
        // real stack data (not an empty array), and that each element has the expected shape.
        expect(writeAgentsMd).toHaveBeenCalledWith(
            '/projects/test',
            project,
            expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
        );
    });

    it('calls writeMcpConfigs with projectPath, project, and extensionPath joined with dist', async () => {
        const project = makeProject();
        await expect(generateAIContextFiles('/projects/test', project, '/ext/path')).resolves.toBeUndefined();

        // No settings argument — writeMcpConfigs takes only the three positional args
        // after Cycle A. External MCPs come from Claude Code's session-level catalog.
        expect(writeMcpConfigs).toHaveBeenCalledWith('/projects/test', project, '/ext/path/dist');
    });

    it('calls writeSkillFiles with projectPath and project (no settings)', async () => {
        const project = makeProject();
        await expect(generateAIContextFiles('/projects/test', project, '/ext/path')).resolves.toBeUndefined();

        // After Cycle A, writeSkillFiles takes only projectPath and project.
        // SkillsSettings is gone — the writer always emits the same three skills.
        expect(writeSkillFiles).toHaveBeenCalledWith('/projects/test', project);
    });

    it('still calls all three writers when one fails', async () => {
        (writeAgentsMd as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
        // writeMcpConfigs and writeSkillFiles still resolve

        await expect(
            generateAIContextFiles('/projects/test', makeProject(), '/ext'),
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
            generateAIContextFiles('/projects/test', makeProject(), '/ext'),
        ).rejects.toThrow(/error A.*error B|error B.*error A/);
    });
});
