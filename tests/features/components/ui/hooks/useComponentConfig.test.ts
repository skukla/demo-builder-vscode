/**
 * useComponentConfig Hook Tests — Narrow Interface
 *
 * Validates that useComponentConfig accepts the narrowed props
 * (selectedStack, componentConfigs, packageConfigDefaults,
 * onConfigsChange, onValidationChange) instead of full WizardState.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import type { ComponentConfigs } from '@/types/webview';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock vscode API used by the hook
const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: jest.fn(),
        request: (...args: any[]) => mockRequest(...args),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

// Mock webviewLogger
jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    }),
}));

// Mock Validator
jest.mock('@/core/validation/Validator', () => ({
    url: () => () => ({ valid: true }),
    pattern: () => () => ({ valid: true }),
    normalizeUrl: (v: string) => v.replace(/\/+$/, ''),
}));

// Mock envVarHelpers
jest.mock('@/features/components/services/envVarHelpers', () => ({
    deriveGraphqlEndpoint: jest.fn((v: string) => v + '/graphql'),
}));

// Mock serviceGroupTransforms
jest.mock('@/features/components/services/serviceGroupTransforms', () => ({
    toServiceGroupWithSortedFields: jest.fn(
        (def: any, groups: any) => ({ ...def, fields: groups[def.id] || [] }),
    ),
    SERVICE_GROUP_DEFINITIONS: [],
}));

// Mock useSelectedStack helper
jest.mock('@/features/project-creation/ui/hooks/useSelectedStack', () => ({
    getStackById: jest.fn(),
}));

// Mock componentDataHelpers
jest.mock('@/core/ui/utils/componentDataHelpers', () => ({
    findComponentById: jest.fn(),
}));

// Lazy-import so mocks are registered first
let useComponentConfig: any;

beforeAll(async () => {
    const mod = await import(
        '@/features/components/ui/hooks/useComponentConfig'
    );
    useComponentConfig = mod.useComponentConfig;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useComponentConfig — narrow interface', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: request resolves with empty components data
        mockRequest.mockResolvedValue({
            success: true,
            type: 'components-data',
            data: { frontends: [], backends: [], envVars: {} },
        });
    });

    // -------------------------------------------------------------------
    // Interface shape: accepts narrow props
    // -------------------------------------------------------------------

    describe('accepts narrow props (no WizardState)', () => {
        it('should accept selectedStack instead of state.selectedStack', async () => {
            const { result } = renderHook(() =>
                useComponentConfig({
                    selectedStack: 'eds-paas',
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            );

            // Hook should not throw and should return loading state initially
            expect(result.current.isLoading).toBe(true);
        });

        it('should accept componentConfigs directly instead of state.componentConfigs', async () => {
            const configs: ComponentConfigs = {
                commerce: { COMMERCE_URL: 'https://example.com' },
            };

            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: configs,
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            );

            expect(result.current.isLoading).toBe(true);
        });

        it('should accept packageConfigDefaults directly instead of state.packageConfigDefaults', async () => {
            const defaults = { STORE_CODE: 'default_store' };

            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    packageConfigDefaults: defaults,
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            );

            expect(result.current.isLoading).toBe(true);
        });

        it('should accept onConfigsChange callback instead of updateState', async () => {
            const onConfigsChange = jest.fn();

            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    onConfigsChange,
                    onValidationChange: jest.fn(),
                }),
            );

            expect(result.current.isLoading).toBe(true);
        });

        it('should accept onValidationChange callback instead of setCanProceed', async () => {
            const onValidationChange = jest.fn();

            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange,
                }),
            );

            expect(result.current.isLoading).toBe(true);
        });
    });

    // -------------------------------------------------------------------
    // Callback wiring
    // -------------------------------------------------------------------

    describe('callback wiring', () => {
        it('should call onConfigsChange when component configs change via validation effect', async () => {
            const onConfigsChange = jest.fn();

            renderHook(() =>
                useComponentConfig({
                    componentConfigs: { test: { KEY: 'value' } },
                    onConfigsChange,
                    onValidationChange: jest.fn(),
                }),
            );

            // onConfigsChange should be called during the validation effect
            // (the hook calls updateState/onConfigsChange with componentConfigs)
            await act(async () => {
                await Promise.resolve(); // flush effects
            });

            expect(onConfigsChange).toHaveBeenCalled();
        });

        it('should call onValidationChange during validation effect', async () => {
            const onValidationChange = jest.fn();

            renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange,
                }),
            );

            await act(async () => {
                await Promise.resolve();
            });

            expect(onValidationChange).toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------
    // Return shape unchanged
    // -------------------------------------------------------------------

    describe('return shape', () => {
        it('should return componentConfigs in the result', () => {
            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            );

            expect(result.current).toHaveProperty('componentConfigs');
        });

        it('should return isLoading in the result', () => {
            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            );

            expect(result.current).toHaveProperty('isLoading');
        });

        it('should return serviceGroups in the result', () => {
            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            );

            expect(result.current).toHaveProperty('serviceGroups');
        });

        it('should return updateField function', () => {
            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            );

            expect(typeof result.current.updateField).toBe('function');
        });

        it('should return getFieldValue function', () => {
            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            );

            expect(typeof result.current.getFieldValue).toBe('function');
        });

        it('should return normalizeUrlField function', () => {
            const { result } = renderHook(() =>
                useComponentConfig({
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            );

            expect(typeof result.current.normalizeUrlField).toBe('function');
        });
    });

    // -------------------------------------------------------------------
    // No WizardState dependency
    // -------------------------------------------------------------------

    describe('no WizardState dependency', () => {
        it('should not require state property', () => {
            // The hook should accept props without a 'state' key
            const props = {
                componentConfigs: {},
                onConfigsChange: jest.fn(),
                onValidationChange: jest.fn(),
            };

            // If the hook still required 'state', this would fail
            // because state.componentConfigs would throw
            expect(() => {
                renderHook(() => useComponentConfig(props));
            }).not.toThrow();
        });

        it('should not require updateState property', () => {
            const props = {
                componentConfigs: {},
                onConfigsChange: jest.fn(),
                onValidationChange: jest.fn(),
            };

            expect(() => {
                renderHook(() => useComponentConfig(props));
            }).not.toThrow();
        });

        it('should not require setCanProceed property', () => {
            const props = {
                componentConfigs: {},
                onConfigsChange: jest.fn(),
                onValidationChange: jest.fn(),
            };

            expect(() => {
                renderHook(() => useComponentConfig(props));
            }).not.toThrow();
        });
    });
});
