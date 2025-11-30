import { renderHook } from '@testing-library/react';
import { useConfigValidation } from '@/features/components/ui/steps/hooks/useConfigValidation';
import { ServiceGroup, ComponentConfigs } from '@/features/components/ui/steps/ComponentConfigStep';

describe('useConfigValidation', () => {
    const sampleServiceGroups: ServiceGroup[] = [
        {
            id: 'adobe-commerce',
            label: 'Adobe Commerce',
            fields: [
                {
                    key: 'ADOBE_COMMERCE_URL',
                    label: 'Commerce URL',
                    type: 'url',
                    required: true,
                    componentIds: ['frontend'],
                },
                {
                    key: 'ADOBE_COMMERCE_ADMIN_USERNAME',
                    label: 'Admin Username',
                    type: 'text',
                    required: true,
                    componentIds: ['frontend'],
                },
                {
                    key: 'ADOBE_COMMERCE_ADMIN_PASSWORD',
                    label: 'Admin Password',
                    type: 'password',
                    required: false,
                    componentIds: ['frontend'],
                },
            ],
        },
        {
            id: 'mesh',
            label: 'API Mesh',
            fields: [
                {
                    key: 'MESH_ENDPOINT',
                    label: 'Mesh Endpoint',
                    type: 'text',
                    required: false,
                    componentIds: ['frontend'],
                },
            ],
        },
    ];

    describe('Required field validation', () => {
        it('returns valid when all required fields are filled', () => {
            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(sampleServiceGroups, componentConfigs)
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.errors).toEqual({});
        });

        it('returns invalid when required fields are missing', () => {
            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    // Missing ADOBE_COMMERCE_ADMIN_USERNAME
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(sampleServiceGroups, componentConfigs)
            );

            expect(result.current.isValid).toBe(false);
            expect(result.current.errors).toHaveProperty('ADOBE_COMMERCE_ADMIN_USERNAME');
            expect(result.current.errors['ADOBE_COMMERCE_ADMIN_USERNAME']).toBe('Admin Username is required');
        });

        it('skips MESH_ENDPOINT validation (deferred field)', () => {
            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                    // MESH_ENDPOINT not provided (auto-filled later)
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(sampleServiceGroups, componentConfigs)
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.errors).not.toHaveProperty('MESH_ENDPOINT');
        });
    });

    describe('URL validation', () => {
        it('validates URL format for url type fields', () => {
            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ADOBE_COMMERCE_URL: 'not-a-valid-url',
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(sampleServiceGroups, componentConfigs)
            );

            expect(result.current.isValid).toBe(false);
            expect(result.current.errors).toHaveProperty('ADOBE_COMMERCE_URL');
            expect(result.current.errors['ADOBE_COMMERCE_URL']).toBe('Please enter a valid URL');
        });

        it('accepts valid URLs', () => {
            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(sampleServiceGroups, componentConfigs)
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.errors).not.toHaveProperty('ADOBE_COMMERCE_URL');
        });

        it('accepts URLs with paths and query strings', () => {
            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ADOBE_COMMERCE_URL: 'https://example.com/path?query=param',
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(sampleServiceGroups, componentConfigs)
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.errors).not.toHaveProperty('ADOBE_COMMERCE_URL');
        });
    });

    describe('Custom pattern validation', () => {
        it('validates against custom regex patterns', () => {
            const groupsWithPattern: ServiceGroup[] = [
                {
                    id: 'test',
                    label: 'Test',
                    fields: [
                        {
                            key: 'ENVIRONMENT_ID',
                            label: 'Environment ID',
                            type: 'text',
                            required: true,
                            componentIds: ['frontend'],
                            validation: {
                                pattern: '^[0-9]+$',
                                message: 'Must be numeric',
                            },
                        },
                    ],
                },
            ];

            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ENVIRONMENT_ID: 'abc123',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(groupsWithPattern, componentConfigs)
            );

            expect(result.current.isValid).toBe(false);
            expect(result.current.errors).toHaveProperty('ENVIRONMENT_ID');
            expect(result.current.errors['ENVIRONMENT_ID']).toBe('Must be numeric');
        });

        it('accepts values matching custom pattern', () => {
            const groupsWithPattern: ServiceGroup[] = [
                {
                    id: 'test',
                    label: 'Test',
                    fields: [
                        {
                            key: 'ENVIRONMENT_ID',
                            label: 'Environment ID',
                            type: 'text',
                            required: true,
                            componentIds: ['frontend'],
                            validation: {
                                pattern: '^[0-9]+$',
                                message: 'Must be numeric',
                            },
                        },
                    ],
                },
            ];

            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ENVIRONMENT_ID: '12345',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(groupsWithPattern, componentConfigs)
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.errors).not.toHaveProperty('ENVIRONMENT_ID');
        });

        it('uses default error message when custom message not provided', () => {
            const groupsWithPattern: ServiceGroup[] = [
                {
                    id: 'test',
                    label: 'Test',
                    fields: [
                        {
                            key: 'ENVIRONMENT_ID',
                            label: 'Environment ID',
                            type: 'text',
                            required: true,
                            componentIds: ['frontend'],
                            validation: {
                                pattern: '^[0-9]+$',
                            },
                        },
                    ],
                },
            ];

            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ENVIRONMENT_ID: 'invalid',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(groupsWithPattern, componentConfigs)
            );

            expect(result.current.isValid).toBe(false);
            expect(result.current.errors['ENVIRONMENT_ID']).toBe('Invalid format');
        });
    });

    describe('Multi-component field validation', () => {
        it('validates fields shared across multiple components', () => {
            const groupsWithSharedField: ServiceGroup[] = [
                {
                    id: 'shared',
                    label: 'Shared',
                    fields: [
                        {
                            key: 'SHARED_API_KEY',
                            label: 'Shared API Key',
                            type: 'text',
                            required: true,
                            componentIds: ['frontend', 'backend'],
                        },
                    ],
                },
            ];

            const componentConfigs: ComponentConfigs = {
                frontend: {
                    SHARED_API_KEY: '',
                },
                backend: {
                    SHARED_API_KEY: '',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(groupsWithSharedField, componentConfigs)
            );

            expect(result.current.isValid).toBe(false);
            expect(result.current.errors).toHaveProperty('SHARED_API_KEY');
        });

        it('considers field valid if ANY component has value', () => {
            const groupsWithSharedField: ServiceGroup[] = [
                {
                    id: 'shared',
                    label: 'Shared',
                    fields: [
                        {
                            key: 'SHARED_API_KEY',
                            label: 'Shared API Key',
                            type: 'text',
                            required: true,
                            componentIds: ['frontend', 'backend'],
                        },
                    ],
                },
            ];

            const componentConfigs: ComponentConfigs = {
                frontend: {
                    SHARED_API_KEY: 'test-key',
                },
                backend: {
                    SHARED_API_KEY: '',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(groupsWithSharedField, componentConfigs)
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.errors).not.toHaveProperty('SHARED_API_KEY');
        });
    });

    describe('Optional field validation', () => {
        it('does not require optional fields to be filled', () => {
            const componentConfigs: ComponentConfigs = {
                frontend: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                    // ADOBE_COMMERCE_ADMIN_PASSWORD is optional and not provided
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(sampleServiceGroups, componentConfigs)
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.errors).not.toHaveProperty('ADOBE_COMMERCE_ADMIN_PASSWORD');
        });

        it('validates optional fields if they have values', () => {
            const groupsWithOptionalUrl: ServiceGroup[] = [
                {
                    id: 'test',
                    label: 'Test',
                    fields: [
                        {
                            key: 'OPTIONAL_URL',
                            label: 'Optional URL',
                            type: 'url',
                            required: false,
                            componentIds: ['frontend'],
                        },
                    ],
                },
            ];

            const componentConfigs: ComponentConfigs = {
                frontend: {
                    OPTIONAL_URL: 'not-a-url',
                },
            };

            const { result } = renderHook(() =>
                useConfigValidation(groupsWithOptionalUrl, componentConfigs)
            );

            expect(result.current.isValid).toBe(false);
            expect(result.current.errors).toHaveProperty('OPTIONAL_URL');
        });
    });

    describe('Empty config edge cases', () => {
        it('handles empty componentConfigs gracefully', () => {
            const componentConfigs: ComponentConfigs = {};

            const { result } = renderHook(() =>
                useConfigValidation(sampleServiceGroups, componentConfigs)
            );

            expect(result.current.isValid).toBe(false);
            expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);
        });

        it('handles empty service groups gracefully', () => {
            const componentConfigs: ComponentConfigs = {
                frontend: {},
            };

            const { result } = renderHook(() =>
                useConfigValidation([], componentConfigs)
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.errors).toEqual({});
        });
    });
});
