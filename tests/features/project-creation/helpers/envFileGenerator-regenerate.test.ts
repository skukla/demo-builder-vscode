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
import type { Project } from '@/types/base';
import { createMockLogger, sharedEnvVars } from './envFileGenerator.testUtils';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
    },
}));

jest.mock('@/features/project-creation/helpers/formatters', () => ({
    formatGroupName: (group: string) =>
        group
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
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
                },
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
    return createMockProject({
        name: 'Acme Demo',
        path: '/test/acme',
        componentSelections: { backend: 'adobe-commerce-paas' },
        componentInstances: {
            'eds-storefront': { id: 'eds-storefront', name: 'eds-storefront', status: 'ready', path: '/test/acme/eds-storefront' },
        },
        componentConfigs: {
            'eds-storefront': { API_URL: 'https://api.example.com' },
        },
        ...overrides,
    });
}

/**
 * ADR-015 (2026-08-28): the secret store is handed in rather than fetched, so
 * this suite passes a plain fake at each call site.
 */
const secretsFake = createMockSecretStorage().secrets;

describe('regenerateProjectEnvFiles', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes a per-component .env via the canonical generator (resolved values)', async () => {
        await regenerateProjectEnvFiles(
            buildProject(),
            buildRegistry(),
            createMockLogger(),
            secretsFake
        );

        expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
        const [filePath, content] = (fsPromises.writeFile as jest.Mock).mock.calls[0];
        expect(filePath).toBe(path.join('/test/acme/eds-storefront', '.env'));
        expect(content).toContain('API_URL=https://api.example.com');
        // Canonical header proves it went through generateComponentEnvFile (not a flat dump)
        expect(content).toContain('# EDS Storefront - Environment Configuration');
    });

    it('does NOT write a project root .env (root is owned by ProjectConfigWriter)', async () => {
        await regenerateProjectEnvFiles(
            buildProject(),
            buildRegistry(),
            createMockLogger(),
            secretsFake
        );

        const rootPath = path.join('/test/acme', '.env');
        const wroteRoot = (fsPromises.writeFile as jest.Mock).mock.calls.some(
            ([p]) => p === rootPath
        );
        expect(wroteRoot).toBe(false);
    });

    it('skips installed components that have no path', async () => {
        const project = buildProject({
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    status: 'ready',
                    path: '/test/acme/eds-storefront',
                },
                // Installed on record, but no path on disk.
                'ghost-component': { id: 'ghost-component', name: 'Ghost', status: 'ready' },
            },
        });

        await regenerateProjectEnvFiles(project, buildRegistry(), createMockLogger(), secretsFake);

        expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    });

    it('warns and skips an installed component missing a registry definition', async () => {
        const logger = createMockLogger();
        const project = buildProject({
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    status: 'ready',
                    path: '/test/acme/eds-storefront',
                },
                'unknown-comp': {
                    id: 'unknown-comp',
                    name: 'Unknown',
                    status: 'ready',
                    path: '/test/acme/unknown',
                },
            },
        });

        await regenerateProjectEnvFiles(project, buildRegistry(), logger, secretsFake);

        expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown-comp'));
    });

    // ADR-011 D3 Steps 07+09: MESH_ENDPOINT must resolve from the keyed mesh
    // entry — a keyed-only project (post-Step-07, no meshState) regenerates the
    // same .env content.
    it('resolves MESH_ENDPOINT from the keyed mesh entry (keyed-only project)', async () => {
        const registry = buildRegistry();
        (
            registry.components.frontends[0] as unknown as {
                configuration: { requiredEnvVars: string[] };
            }
        ).configuration.requiredEnvVars = ['API_URL', 'MESH_ENDPOINT'];

        const project = buildProject({
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    endpoint: 'https://keyed-mesh.adobe.io/graphql',
                },
            },
        });

        await regenerateProjectEnvFiles(project, registry, createMockLogger(), secretsFake);

        const [, content] = (fsPromises.writeFile as jest.Mock).mock.calls[0];
        expect(content).toContain('MESH_ENDPOINT=https://keyed-mesh.adobe.io/graphql');
    });
});
