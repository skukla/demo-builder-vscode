/**
 * `getNodeVersionToComponentIdMapping` — the version→ID map the prerequisites
 * step filters plugins with.
 *
 * Its sibling `getNodeVersionToComponentMapping` returns display NAMES for the
 * UI; this one returns IDs so `shared.ts` can match them against a plugin's
 * `requiredFor` array. Nothing exercised it: every decision in it — the
 * infrastructure sweep, the three optional selections, the aggregation of two
 * components onto one version, and the CWE-77 validation — was uncovered.
 *
 * The aggregation separator differs from the name map's on purpose (a comma with
 * no space, because these are matched rather than read), so the two cannot share
 * a test.
 */

import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import type { RawComponentRegistry } from '@/types/components';
import { getMockLoader, mockRawRegistry } from './ComponentRegistryManager.testUtils';

jest.mock('@/core/config/ConfigurationLoader', () => ({
    ConfigurationLoader: jest.fn().mockImplementation(() => ({ load: jest.fn() })),
}));

function managerFor(raw: RawComponentRegistry) {
    const manager = new ComponentRegistryManager('/fake/extension/path');
    getMockLoader().load.mockResolvedValue(raw);
    return manager;
}

/** The stock registry with the Adobe CLI infrastructure entry pinned to a version. */
function withInfrastructureNode(nodeVersion: string): RawComponentRegistry {
    return {
        ...mockRawRegistry,
        infrastructure: {
            'adobe-cli': {
                ...mockRawRegistry.infrastructure!['adobe-cli'],
                configuration: { nodeVersion },
            },
        },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('which components reach the map', () => {
    it('maps an infrastructure component by its ID', async () => {
        const manager = managerFor(withInfrastructureNode('22'));

        await expect(manager.getNodeVersionToComponentIdMapping()).resolves.toEqual({
            '22': 'adobe-cli',
        });
    });

    it('maps the chosen frontend by the ID it was asked about', async () => {
        const manager = managerFor(mockRawRegistry);

        await expect(manager.getNodeVersionToComponentIdMapping('headless')).resolves.toEqual({
            '24': 'headless',
        });
    });

    it('maps the chosen backend', async () => {
        const manager = managerFor({
            ...mockRawRegistry,
            backends: {
                'adobe-commerce-paas': {
                    ...mockRawRegistry.backends!['adobe-commerce-paas'],
                    configuration: { nodeVersion: '20' },
                },
            },
        } as RawComponentRegistry);

        await expect(
            manager.getNodeVersionToComponentIdMapping(undefined, 'adobe-commerce-paas'),
        ).resolves.toEqual({ '20': 'adobe-commerce-paas' });
    });

    it('maps every dependency that pins a version', async () => {
        const manager = managerFor(mockRawRegistry);

        await expect(
            manager.getNodeVersionToComponentIdMapping(undefined, undefined, [
                'commerce-mesh',
                'test-tool',
            ]),
        ).resolves.toEqual({ '20': 'commerce-mesh' });
    });

    it('returns an EMPTY map when nothing was selected and nothing pins a version', async () => {
        const manager = managerFor(mockRawRegistry);

        await expect(manager.getNodeVersionToComponentIdMapping()).resolves.toEqual({});
    });

    it('skips a selection whose component is not in the registry', async () => {
        const manager = managerFor(mockRawRegistry);

        await expect(
            manager.getNodeVersionToComponentIdMapping('gone', 'also-gone', ['missing']),
        ).resolves.toEqual({});
    });

    it('skips a FRONTEND and a BACKEND carrying no configuration block', async () => {
        // A selection group can list an entry that has no `configuration` key —
        // both links of `component?.configuration?.nodeVersion` are reached.
        const manager = managerFor({
            ...mockRawRegistry,
            selectionGroups: {
                ...mockRawRegistry.selectionGroups,
                frontends: ['bare-frontend'],
                backends: ['bare-backend'],
            },
            frontends: {
                'bare-frontend': { name: 'Bare Frontend', description: 'x', type: 'frontend' },
            },
            backends: {
                'bare-backend': { name: 'Bare Backend', description: 'x', type: 'backend' },
            },
        } as RawComponentRegistry);

        await expect(
            manager.getNodeVersionToComponentIdMapping('bare-frontend', 'bare-backend'),
        ).resolves.toEqual({});
    });

    it('skips a component that carries no configuration block at all', async () => {
        // `test-tool` has no `configuration` key. Reading through it unguarded
        // is a TypeError rather than a skip.
        const manager = managerFor(mockRawRegistry);

        await expect(
            manager.getNodeVersionToComponentIdMapping(undefined, undefined, ['test-tool']),
        ).resolves.toEqual({});
    });
});

describe('two components on one Node version', () => {
    it('aggregates their IDs, comma-separated', async () => {
        const manager = managerFor(withInfrastructureNode('24'));

        await expect(manager.getNodeVersionToComponentIdMapping('headless')).resolves.toEqual({
            '24': 'adobe-cli,headless',
        });
    });

    it('does not list the same ID twice when it is selected twice', async () => {
        // A dependency can be reached both as a dependency and as the backend,
        // and a duplicated ID would match a plugin's requiredFor list twice.
        const manager = managerFor(mockRawRegistry);

        await expect(
            manager.getNodeVersionToComponentIdMapping(undefined, undefined, [
                'commerce-mesh',
                'commerce-mesh',
            ]),
        ).resolves.toEqual({ '20': 'commerce-mesh' });
    });

    it('keeps different versions in separate entries', async () => {
        const manager = managerFor(withInfrastructureNode('22'));

        await expect(
            manager.getNodeVersionToComponentIdMapping('headless', undefined, ['commerce-mesh']),
        ).resolves.toEqual({ '22': 'adobe-cli', '24': 'headless', '20': 'commerce-mesh' });
    });
});

describe('a version that could reach a shell', () => {
    it('refuses one carrying shell metacharacters, naming the component', async () => {
        // CWE-77: these versions are interpolated into `fnm exec --using=...`.
        // The registry file is hand-edited, so this is the source-side check.
        const manager = managerFor(withInfrastructureNode('20; rm -rf /'));

        await expect(manager.getNodeVersionToComponentIdMapping()).rejects.toThrow(
            /Invalid Node version in component "adobe-cli"/,
        );
    });

    it('refuses one on a selected frontend too', async () => {
        const manager = managerFor({
            ...mockRawRegistry,
            frontends: {
                ...mockRawRegistry.frontends,
                headless: {
                    ...mockRawRegistry.frontends!.headless,
                    configuration: { nodeVersion: '20 && cat /etc/passwd' },
                },
            },
        } as RawComponentRegistry);

        await expect(manager.getNodeVersionToComponentIdMapping('headless')).rejects.toThrow(
            /Invalid Node version in component "headless"/,
        );
    });
});
