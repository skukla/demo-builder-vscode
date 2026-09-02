/**
 * useComponentConfig — package config defaults vs saved store scope.
 *
 * Regression suite for the 2026-08-13 field report (leah-b2b-demo): opening the
 * edit wizard on a citisignal-package project stomped the user's saved store
 * scope (website/store/store view chosen in Business Structure) back to the
 * package's configDefaults (citisignal_*), and the republished config.json
 * queried a scope that does not exist on the user's Commerce instance
 * ("No index was found for this request" — no products anywhere).
 *
 * Contract under test: package configDefaults FILL blank fields but never
 * OVERRIDE values already present in componentConfigs. Restamping on a real
 * package switch is WelcomeStep's job (handlePackageSelect clears the old
 * package's keys), not this hook's.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import type { ComponentConfigs } from '@/types/webview';

// ---------------------------------------------------------------------------
// Mocks (per-suite convention; componentConfigWrites + stackComponentCollector
// stay REAL so resolveWriteTargets/backend-owned-scope behaviour is exercised)
// ---------------------------------------------------------------------------

import { mockRequest } from './useComponentConfig.testUtils';


jest.mock('@/features/components/services/envVarHelpers', () => ({
    deriveGraphqlEndpoint: jest.fn((v: string) => v + '/graphql'),
}));

// One real-shaped group so the defaults effect actually runs (the base suite
// mocks SERVICE_GROUP_DEFINITIONS empty and never reaches applyFieldDefaults).



// Import below the mocks so the SUT binds to the stubs (babel-jest hoists the
// jest.mock calls above this import within this module).
import { useComponentConfig } from '@/features/components/ui/hooks/useComponentConfig';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCOPE_KEYS = ['ACCS_WEBSITE_CODE', 'ACCS_STORE_CODE', 'ACCS_STORE_VIEW_CODE'] as const;

const COMPONENTS_DATA = {
    frontends: [{ id: 'eds-storefront', configuration: { requiredEnvVars: [] } }],
    backends: [
        {
            id: 'adobe-commerce-accs',
            configuration: { requiredEnvVars: [...SCOPE_KEYS] },
        },
    ],
    envVars: {
        ACCS_WEBSITE_CODE: { label: 'Website code', type: 'text', required: true, group: 'accs' },
        ACCS_STORE_CODE: { label: 'Store code', type: 'text', required: true, group: 'accs' },
        ACCS_STORE_VIEW_CODE: {
            label: 'Store view code',
            type: 'text',
            required: true,
            group: 'accs',
        },
    },
};

/** The citisignal package's configDefaults, as demo-packages.json ships them. */
const CITISIGNAL_DEFAULTS = {
    ACCS_WEBSITE_CODE: 'citisignal',
    ACCS_STORE_CODE: 'citisignal_store',
    ACCS_STORE_VIEW_CODE: 'citisignal_us',
};

/** A user-selected Business Structure scope (Leah's Bodea site). */
const SAVED_BODEA_SCOPE = {
    ACCS_WEBSITE_CODE: 'base',
    ACCS_STORE_CODE: 'main_website_store',
    ACCS_STORE_VIEW_CODE: 'default',
};

async function renderConfigHook(initialConfigs: ComponentConfigs) {
    const rendered = renderHook(() =>
        useComponentConfig({
            selectedStack: 'eds-accs',
            componentConfigs: initialConfigs,
            packageConfigDefaults: CITISIGNAL_DEFAULTS,
            onConfigsChange: jest.fn(),
            onValidationChange: jest.fn(),
        }),
    );
    // Flush the async components-data load + the defaults effect.
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return rendered;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useComponentConfig — package defaults never override saved scope', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest.mockResolvedValue({
            success: true,
            type: 'components-data',
            data: COMPONENTS_DATA,
        });
    });

    it('preserves a saved store scope when package defaults are applied on load', async () => {
        const { result } = await renderConfigHook({
            'adobe-commerce-accs': { ...SAVED_BODEA_SCOPE },
        });

        const backend = result.current.componentConfigs['adobe-commerce-accs'];
        expect(backend).toMatchObject(SAVED_BODEA_SCOPE);
    });

    it('does not write the package scope onto any other component either', async () => {
        const { result } = await renderConfigHook({
            'adobe-commerce-accs': { ...SAVED_BODEA_SCOPE },
        });

        const frontend = result.current.componentConfigs['eds-storefront'];
        for (const key of SCOPE_KEYS) {
            expect(frontend?.[key]).toBeUndefined();
        }
    });

    it('fills blank store scope from package defaults (create-mode seeding)', async () => {
        const { result } = await renderConfigHook({});

        const backend = result.current.componentConfigs['adobe-commerce-accs'];
        expect(backend).toMatchObject(CITISIGNAL_DEFAULTS);
    });

    it('fills only the missing keys when the saved scope is partial', async () => {
        const { result } = await renderConfigHook({
            'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'base' },
        });

        const backend = result.current.componentConfigs['adobe-commerce-accs'];
        expect(backend.ACCS_WEBSITE_CODE).toBe('base');
        expect(backend.ACCS_STORE_CODE).toBe('citisignal_store');
        expect(backend.ACCS_STORE_VIEW_CODE).toBe('citisignal_us');
    });
});
