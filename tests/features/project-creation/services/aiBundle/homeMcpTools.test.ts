/**
 * The home Chat's own ai-defaults tools (PL-60, 2026-10-31): which entries the home gets
 * (the tools a generated skill drives, after the third-party opt-out), when they count as
 * installed (declared at the ai-defaults version AND on disk), and when npm runs.
 *
 * The install pipeline is the shared `installMcpEntries`, mocked here so its ARGUMENTS can
 * be asserted: the home's isolated dir and exactly the home's entries.
 */

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    access: jest.fn(),
}));
jest.mock('@/features/project-creation/services/aiBundle/aiDefaultsInstaller', () => ({
    ...jest.requireActual('@/features/project-creation/services/aiBundle/aiDefaultsInstaller'),
    installMcpEntries: jest.fn(),
}));

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { installMcpEntries } from '@/features/project-creation/services/aiBundle/aiDefaultsInstaller';
import {
    homeMcpEntryApplies,
    setThirdPartyToolsResolver,
} from '@/features/project-creation/services/aiBundle/aiToolingGate';
import {
    availableHomeMcpEntries,
    buildHomeToolEntries,
    homeMcpEntries,
    installHomeMcpTools,
} from '@/features/project-creation/services/aiBundle/homeMcpTools';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import type { AiDefaults, AiDefaultsMcpServer } from '@/types/aiDefaults';

const ROOT = '/nonexistent/.demo-builder/projects';
const TOOLS = path.join(ROOT, '.demo-builder-mcp');

const PLAYWRIGHT: AiDefaultsMcpServer = {
    id: 'playwright',
    package: '@playwright/mcp',
    version: '~0.0.79',
    command: 'node',
    args: ['node_modules/@playwright/mcp/cli.js'],
    description: 'browser',
    requires: 'eds-storefront',
    thirdParty: true,
};
const EXTENSIBILITY: AiDefaultsMcpServer = {
    id: 'commerce-extensibility',
    package: '@adobe-commerce/commerce-extensibility-tools',
    version: '^1.0.0',
    command: 'node',
    args: ['node_modules/@adobe-commerce/commerce-extensibility-tools/dist/index.js'],
    description: 'adobe',
    requires: 'app-builder-tooling',
};
const DEFAULTS: AiDefaults = { mcpServers: [EXTENSIBILITY, PLAYWRIGHT] };

const mockedReadFile = fsPromises.readFile as jest.Mock;
const mockedAccess = fsPromises.access as jest.Mock;
const mockedInstall = installMcpEntries as jest.MockedFunction<typeof installMcpEntries>;
const EXECUTOR = createMockCommandExecutor();

/** The home manifest declares these, and these are on disk. */
function homeHas(declared: Record<string, string>, onDisk: string[]): void {
    mockedReadFile.mockImplementation(async (file: string) => {
        if (file === path.join(TOOLS, 'package.json')) return JSON.stringify({ dependencies: declared });
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mockedAccess.mockImplementation(async (file: string) => {
        if (onDisk.some((pkg) => file === path.join(TOOLS, 'node_modules', pkg, 'package.json'))) return;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedInstall.mockResolvedValue({ success: true });
    homeHas({}, []);
});
afterEach(() => setThirdPartyToolsResolver(() => true));

describe('which entries the home gets', () => {
    it('gets the tools a generated skill drives, and no other entry', () => {
        expect(homeMcpEntryApplies(PLAYWRIGHT)).toBe(true);
        expect(homeMcpEntryApplies(EXTENSIBILITY)).toBe(false);
        expect(homeMcpEntries(DEFAULTS).map((e) => e.id)).toStrictEqual(['playwright']);
    });

    it('gets Playwright from the shipped ai-defaults too', () => {
        expect(homeMcpEntries().map((e) => e.id)).toStrictEqual(['playwright']);
    });

    it('gets nothing third-party with the opt-out off', () => {
        setThirdPartyToolsResolver(() => false);

        expect(homeMcpEntryApplies(PLAYWRIGHT)).toBe(false);
        expect(homeMcpEntries(DEFAULTS)).toStrictEqual([]);
    });
});

describe('when a home tool counts as installed', () => {
    it('counts one declared at the ai-defaults version and on disk', async () => {
        homeHas({ '@playwright/mcp': '~0.0.79' }, ['@playwright/mcp']);

        expect((await availableHomeMcpEntries(ROOT, DEFAULTS)).map((e) => e.id)).toStrictEqual(['playwright']);
    });

    it.each([
        ['declared at another version', { '@playwright/mcp': '~0.0.75' }, ['@playwright/mcp']],
        ['declared but not on disk', { '@playwright/mcp': '~0.0.79' }, []],
        ['on disk but not declared', {}, ['@playwright/mcp']],
    ])('does not count one %s', async (_label, declared, onDisk) => {
        homeHas(declared, onDisk);

        expect(await availableHomeMcpEntries(ROOT, DEFAULTS)).toStrictEqual([]);
    });

    it("writes its .mcp.json entry anchored to the home's isolated dir", async () => {
        homeHas({ '@playwright/mcp': '~0.0.79' }, ['@playwright/mcp']);

        const entries = await buildHomeToolEntries(ROOT, () => null, DEFAULTS);

        expect(entries).toStrictEqual({
            playwright: { command: 'node', args: [path.join(TOOLS, 'node_modules/@playwright/mcp/cli.js')] },
        });
    });

    it('writes no entry, and never asks how to launch one, when nothing is installed', async () => {
        const launcher = jest.fn(() => null);

        expect(await buildHomeToolEntries(ROOT, launcher, DEFAULTS)).toStrictEqual({});
        expect(launcher).not.toHaveBeenCalled();
    });
});

describe('installHomeMcpTools', () => {
    it("installs the home's entries into the home's isolated dir when one is missing", async () => {
        const result = await installHomeMcpTools(ROOT, EXECUTOR, undefined, DEFAULTS);

        expect(mockedInstall).toHaveBeenCalledWith(TOOLS, [PLAYWRIGHT], EXECUTOR, undefined, undefined);
        expect(result).toStrictEqual({ success: true, installed: true });
    });

    it('runs no npm once the install is in place', async () => {
        homeHas({ '@playwright/mcp': '~0.0.79' }, ['@playwright/mcp']);

        const result = await installHomeMcpTools(ROOT, EXECUTOR, undefined, DEFAULTS);

        expect(mockedInstall).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ success: true, installed: false });
    });

    it('installs again when ai-defaults asks for another version', async () => {
        homeHas({ '@playwright/mcp': '~0.0.75' }, ['@playwright/mcp']);

        await installHomeMcpTools(ROOT, EXECUTOR, undefined, DEFAULTS);

        expect(mockedInstall).toHaveBeenCalledTimes(1);
    });

    it('installs nothing with the opt-out off', async () => {
        setThirdPartyToolsResolver(() => false);

        const result = await installHomeMcpTools(ROOT, EXECUTOR, undefined, DEFAULTS);

        expect(mockedInstall).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ success: true, installed: false });
    });

    it("passes on npm's failure, saying nothing was installed", async () => {
        mockedInstall.mockResolvedValueOnce({ success: false, error: 'npm install exited with code 1' });

        const result = await installHomeMcpTools(ROOT, EXECUTOR, undefined, DEFAULTS);

        expect(result).toStrictEqual({ success: false, error: 'npm install exited with code 1', installed: false });
    });
});
