/**
 * PrerequisitesManager — decision coverage (PL-22): what the config says is required,
 * what a plugin's install commands are, and the delegations to the extracted modules.
 */

jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/features/prerequisites/services/versioning/MultiVersionDetector', () => ({
    checkMultipleNodeVersions: jest.fn(),
    getInstalledNodeVersions: jest.fn().mockResolvedValue([]),
    getLatestInFamily: jest.fn(),
}));
jest.mock('@/features/prerequisites/services/versioning/VersionSatisfactionChecker', () => ({
    checkVersionSatisfaction: jest.fn(),
}));
jest.mock('@/features/prerequisites/services/installation/InstallStepBuilder', () => ({
    getInstallSteps: jest.fn(),
}));

// The wall FIRST: this module installs jest.mock at its top level, and a mock
// registers only when the file's body runs — after a subject import, too late.
import { setupMocks, setupConfigLoader, type TestMocks } from './PrerequisitesManager.testUtils';

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { getInstallSteps } from '@/features/prerequisites/services/installation/InstallStepBuilder';
import { checkMultipleNodeVersions, getLatestInFamily } from '@/features/prerequisites/services/versioning/MultiVersionDetector';
import { checkVersionSatisfaction } from '@/features/prerequisites/services/versioning/VersionSatisfactionChecker';
import { join } from 'path';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import type { PrerequisitesConfig } from '@/features/prerequisites/services/types';

const CONFIG: PrerequisitesConfig = {
    version: '1.0',
    prerequisites: [
        { id: 'node', name: 'Node.js', description: 'r', check: { command: 'node --version' } },
        { id: 'git', name: 'Git', description: 'v', check: { command: 'git --version' }, optional: true },
        { id: 'fnm', name: 'fnm', description: 'n', check: { command: 'fnm --version' }, optional: true },
        {
            id: 'aio-cli',
            name: 'Adobe I/O CLI',
            description: 'a',
            check: { command: 'aio --version' },
            optional: true,
            plugins: [
                {
                    id: 'api-mesh',
                    name: 'API Mesh',
                    description: 'API Mesh plugin',
                    check: { command: 'aio plugins' },
                    install: { steps: [{ name: 'Install API Mesh', commands: ['aio plugins:install @adobe/aio-cli-plugin-api-mesh'], message: 'Installing API Mesh' }] },
                },
                {
                    id: 'no-commands',
                    name: 'No Commands',
                    description: 'A plugin with no install commands',
                    check: { command: 'aio plugins' },
                    install: { steps: [{ name: 'Nothing', commands: [], message: 'nothing' }] },
                },
            ],
        },
    ],
    componentRequirements: {
        'eds-storefront': { prerequisites: ['git'] },
        'adobe-commerce-accs': { prerequisites: ['aio-cli'] },
        'eds-accs-mesh': { prerequisites: ['fnm'] },
        'app-builder-thing': { prerequisites: ['aio-cli', 'fnm'] },
        'no-prereqs': {},
    },
};

