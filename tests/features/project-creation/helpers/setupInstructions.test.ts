/**
 * Unit tests for setupInstructions
 * Tests instruction formatting, component-specific instructions, and dynamic value substitution
 */

import { getSetupInstructions } from '@/features/project-creation/helpers/setupInstructions';
import { ComponentRegistry, TransformedComponentDefinition } from '@/types/components';
import { ApiServicesConfig } from '@/types/handlers';

describe('setupInstructions', () => {
    describe('getSetupInstructions', () => {
        it('should return undefined if no apiServicesConfig', () => {
            const result = getSetupInstructions(undefined, [], undefined);
            expect(result).toBeUndefined();
        });

        it('should return undefined if no mesh config', () => {
            const config: ApiServicesConfig = {
                services: {},
            };
            const result = getSetupInstructions(config, [], undefined);
            expect(result).toBeUndefined();
        });

        it('should return undefined if no setupInstructions in mesh config', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {},
                },
            };
            const result = getSetupInstructions(config, [], undefined);
            expect(result).toBeUndefined();
        });

        it('should return undefined if setupInstructions is not an array', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        setupInstructions: 'not an array' as any,
                    },
                },
            };
            const result = getSetupInstructions(config, [], undefined);
            expect(result).toBeUndefined();
        });

        it('should return basic instructions without dynamic values', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        setupInstructions: [
                            {
                                step: 'Step 1',
                                details: 'Do something',
                                important: true,
                            },
                            {
                                step: 'Step 2',
                                details: 'Do something else',
                            },
                        ],
                    },
                },
            };

            const result = getSetupInstructions(config, [], undefined);

            expect(result).toEqual([
                {
                    step: 'Step 1',
                    details: 'Do something',
                    important: true,
                },
                {
                    step: 'Step 2',
                    details: 'Do something else',
                    important: undefined,
                },
            ]);
        });

        it('should substitute ALLOWED_DOMAINS with frontend ports', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        setupInstructions: [
                            {
                                step: 'Configure CORS',
                                details: 'Add {{ALLOWED_DOMAINS}} to allowed domains',
                                dynamicValues: {
                                    ALLOWED_DOMAINS: true,
                                },
                            },
                        ],
                    },
                },
            };

            const componentsData: ComponentRegistry = {
                version: '1.0.0',
                components: {
                    frontends: [
                        {
                            id: 'nextjs-storefront',
                            name: 'Next.js Storefront',
                            type: 'frontend',
                            configuration: {
                                port: 3000,
                            },
                        } as TransformedComponentDefinition,
                        {
                            id: 'pwa-studio',
                            name: 'PWA Studio',
                            type: 'frontend',
                            configuration: {
                                port: 8080,
                            },
                        } as TransformedComponentDefinition,
                    ],
                    backends: [],
                    dependencies: [],
                },
            };

            const selectedComponents = ['nextjs-storefront', 'pwa-studio'];

            const result = getSetupInstructions(config, selectedComponents, componentsData);

            expect(result).toEqual([
                {
                    step: 'Configure CORS',
                    details: 'Add localhost:3000, localhost:8080 to allowed domains',
                    important: undefined,
                },
            ]);
        });

        it('should use default port 3000 if not specified', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        setupInstructions: [
                            {
                                step: 'Configure CORS',
                                details: 'Add {{ALLOWED_DOMAINS}}',
                                dynamicValues: {
                                    ALLOWED_DOMAINS: true,
                                },
                            },
                        ],
                    },
                },
            };

            const componentsData: ComponentRegistry = {
                version: '1.0.0',
                components: {
                    frontends: [
                        {
                            id: 'custom-frontend',
                            name: 'Custom Frontend',
                            type: 'frontend',
                            configuration: {},
                        } as TransformedComponentDefinition,
                    ],
                    backends: [],
                    dependencies: [],
                },
            };

            const selectedComponents = ['custom-frontend'];

            const result = getSetupInstructions(config, selectedComponents, componentsData);

            expect(result?.[0].details).toContain('localhost:3000');
        });

        it('should use fallback if no frontends selected', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        setupInstructions: [
                            {
                                step: 'Configure CORS',
                                details: 'Add {{ALLOWED_DOMAINS}}',
                                dynamicValues: {
                                    ALLOWED_DOMAINS: true,
                                },
                            },
                        ],
                    },
                },
            };

            const componentsData: ComponentRegistry = {
                version: '1.0.0',
                components: {
                    frontends: [],
                    backends: [],
                    dependencies: [],
                },
            };

            const result = getSetupInstructions(config, [], componentsData);

            expect(result?.[0].details).toBe('Add localhost:3000');
        });

        it('should filter only selected frontends', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        setupInstructions: [
                            {
                                step: 'Configure CORS',
                                details: 'Add {{ALLOWED_DOMAINS}}',
                                dynamicValues: {
                                    ALLOWED_DOMAINS: true,
                                },
                            },
                        ],
                    },
                },
            };

            const componentsData: ComponentRegistry = {
                version: '1.0.0',
                components: {
                    frontends: [
                        {
                            id: 'nextjs-storefront',
                            name: 'Next.js Storefront',
                            type: 'frontend',
                            configuration: {
                                port: 3000,
                            },
                        } as TransformedComponentDefinition,
                        {
                            id: 'pwa-studio',
                            name: 'PWA Studio',
                            type: 'frontend',
                            configuration: {
                                port: 8080,
                            },
                        } as TransformedComponentDefinition,
                    ],
                    backends: [],
                    dependencies: [],
                },
            };

            // Only select one frontend
            const selectedComponents = ['nextjs-storefront'];

            const result = getSetupInstructions(config, selectedComponents, componentsData);

            expect(result?.[0].details).toBe('Add localhost:3000');
            expect(result?.[0].details).not.toContain('8080');
        });

        it('should handle multiple instructions with mixed dynamic values', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        setupInstructions: [
                            {
                                step: 'Step 1',
                                details: 'Static instruction',
                            },
                            {
                                step: 'Step 2',
                                details: 'Configure {{ALLOWED_DOMAINS}}',
                                dynamicValues: {
                                    ALLOWED_DOMAINS: true,
                                },
                            },
                            {
                                step: 'Step 3',
                                details: 'Another static instruction',
                                important: true,
                            },
                        ],
                    },
                },
            };

            const componentsData: ComponentRegistry = {
                version: '1.0.0',
                components: {
                    frontends: [
                        {
                            id: 'nextjs-storefront',
                            name: 'Next.js Storefront',
                            type: 'frontend',
                            configuration: {
                                port: 3000,
                            },
                        } as TransformedComponentDefinition,
                    ],
                    backends: [],
                    dependencies: [],
                },
            };

            const selectedComponents = ['nextjs-storefront'];

            const result = getSetupInstructions(config, selectedComponents, componentsData);

            expect(result).toEqual([
                {
                    step: 'Step 1',
                    details: 'Static instruction',
                    important: undefined,
                },
                {
                    step: 'Step 2',
                    details: 'Configure localhost:3000',
                    important: undefined,
                },
                {
                    step: 'Step 3',
                    details: 'Another static instruction',
                    important: true,
                },
            ]);
        });

        it('should preserve important flag through substitution', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        setupInstructions: [
                            {
                                step: 'Important Step',
                                details: 'Add {{ALLOWED_DOMAINS}}',
                                important: true,
                                dynamicValues: {
                                    ALLOWED_DOMAINS: true,
                                },
                            },
                        ],
                    },
                },
            };

            const componentsData: ComponentRegistry = {
                version: '1.0.0',
                components: {
                    frontends: [],
                    backends: [],
                    dependencies: [],
                },
            };

            const result = getSetupInstructions(config, [], componentsData);

            expect(result?.[0].important).toBe(true);
        });

        it('should handle empty selectedComponents array', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        setupInstructions: [
                            {
                                step: 'Step 1',
                                details: 'Static instruction',
                            },
                        ],
                    },
                },
            };

            const result = getSetupInstructions(config, [], undefined);

            expect(result).toEqual([
                {
                    step: 'Step 1',
                    details: 'Static instruction',
                    important: undefined,
                },
            ]);
        });
    });
});
