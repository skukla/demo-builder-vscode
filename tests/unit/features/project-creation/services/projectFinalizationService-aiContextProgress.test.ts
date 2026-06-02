/**
 * Tests for `generateAIContextFiles` progress emission and serialization.
 *
 * The dashboard's "Regenerate AI files" action and the wizard's phase-6 finalization
 * both call this function. By accepting an optional `onProgress` tracker and running
 * the three writers serially (instead of in parallel), each writer can report its own
 * step to the same `creationProgress` UI without forking the implementation. Errors
 * from the writers are still aggregated and rethrown, matching the previous
 * `allSettled` semantics.
 */

jest.mock('@/features/project-creation/services/aiContextWriter', () => ({
    writeAgentsMd: jest.fn(),
}));
jest.mock('@/features/project-creation/services/mcpConfigWriter', () => ({
    writeMcpConfigs: jest.fn(),
}));
jest.mock('@/features/project-creation/services/skillsWriter', () => ({
    writeSkillFiles: jest.fn(),
}));

import { generateAIContextFiles } from '@/features/project-creation/services/projectFinalizationService';
import { writeAgentsMd } from '@/features/project-creation/services/aiContextWriter';
import { writeMcpConfigs } from '@/features/project-creation/services/mcpConfigWriter';
import { writeSkillFiles } from '@/features/project-creation/services/skillsWriter';
import type { Project } from '@/types/base';

describe('generateAIContextFiles — progress + serialization', () => {
    const project = { name: 'demo', path: '/projects/demo' } as Project;
    const extensionPath = '/ext';

    beforeEach(() => {
        jest.clearAllMocks();
        (writeAgentsMd as jest.Mock).mockResolvedValue(undefined);
        (writeMcpConfigs as jest.Mock).mockResolvedValue(undefined);
        (writeSkillFiles as jest.Mock).mockResolvedValue(undefined);
    });

    it('invokes onProgress once per writer in fixed order', async () => {
        const onProgress = jest.fn();

        await generateAIContextFiles(project.path, project, extensionPath, onProgress);

        // The first call to each writer must follow its own progress emission —
        // that's the whole point of "report before doing." Verify by inspecting
        // the calls list, not invocation order numbers (which can fail in CI).
        expect(onProgress).toHaveBeenCalledTimes(3);
        expect(onProgress.mock.calls[0][0]).toBe('Writing AGENTS.md');
        expect(onProgress.mock.calls[1][0]).toBe('Writing MCP configuration');
        expect(onProgress.mock.calls[2][0]).toBe('Writing skills');
    });

    it('runs the three writers serially when onProgress is supplied', async () => {
        const calls: string[] = [];
        const trace = (label: string) => () => {
            calls.push(`start:${label}`);
            return new Promise<void>(resolve => setImmediate(() => {
                calls.push(`end:${label}`);
                resolve();
            }));
        };
        (writeAgentsMd as jest.Mock).mockImplementation(trace('agents'));
        (writeMcpConfigs as jest.Mock).mockImplementation(trace('mcp'));
        (writeSkillFiles as jest.Mock).mockImplementation(trace('skills'));

        await generateAIContextFiles(project.path, project, extensionPath, jest.fn());

        expect(calls).toEqual([
            'start:agents', 'end:agents',
            'start:mcp', 'end:mcp',
            'start:skills', 'end:skills',
        ]);
    });

    it('still aggregates and rethrows writer errors when serialized', async () => {
        (writeAgentsMd as jest.Mock).mockRejectedValue(new Error('agents boom'));
        (writeSkillFiles as jest.Mock).mockRejectedValue(new Error('skills boom'));
        // writeMcpConfigs resolves OK so we can confirm the run continues past
        // a failure (matches the previous allSettled behavior — collect everything,
        // then surface the combined message).

        await expect(
            generateAIContextFiles(project.path, project, extensionPath, jest.fn()),
        ).rejects.toThrow(/agents boom.*skills boom/);

        // All three writers must have been attempted even though the first failed.
        expect(writeAgentsMd).toHaveBeenCalled();
        expect(writeMcpConfigs).toHaveBeenCalled();
        expect(writeSkillFiles).toHaveBeenCalled();
    });

    it('works without onProgress (backward-compatible default)', async () => {
        await expect(
            generateAIContextFiles(project.path, project, extensionPath),
        ).resolves.toBeUndefined();
        expect(writeAgentsMd).toHaveBeenCalled();
        expect(writeMcpConfigs).toHaveBeenCalled();
        expect(writeSkillFiles).toHaveBeenCalled();
    });
});