describe('PrerequisitesManager — config-derived decisions', () => {
    let manager: PrerequisitesManager;
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
        setupConfigLoader(CONFIG);
        manager = new PrerequisitesManager('/mock/extension/path', mocks.logger, mocks.executor, new PrerequisitesCacheManager());
    });

    describe('getRequiredPrerequisites', () => {
        const ids = async (sel?: Parameters<PrerequisitesManager['getRequiredPrerequisites']>[0]) =>
            (await manager.getRequiredPrerequisites(sel)).map((p) => p.id);

        it('returns only the non-optional prerequisites when nothing is selected', async () => {
            expect(await ids()).toEqual(['node']);
        });

        it('adds the prerequisites the selected FRONTEND requires', async () => {
            expect(await ids({ frontend: 'eds-storefront' })).toEqual(['node', 'git']);
        });

        it('adds the prerequisites the selected BACKEND requires', async () => {
            expect(await ids({ backend: 'adobe-commerce-accs' })).toEqual(['node', 'aio-cli']);
        });

        it('adds the prerequisites every selected DEPENDENCY requires', async () => {
            expect(await ids({ dependencies: ['eds-accs-mesh'] })).toEqual(['node', 'fnm']);
        });

        it('adds the prerequisites every selected APP BUILDER component requires', async () => {
            expect(await ids({ appBuilder: ['app-builder-thing'] })).toEqual(['node', 'fnm', 'aio-cli']);
        });

        it('unions the requirements of every axis without repeating a prerequisite', async () => {
            expect(
                await ids({
                    frontend: 'eds-storefront',
                    backend: 'adobe-commerce-accs',
                    dependencies: ['eds-accs-mesh'],
                    appBuilder: ['app-builder-thing'],
                }),
            ).toEqual(['node', 'git', 'fnm', 'aio-cli']);
        });

        it('ignores a component the requirements table has never heard of', async () => {
            expect(await ids({ frontend: 'not-a-component' })).toEqual(['node']);
        });

        it('ignores a component whose requirement entry lists no prerequisites', async () => {
            expect(await ids({ frontend: 'no-prereqs' })).toEqual(['node']);
        });

        it('ignores an empty frontend or backend id rather than looking it up', async () => {
            expect(await ids({ frontend: '', backend: '' })).toEqual(['node']);
        });

        it('returns the non-optional set when the config declares no component requirements', async () => {
            setupConfigLoader({ version: '1.0', prerequisites: CONFIG.prerequisites });
            manager = new PrerequisitesManager('/p', mocks.logger, mocks.executor, new PrerequisitesCacheManager());

            expect(await ids({ frontend: 'eds-storefront' })).toEqual(['node']);
        });
    });

    describe('getPluginInstallCommands', () => {
        it('returns the first step’s commands and message for a known plugin', async () => {
            expect(await manager.getPluginInstallCommands('aio-cli', 'api-mesh')).toEqual({
                commands: ['aio plugins:install @adobe/aio-cli-plugin-api-mesh'],
                message: 'Installing API Mesh',
            });
        });

        it('returns nothing when the prerequisite id is unknown', async () => {
            expect(await manager.getPluginInstallCommands('nope', 'api-mesh')).toBeUndefined();
        });

        it('returns nothing when the plugin id is unknown', async () => {
            expect(await manager.getPluginInstallCommands('aio-cli', 'nope')).toBeUndefined();
        });

        it('returns nothing when the prerequisite has no plugins at all', async () => {
            expect(await manager.getPluginInstallCommands('git', 'api-mesh')).toBeUndefined();
        });

        it('returns nothing when the plugin declares an empty command list', async () => {
            expect(await manager.getPluginInstallCommands('aio-cli', 'no-commands')).toBeUndefined();
        });

        it('falls back to the install object’s own commands and message when there are no steps', async () => {
            setupConfigLoader({
                version: '1.0',
                prerequisites: [
                    {
                        id: 'aio-cli', name: 'a', description: 'a', check: { command: 'aio' },
                        plugins: [{
                            id: 'flat', name: 'Flat', description: 'Flat plugin', check: { command: 'x' },
                            install: { commands: ['npm i -g flat'], message: 'Installing Flat' },
                        }],
                    },
                ],
            });
            manager = new PrerequisitesManager('/p', mocks.logger, mocks.executor, new PrerequisitesCacheManager());

            expect(await manager.getPluginInstallCommands('aio-cli', 'flat')).toEqual({
                commands: ['npm i -g flat'],
                message: 'Installing Flat',
            });
        });
    });

    describe('getPrerequisiteById', () => {
        it('finds the prerequisite whose id matches exactly', async () => {
            expect((await manager.getPrerequisiteById('git'))?.name).toBe('Git');
        });

        it('returns nothing for an id the config does not carry', async () => {
            expect(await manager.getPrerequisiteById('Git')).toBeUndefined();
        });
    });

    describe('delegations to the extracted modules', () => {
        it('hands getInstallSteps the prerequisite and options untouched, and returns its answer', () => {
            const steps = { steps: [], manual: true, url: 'https://example.invalid' };
            (getInstallSteps as jest.Mock).mockReturnValue(steps);
            const prereq = { id: 'node', name: 'Node.js', description: 'r', check: { command: 'node' } };

            expect(manager.getInstallSteps(prereq, { nodeVersions: ['20'] })).toBe(steps);
            expect(getInstallSteps).toHaveBeenCalledWith(prereq, { nodeVersions: ['20'] });
        });

        it('hands checkMultipleNodeVersions the mapping, the executor and the logger', async () => {
            (checkMultipleNodeVersions as jest.Mock).mockResolvedValue([]);

            await manager.checkMultipleNodeVersions({ '20': 'backend' });

            expect(checkMultipleNodeVersions).toHaveBeenCalledWith(
                { '20': 'backend' }, mocks.executor, mocks.logger,
            );
        });

        it('hands getLatestInFamily the family, the executor and the logger', async () => {
            (getLatestInFamily as jest.Mock).mockResolvedValue('20.11.0');

            expect(await manager.getLatestInFamily('20')).toBe('20.11.0');
            expect(getLatestInFamily).toHaveBeenCalledWith('20', mocks.executor, mocks.logger);
        });

        it('reduces the satisfaction check to its boolean, discarding the rest of the answer', async () => {
            (checkVersionSatisfaction as jest.Mock).mockResolvedValue({ satisfied: true, version: '20.11.0' });

            expect(await manager.checkVersionSatisfaction('20')).toBe(true);
            expect(checkVersionSatisfaction).toHaveBeenCalledWith('20', mocks.executor, mocks.logger);
        });

        it('reports an unsatisfied family as false', async () => {
            (checkVersionSatisfaction as jest.Mock).mockResolvedValue({ satisfied: false });

            expect(await manager.checkVersionSatisfaction('18')).toBe(false);
        });
    });

    describe('loadConfig', () => {
        it('asks the loader to report a parse failure in the prerequisites’ own words', async () => {
            const load = jest.fn().mockResolvedValue(CONFIG);
            (ConfigurationLoader as unknown as jest.Mock).mockImplementation(() => ({ load }));
            const m = new PrerequisitesManager('/p', mocks.logger, mocks.executor, new PrerequisitesCacheManager());

            await m.loadConfig();

            expect(load).toHaveBeenCalledWith({
                validationErrorMessage: 'Failed to parse prerequisites configuration',
            });
        });

        it('reads the config from the extension’s own prerequisites.json', () => {
            (ConfigurationLoader as unknown as jest.Mock).mockClear();
            new PrerequisitesManager('/ext/root', mocks.logger, mocks.executor, new PrerequisitesCacheManager());

            expect(ConfigurationLoader).toHaveBeenCalledWith(
                join('/ext/root', 'src', 'features', 'prerequisites', 'config', 'prerequisites.json'),
            );
        });
    });

    describe('the cache manager it was handed', () => {
        it('is the very instance it hands back, so the session shares one cache', () => {
            const cache = new PrerequisitesCacheManager();
            const m = new PrerequisitesManager('/p', mocks.logger, mocks.executor, cache);

            expect(m.getCacheManager()).toBe(cache);
        });
    });
});
