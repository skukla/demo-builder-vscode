/**
 * Launching the Chat states the active project in the home AGENTS.md.
 *
 * The point of the behaviour is to delete a round trip: the document used to
 * order every agent to call `get_current_project` before doing anything, and 5
 * of 6 measured runs obeyed. Launch is the only moment the current-project
 * pointer can be read and handed over while it is still true, so the assertion
 * that matters is that the launch WRITES THE NAME — not merely that some
 * function was called.
 *
 * These tests drive the real `refreshHomeAgentsMd` (only `fs/promises` is
 * mocked) and read the document that lands on disk. A mock of the writer would
 * pass just as happily if the command handed it the wrong value.
 */

// Must declare the session-store mock before importing OpenInClaudeCommand or
// the testkit — Jest only hoists `jest.mock` within a single file.
jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
}));

jest.mock('fs/promises', () => ({
    lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    realpath: jest.fn(async (p: string) => p),
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));

import * as fsPromises from 'fs/promises';
import { OpenInClaudeCommand } from '@/commands/openInClaude';
import {
    setupVscodeMocks,
    makeLogger,
    makeStateManager,
    makeGlobalState,
    makeContext,
    makeProject,
} from './openInClaude.testkit';

const PROJECTS_ROOT = '/projects';

/** The AGENTS.md content written during the launch. Throws if none was. */
function captureAgentsMd(): string {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    const call = writeFileMock.mock.calls.find(([p]: [string]) =>
        (p as string).endsWith('AGENTS.md')
    );
    if (!call) {
        throw new Error('Launch did not write AGENTS.md');
    }
    return call[1] as string;
}

function launchWith(project: ReturnType<typeof makeProject> | null): Promise<void> {
    setupVscodeMocks();
    const command = new OpenInClaudeCommand(
        makeContext(makeGlobalState()),
        makeStateManager(project) as never,
        makeLogger() as never
    );
    return command.execute();
}

describe('OpenInClaudeCommand — home AGENTS.md active project', () => {
    let prevProjectsDir: string | undefined;

    beforeAll(() => {
        prevProjectsDir = process.env.DEMO_BUILDER_PROJECTS_DIR;
        process.env.DEMO_BUILDER_PROJECTS_DIR = PROJECTS_ROOT;
    });

    afterAll(() => {
        if (prevProjectsDir === undefined) {
            delete process.env.DEMO_BUILDER_PROJECTS_DIR;
        } else {
            process.env.DEMO_BUILDER_PROJECTS_DIR = prevProjectsDir;
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("writes the pointer's project name into the home AGENTS.md before launching", async () => {
        await launchWith(makeProject({ name: 'citisignal-b2b', path: '/projects/citisignal-b2b' }));

        const agents = captureAgentsMd();
        expect(agents).toContain('The active project is `citisignal-b2b`');
        expect(agents).not.toContain('Before starting any project task');
    });

    it('writes to the projects root, not into the project subdirectory', async () => {
        await launchWith(makeProject({ name: 'citisignal-b2b', path: '/projects/citisignal-b2b' }));

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const target = writeFileMock.mock.calls.find(([p]: [string]) =>
            (p as string).endsWith('AGENTS.md')
        )?.[0] as string;
        expect(target).toBe('/projects/AGENTS.md');
    });

    it('keeps the "resolve it yourself" directive when no project is selected', async () => {
        await launchWith(null);

        const agents = captureAgentsMd();
        expect(agents.toLowerCase()).toContain('before starting any project task');
        expect(agents).not.toContain('The active project is');
    });

    it('still launches when the pointer cannot be read', async () => {
        const mocks = setupVscodeMocks();
        const stateManager = {
            getCurrentProject: jest.fn().mockRejectedValue(new Error('state.json unreadable')),
        };
        const command = new OpenInClaudeCommand(
            makeContext(makeGlobalState()),
            stateManager as never,
            makeLogger() as never
        );

        await command.execute();

        // Failing to name the project must never cost the user their Chat, and
        // the document must fall back to telling the agent to resolve it.
        expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        expect(captureAgentsMd()).toContain('Before starting any project task');
    });
});
