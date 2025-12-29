/**
 * useFieldValidation Hook Tests
 *
 * Tests validation logic for configuration fields.
 * Verifies that core validators are used instead of inline validation.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useFieldValidation } from '@/features/dashboard/ui/configure/hooks/useFieldValidation';
import type { ServiceGroup } from '@/features/components/ui/hooks/useComponentConfig';
import type { ComponentConfigs } from '@/types/webview';

describe('useFieldValidation', () => {
    // Helper to create mock service groups
    const createServiceGroups = (fields: Partial<ServiceGroup['fields'][0]>[]): ServiceGroup[] => [
        {
            id: 'test-group',
            label: 'Test Group',
            fields: fields.map((f, i) => ({
                key: f.key || `FIELD_${i}`,
                label: f.label || `Field ${i}`,
                type: f.type || 'text',
                required: f.required ?? false,
                componentIds: f.componentIds || ['frontend'],
                validation: f.validation,
            })) as ServiceGroup['fields'],
        },
    ];

    describe('Required field validation', () => {
        it('should flag missing required fields', () => {
            const serviceGroups = createServiceGroups([
                { key: 'REQUIRED_FIELD', label: 'Required Field', required: true },
            ]);
            const componentConfigs: ComponentConfigs = { frontend: {} };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith(
                expect.objectContaining({
                    REQUIRED_FIELD: 'Required Field is required',
                })
            );
        });

        it('should not flag required fields that have values', () => {
            const serviceGroups = createServiceGroups([
                { key: 'REQUIRED_FIELD', label: 'Required Field', required: true },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { REQUIRED_FIELD: 'some-value' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });

        it('should skip MESH_ENDPOINT validation (deferred field)', () => {
            const serviceGroups = createServiceGroups([
                { key: 'MESH_ENDPOINT', label: 'Mesh Endpoint', required: true },
            ]);
            const componentConfigs: ComponentConfigs = { frontend: {} };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });
    });

    describe('URL validation using core validators', () => {
        it('should reject invalid URLs', () => {
            const serviceGroups = createServiceGroups([
                { key: 'COMMERCE_URL', label: 'Commerce URL', type: 'url', required: false },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { COMMERCE_URL: 'not-a-valid-url' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith(
                expect.objectContaining({
                    COMMERCE_URL: 'Please enter a valid URL',
                })
            );
        });

        it('should accept valid URLs with http protocol', () => {
            const serviceGroups = createServiceGroups([
                { key: 'COMMERCE_URL', label: 'Commerce URL', type: 'url', required: false },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { COMMERCE_URL: 'http://example.com' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });

        it('should accept valid URLs with https protocol', () => {
            const serviceGroups = createServiceGroups([
                { key: 'COMMERCE_URL', label: 'Commerce URL', type: 'url', required: false },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { COMMERCE_URL: 'https://example.com' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });

        it('should accept URLs with paths and query strings', () => {
            const serviceGroups = createServiceGroups([
                { key: 'COMMERCE_URL', label: 'Commerce URL', type: 'url', required: false },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { COMMERCE_URL: 'https://example.com/path?query=param' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });

        it('should not validate empty URL fields', () => {
            const serviceGroups = createServiceGroups([
                { key: 'COMMERCE_URL', label: 'Commerce URL', type: 'url', required: false },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { COMMERCE_URL: '' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });
    });

    describe('Pattern validation using core validators', () => {
        it('should reject values that do not match pattern', () => {
            const serviceGroups = createServiceGroups([
                {
                    key: 'ENVIRONMENT_ID',
                    label: 'Environment ID',
                    type: 'text',
                    required: false,
                    validation: { pattern: '^[0-9]+$', message: 'Must be numeric' },
                },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { ENVIRONMENT_ID: 'abc123' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith(
                expect.objectContaining({
                    ENVIRONMENT_ID: 'Must be numeric',
                })
            );
        });

        it('should accept values that match pattern', () => {
            const serviceGroups = createServiceGroups([
                {
                    key: 'ENVIRONMENT_ID',
                    label: 'Environment ID',
                    type: 'text',
                    required: false,
                    validation: { pattern: '^[0-9]+$', message: 'Must be numeric' },
                },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { ENVIRONMENT_ID: '12345' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });

        it('should use default error message when custom message not provided', () => {
            const serviceGroups = createServiceGroups([
                {
                    key: 'ENVIRONMENT_ID',
                    label: 'Environment ID',
                    type: 'text',
                    required: false,
                    validation: { pattern: '^[0-9]+$' }, // No message
                },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { ENVIRONMENT_ID: 'invalid' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith(
                expect.objectContaining({
                    ENVIRONMENT_ID: 'Invalid format',
                })
            );
        });

        it('should not validate empty fields against pattern', () => {
            const serviceGroups = createServiceGroups([
                {
                    key: 'ENVIRONMENT_ID',
                    label: 'Environment ID',
                    type: 'text',
                    required: false,
                    validation: { pattern: '^[0-9]+$', message: 'Must be numeric' },
                },
            ]);
            const componentConfigs: ComponentConfigs = {
                frontend: { ENVIRONMENT_ID: '' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });
    });

    describe('Multi-component field validation', () => {
        it('should check all component IDs for a value', () => {
            const serviceGroups: ServiceGroup[] = [
                {
                    id: 'shared',
                    label: 'Shared',
                    fields: [
                        {
                            key: 'SHARED_KEY',
                            label: 'Shared Key',
                            type: 'text',
                            required: true,
                            componentIds: ['frontend', 'backend'],
                        } as ServiceGroup['fields'][0],
                    ],
                },
            ];
            const componentConfigs: ComponentConfigs = {
                frontend: { SHARED_KEY: '' },
                backend: { SHARED_KEY: 'value-from-backend' },
            };
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            // Should be valid because backend has a value
            expect(setValidationErrors).toHaveBeenCalledWith({});
        });
    });

    describe('Edge cases', () => {
        it('should handle empty service groups', () => {
            const serviceGroups: ServiceGroup[] = [];
            const componentConfigs: ComponentConfigs = {};
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });

        it('should handle empty component configs', () => {
            const serviceGroups = createServiceGroups([
                { key: 'OPTIONAL_FIELD', label: 'Optional Field', required: false },
            ]);
            const componentConfigs: ComponentConfigs = {};
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith({});
        });

        it('should handle undefined component config for a component ID', () => {
            const serviceGroups = createServiceGroups([
                { key: 'FIELD', label: 'Field', required: true, componentIds: ['nonexistent'] },
            ]);
            const componentConfigs: ComponentConfigs = {};
            const setValidationErrors = jest.fn();

            renderHook(() => useFieldValidation({
                serviceGroups,
                componentConfigs,
                setValidationErrors,
            }));

            expect(setValidationErrors).toHaveBeenCalledWith(
                expect.objectContaining({
                    FIELD: 'Field is required',
                })
            );
        });
    });

    describe('Validation update on dependency changes', () => {
        it('should re-validate when componentConfigs changes', () => {
            const serviceGroups = createServiceGroups([
                { key: 'URL_FIELD', label: 'URL Field', type: 'url', required: false },
            ]);
            const setValidationErrors = jest.fn();

            const { rerender } = renderHook(
                ({ configs }) => useFieldValidation({
                    serviceGroups,
                    componentConfigs: configs,
                    setValidationErrors,
                }),
                { initialProps: { configs: { frontend: { URL_FIELD: 'invalid' } } } }
            );

            // First call should have error
            expect(setValidationErrors).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    URL_FIELD: 'Please enter a valid URL',
                })
            );

            // Update to valid URL
            rerender({ configs: { frontend: { URL_FIELD: 'https://valid.com' } } });

            // Should now be valid
            expect(setValidationErrors).toHaveBeenLastCalledWith({});
        });
    });
});
