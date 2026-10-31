/**
 * Shared preamble for the home AI context suites (`homeAiContextWriter*.test.ts`).
 *
 * Owns the mocks AND the SUT import (webview-test-authoring §3: `jest.mock` hoists only
 * within the module it appears in), so specs import the writer from here. Split out when
 * the home's own tools (PL-60, 2026-10-31) took the suite past 500 lines.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import aiDefaults from '@/features/project-creation/config/ai-defaults.json';
import { SKILL_MCP_TOOL_DEPENDENCIES } from '@/types/ai';

jest.mock('fs/promises', () => ({
    lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    realpath: jest.fn(async (p: string) => p),
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    rm: jest.fn().mockResolvedValue(undefined),
    // The home's own tools dir (homeMcpTools): nothing installed unless a test says so.
    readFile: jest.fn(),
    access: jest.fn(),
}));
// How an ai-defaults tool is launched: no fnm here, so the declared `node` command.
jest.mock('@/core/shell/environmentSetup', () => ({
    EnvironmentSetup: jest.fn().mockImplementation(() => ({ findFnmPath: () => null })),
}));

// Below the mocks on purpose: they hoist above these.
export {
    ensureHomeAiContext,
    ensureHomeMcpTools,
    refreshHomeAgentsMd,
} from '@/features/project-creation/services/aiBundle/homeAiContextWriter';

/** The mocked `fs/promises`: read it from here, since a spec importing it first gets the real one. */
export { fsPromises };

export const PROJECTS_ROOT = '/home/user/.demo-builder/projects';
export const HOME_TOOLS = path.join(PROJECTS_ROOT, '.demo-builder-mcp');
export const EXTENSION_DIST = '/path/to/extension/dist';
export const TEST_NODE_PATH = '/usr/local/bin/node';
export const PLAYWRIGHT_SKILLS = Object.keys(SKILL_MCP_TOOL_DEPENDENCIES);

const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

/** The home's tools dir: empty, or holding @playwright/mcp at the version ai-defaults asks for. */
export function homeTools(playwright: boolean): void {
    const version = aiDefaults.mcpServers.find((e) => e.id === 'playwright')?.version;
    (fsPromises.readFile as jest.Mock).mockImplementation(async (file: string) => {
        if (playwright && file === path.join(HOME_TOOLS, 'package.json'))
            return JSON.stringify({ dependencies: { '@playwright/mcp': version } });
        throw enoent();
    });
    (fsPromises.access as jest.Mock).mockImplementation(async (file: string) => {
        if (playwright && file === path.join(HOME_TOOLS, 'node_modules', '@playwright/mcp', 'package.json')) return;
        throw enoent();
    });
}

/**
 * Find the first writeFile call whose path ends with `suffix` and return its
 * raw string content. Throws if no matching write happened.
 */
export function captureWrite(suffix: string): string {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    const call = writeFileMock.mock.calls.find(([p]: [string]) => p.endsWith(suffix));
    if (!call) {
        throw new Error(`No writeFile call found for path ending with: ${suffix}`);
    }
    return call[1] as string;
}

export function wasWritten(suffix: string): boolean {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    return writeFileMock.mock.calls.some(([p]: [string]) => p.endsWith(suffix));
}
