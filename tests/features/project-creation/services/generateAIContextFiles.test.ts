/**
 * generateAIContextFiles Tests
 *
 * Tests the AI context file generation orchestration:
 * - Reads AI settings from VS Code configuration
 * - Delegates to writeClaudeMd, writeMcpConfigs, writeSkillFiles
 * - Passes correct settings derived from VS Code config to each writer
 */

import * as vscode from 'vscode';
import { generateAIContextFiles } from '@/features/project-creation/services/projectFinalizationService';
import { writeClaudeMd } from '@/features/project-creation/services/aiContextWriter';
import { writeMcpConfigs } from '@/features/project-creation/services/mcpConfigWriter';
import { writeSkillFiles } from '@/features/project-creation/services/skillsWriter';
import type { Project } from '@/types/base';

jest.mock('@/features/project-creation/services/aiContextWriter', () => ({
    writeClaudeMd: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/services/mcpConfigWriter', () => ({
    writeMcpConfigs: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/services/skillsWriter', () => ({
    writeSkillFiles: jest.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupVscodeConfig(overrides: Record<string, unknown> = {}): void {
    const values: Record<string, unknown> = {
        externalMcpServers: ['da-live', 'adobe-commerce-dev'],
        mcpConfigTargets: ['claude', 'cursor', 'codex'],
        includeBoilerplateSkills: true,
        ...overrides,
    };
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: (key: string) => values[key],
    });
}

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
        setupVscodeConfig();
    });

    it('calls writeClaudeMd with projectPath and project', async () => {
        const project = makeProject();
        await expect(generateAIContextFiles('/projects/test', project, '/ext/path')).resolves.toBeUndefined();

        // Third argument is stacksConfig.stacks loaded from stacks.json — verify it contains
        // real stack data (not an empty array), and that each element has the expected shape.
        expect(writeClaudeMd).toHaveBeenCalledWith(
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

    it('calls writeSkillFiles with projectPath and project', async () => {
        const project = makeProject();
        await expect(generateAIContextFiles('/projects/test', project, '/ext/path')).resolves.toBeUndefined();

        expect(writeSkillFiles).toHaveBeenCalledWith(
            '/projects/test',
            project,
            expect.objectContaining({ externalMcpServers: expect.any(Array) }),
        );
    });

    it('passes externalMcpServers from demoBuilder.ai config to writeSkillFiles', async () => {
        setupVscodeConfig({ externalMcpServers: ['aem-content'] });
        await expect(generateAIContextFiles('/projects/test', makeProject(), '/ext')).resolves.toBeUndefined();

        expect(writeSkillFiles).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object),
            expect.objectContaining({ externalMcpServers: ['aem-content'] }),
        );
    });

    it('passes includeBoilerplateSkills from demoBuilder.ai config to writeSkillFiles', async () => {
        setupVscodeConfig({ includeBoilerplateSkills: false });
        await expect(generateAIContextFiles('/projects/test', makeProject(), '/ext')).resolves.toBeUndefined();

        expect(writeSkillFiles).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object),
            expect.objectContaining({ includeBoilerplateSkills: false }),
        );
    });

    it('uses default includeBoilerplateSkills (true) when config returns undefined', async () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: () => undefined,
        });
        await expect(generateAIContextFiles('/projects/test', makeProject(), '/ext')).resolves.toBeUndefined();

        expect(writeSkillFiles).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object),
            expect.objectContaining({ includeBoilerplateSkills: true }),
        );
    });

    it('still calls all three writers when one fails', async () => {
        (writeClaudeMd as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
        // writeMcpConfigs and writeSkillFiles still resolve

        await expect(
            generateAIContextFiles('/projects/test', makeProject(), '/ext'),
        ).rejects.toThrow('AI context file generation failed');

        // All three were still called despite writeClaudeMd failing
        expect(writeClaudeMd).toHaveBeenCalledTimes(1);
        expect(writeMcpConfigs).toHaveBeenCalledTimes(1);
        expect(writeSkillFiles).toHaveBeenCalledTimes(1);
    });

    it('aggregates multiple writer errors into a single thrown error', async () => {
        (writeClaudeMd as jest.Mock).mockRejectedValueOnce(new Error('error A'));
        (writeMcpConfigs as jest.Mock).mockRejectedValueOnce(new Error('error B'));

        await expect(
            generateAIContextFiles('/projects/test', makeProject(), '/ext'),
        ).rejects.toThrow(/error A.*error B|error B.*error A/);
    });
});
