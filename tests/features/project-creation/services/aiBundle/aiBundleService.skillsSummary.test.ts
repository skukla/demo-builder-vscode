/**
 * AI Bundle Service — what the orchestrator does with the SKILLS SUMMARY, and
 * which extension sub-path tier 1 hands to `writeMcpConfigs`.
 *
 * Both tiers read `summary?.written ?? []` from `writeSkillFiles`, whose return
 * type allows `undefined` (a run that wrote nothing). The real-writer suite
 * (aiBundleService.test.ts) can never produce that shape, so those two
 * fallbacks are pinned here against mocked writers:
 *
 * - `refreshContextAndSkills` returns `{ skills: [] }` rather than throwing.
 * - `generateAIContextFiles` returns `skills: []` rather than a stale value.
 *
 * The tier-1 pin is an ARGUMENT assertion: the distPath handed to
 * `writeMcpConfigs` is `<extensionPath>/dist`, which is where the bundled MCP
 * server lives — the generated `.mcp.json` points at it, so the wrong sub-path
 * writes a config no agent can launch.
 */

jest.mock('@/features/project-creation/services/aiBundle/aiContextWriter', () => ({
    writeAgentsMd: jest.fn(),
}));
jest.mock('@/features/project-creation/services/aiBundle/mcpConfigWriter', () => ({
    writeMcpConfigs: jest.fn(),
}));
jest.mock('@/features/project-creation/services/aiBundle/skillsWriter', () => ({
    writeSkillFiles: jest.fn(),
}));

import * as path from 'path';
import {
    generateAIContextFiles,
    refreshContextAndSkills,
    refreshMcpConfigs,
} from '@/features/project-creation/services/aiBundle/aiBundleService';
import { writeAgentsMd } from '@/features/project-creation/services/aiBundle/aiContextWriter';
import { writeMcpConfigs } from '@/features/project-creation/services/aiBundle/mcpConfigWriter';
import { writeSkillFiles } from '@/features/project-creation/services/aiBundle/skillsWriter';
import { makeTestWriter } from './generatedFileWriter.testUtils';
import { createMockProject } from '../../../../helpers/projectFake';

const PROJECT_PATH = '/projects/demo';
const EXTENSION_PATH = '/ext';

describe('aiBundleService — skills summary and tier-1 dist path', () => {
    const project = createMockProject({ name: 'demo', path: PROJECT_PATH });

    beforeEach(() => {
        jest.clearAllMocks();
        (writeAgentsMd as jest.Mock).mockResolvedValue(undefined);
        (writeMcpConfigs as jest.Mock).mockResolvedValue(undefined);
        (writeSkillFiles as jest.Mock).mockResolvedValue(undefined);
    });

    it('refreshContextAndSkills reports no skills when writeSkillFiles returns no summary', async () => {
        const writer = makeTestWriter(PROJECT_PATH);

        const result = await refreshContextAndSkills(
            PROJECT_PATH,
            project,
            EXTENSION_PATH,
            writer,
        );

        expect(result).toEqual({ skills: [] });
    });

    it('refreshContextAndSkills reports no skills when the summary carries no written list', async () => {
        (writeSkillFiles as jest.Mock).mockResolvedValue({ written: undefined });
        const writer = makeTestWriter(PROJECT_PATH);

        const result = await refreshContextAndSkills(
            PROJECT_PATH,
            project,
            EXTENSION_PATH,
            writer,
        );

        expect(result).toEqual({ skills: [] });
    });

    it('generateAIContextFiles returns an empty skills list when writeSkillFiles returns no summary', async () => {
        const result = await generateAIContextFiles(PROJECT_PATH, project, EXTENSION_PATH);

        expect(result.skills).toEqual([]);
    });

    it('generateAIContextFiles returns the summary\'s written skills verbatim', async () => {
        (writeSkillFiles as jest.Mock).mockResolvedValue({ written: ['add-component'] });

        const result = await generateAIContextFiles(PROJECT_PATH, project, EXTENSION_PATH);

        expect(result.skills).toEqual(['add-component']);
    });

    it('refreshMcpConfigs hands writeMcpConfigs the extension dist directory', async () => {
        const writer = makeTestWriter(PROJECT_PATH);

        await refreshMcpConfigs(PROJECT_PATH, project, EXTENSION_PATH, writer, '/usr/bin/node');

        expect(writeMcpConfigs).toHaveBeenCalledWith(
            PROJECT_PATH,
            project,
            path.join(EXTENSION_PATH, 'dist'),
            writer,
            '/usr/bin/node',
        );
    });

    it('generateAIContextFiles hands writeMcpConfigs the extension dist directory', async () => {
        await generateAIContextFiles(PROJECT_PATH, project, EXTENSION_PATH);

        expect(writeMcpConfigs).toHaveBeenCalledWith(
            PROJECT_PATH,
            project,
            path.join(EXTENSION_PATH, 'dist'),
            expect.anything(),
            undefined,
        );
    });
});
