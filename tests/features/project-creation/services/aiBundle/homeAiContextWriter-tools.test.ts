/**
 * The home Chat's own Playwright tool (PL-60, 2026-10-31): the home's mcp.json carries it,
 * and the four skills that drive it are written, only once it is installed in the home's
 * isolated tools dir and the third-party opt-out is on; `ensureHomeMcpTools` installs it
 * and writes the two again.
 */

import * as path from 'path';
import {
    captureWrite,
    ensureHomeAiContext,
    fsPromises,
    ensureHomeMcpTools,
    EXTENSION_DIST,
    HOME_TOOLS,
    homeTools,
    PLAYWRIGHT_SKILLS,
    PROJECTS_ROOT,
    TEST_NODE_PATH,
    wasWritten,
} from './homeAiContextWriter.testUtils';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/features/project-creation/services/aiBundle/homeMcpTools', () => ({
    ...jest.requireActual('@/features/project-creation/services/aiBundle/homeMcpTools'),
    installHomeMcpTools: jest.fn(),
}));

import { setThirdPartyToolsResolver } from '@/features/project-creation/services/aiBundle/aiToolingGate';
import { installHomeMcpTools } from '@/features/project-creation/services/aiBundle/homeMcpTools';

const mockedInstall = installHomeMcpTools as jest.MockedFunction<typeof installHomeMcpTools>;

beforeEach(() => {
    jest.clearAllMocks();
    homeTools(false);
});
afterEach(() => setThirdPartyToolsResolver(() => true));

function mcpServers(): Record<string, { command: string; args: string[] }> {
    return (JSON.parse(captureWrite('.claude/mcp.json')) as { mcpServers: Record<string, { command: string; args: string[] }> })
        .mcpServers;
}

describe("ensureHomeAiContext — the home's Playwright tool and the skills that drive it", () => {
    it("adds Playwright to both mcp.json files, anchored to the home's isolated tools dir, once installed", async () => {
        homeTools(true);

        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        expect(Object.keys(mcpServers())).toStrictEqual(['demo-builder', 'playwright']);
        expect(mcpServers().playwright).toStrictEqual({
            command: 'node',
            args: [path.join(HOME_TOOLS, 'node_modules/@playwright/mcp/cli.js')],
        });
        expect(captureWrite(`${path.sep}.mcp.json`)).toBe(captureWrite('.claude/mcp.json'));
        for (const skill of PLAYWRIGHT_SKILLS)
            expect(wasWritten(path.join('.claude', 'skills', skill, 'SKILL.md'))).toBe(true);
    });

    it('leaves Playwright out, and removes the four browser skills, while it is not installed', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        expect(Object.keys(mcpServers())).toStrictEqual(['demo-builder']);
        const skillsDir = path.join(PROJECTS_ROOT, '.claude', 'skills');
        for (const skill of PLAYWRIGHT_SKILLS) {
            expect(wasWritten(path.join('.claude', 'skills', skill, 'SKILL.md'))).toBe(false);
            expect(fsPromises.rm).toHaveBeenCalledWith(path.join(skillsDir, skill), { recursive: true, force: true });
        }
        expect(wasWritten(path.join('.claude', 'skills', 'sync-changes', 'SKILL.md'))).toBe(true);
    });

    it('leaves Playwright and its skills out with the third-party opt-out off, even installed', async () => {
        homeTools(true);
        setThirdPartyToolsResolver(() => false);

        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        expect(Object.keys(mcpServers())).toStrictEqual(['demo-builder']);
        for (const skill of PLAYWRIGHT_SKILLS)
            expect(wasWritten(path.join('.claude', 'skills', skill, 'SKILL.md'))).toBe(false);
    });
});

describe('ensureHomeMcpTools', () => {
    it("installs the home's tools, then writes its mcp.json with the tool", async () => {
        const executor = createMockCommandExecutor();
        mockedInstall.mockImplementation(async () => {
            homeTools(true);
            return { success: true, installed: true };
        });

        await ensureHomeMcpTools(PROJECTS_ROOT, EXTENSION_DIST, executor, createMockLogger());

        expect(mockedInstall).toHaveBeenCalledWith(PROJECTS_ROOT, executor, expect.anything());
        expect(Object.keys(mcpServers())).toStrictEqual(['demo-builder', 'playwright']);
    });

    it('rewrites the home without the tool when the opt-out is off, with nothing to install', async () => {
        homeTools(true);
        setThirdPartyToolsResolver(() => false);
        mockedInstall.mockResolvedValue({ success: true, installed: false });

        await ensureHomeMcpTools(PROJECTS_ROOT, EXTENSION_DIST, createMockCommandExecutor(), createMockLogger());

        expect(Object.keys(mcpServers())).toStrictEqual(['demo-builder']);
    });

    it("warns of npm's failure and leaves the home without the tool, never throwing", async () => {
        const logger = createMockLogger();
        mockedInstall.mockResolvedValue({ success: false, installed: false, error: 'npm install exited with code 1' });

        await expect(
            ensureHomeMcpTools(PROJECTS_ROOT, EXTENSION_DIST, createMockCommandExecutor(), logger),
        ).resolves.toBeUndefined();

        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(Object.keys(mcpServers())).toStrictEqual(['demo-builder']);
    });
});
