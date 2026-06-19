/**
 * Unit tests for regenerateProjectEnvFiles - the shared .env regeneration path
 * used by EDS Reset and the Configure screen.
 *
 * These tests pin Configure/Reset .env output to the canonical generateComponentEnvFile
 * path: per-component registry-driven resolution (including derivedFrom), no root .env,
 * and a graceful skip for installed components missing a registry definition.
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { regenerateProjectEnvFiles } from '@/features/project-creation/helpers/envFileGenerator';
import { ComponentRegistry } from '@/types/components';
import type { Project } from '@/types';
import { createMockLogger, sharedEnvVars } from './envFileGenerator.testUtils';

jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
    },
}));

jest.mock('@/features/project-creation/helpers/formatters', () => ({
    formatGroupName: (group: string) =>
        group.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
}));

function buildRegistry(): ComponentRegistry {
    return {
        envVars: sharedEnvVars,
        components: {
            frontends: [
                {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    type: 'frontend',
                    configuration: {
                        requiredEnvVars: ['API_URL'],
                        optionalEnvVars: [],
                    },
                } as never,
            ],
            backends: [],
            dependencies: [],
            mesh: [],
            integrations: [],
        },
        services: {},
    } as unknown as ComponentRegistry;
}

function buildProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'Acme Demo',
        path: '/test/acme',
        componentSelections: { backend: 'adobe-commerce-paas' },
        componentInstances: {
            'eds-storefront': { path: '/test/acme/eds-storefront' },
        },
        componentConfigs: {
            'eds-storefront': { API_URL: 'https://api.example.com' },
        },
        ...overrides,
    } as unknown as Project;
}

describe('regenerateProjectEnvFiles', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes a per-component .env via the canonical generator (resolved values)', async () => {
        await regenerateProjectEnvFiles(buildProject(), buildRegistry(), createMockLogger());

        expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
        const [filePath, content] = (fsPromises.writeFile as jest.Mock).mock.calls[0];
        expect(filePath).toBe(path.join('/test/acme/eds-storefront', '.env'));
        expect(content).toContain('API_URL=https://api.example.com');
        // Canonical header proves it went through generateComponentEnvFile (not a flat dump)
        expect(content).toContain('# EDS Storefront - Environment Configuration');
    });

    it('does NOT write a project root .env (root is owned by ProjectConfigWriter)', async () => {
        await regenerateProjectEnvFiles(buildProject(), buildRegistry(), createMockLogger());

        const rootPath = path.join('/test/acme', '.env');
        const wroteRoot = (fsPromises.writeFile as jest.Mock).mock.calls.some(([p]) => p === rootPath);
        expect(wroteRoot).toBe(false);
    });

    it('skips installed components that have no path', async () => {
        const project = buildProject({
            componentInstances: {
                'eds-storefront': { path: '/test/acme/eds-storefront' },
                'ghost-component': {},
            } as never,
        });

        await regenerateProjectEnvFiles(project, buildRegistry(), createMockLogger());

        expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    });

    it('warns and skips an installed component missing a registry definition', async () => {
        const logger = createMockLogger();
        const project = buildProject({
            componentInstances: {
                'eds-storefront': { path: '/test/acme/eds-storefront' },
                'unknown-comp': { path: '/test/acme/unknown' },
            } as never,
        });

        await regenerateProjectEnvFiles(project, buildRegistry(), logger);

        expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown-comp'));
    });
});
