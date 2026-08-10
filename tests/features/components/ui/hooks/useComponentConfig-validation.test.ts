/**
 * useComponentConfig — required-field presence
 *
 * The wizard's Continue gate asks "does this required field have a value?". It used to
 * ask that with a bare truthiness check, so a field holding `false` or `0` read as
 * "required but missing" and blocked Continue with an error the user could not clear —
 * the checkbox IS ticked, the number IS zero.
 *
 * Unreachable when written (`components.json` declares no boolean or numeric env var),
 * but `ConfigFieldRenderer` has a live `case 'boolean'` that writes a real boolean, so
 * the trap was armed and waiting for the first boolean env var. These cases are the
 * ammunition check.
 *
 * @jest-environment jsdom
 */

import { renderHook, waitFor } from '@testing-library/react';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: jest.fn(),
        request: (...args: any[]) => mockRequest(...args),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
}));

// Real validators are irrelevant here — every field under test is `text`.
jest.mock('@/core/validation/Validator', () => ({
    url: () => () => ({ valid: true }),
    pattern: () => () => ({ valid: true }),
    normalizeUrl: (v: string) => v,
}));

// One group so the fields land somewhere.
jest.mock('@/features/components/services/serviceGroupTransforms', () => ({
    toServiceGroupWithSortedFields: (def: any, groups: any) => ({
        ...def,
        fields: groups[def.id] || [],
    }),
    SERVICE_GROUP_DEFINITIONS: [{ id: 'adobe-commerce', label: 'Adobe Commerce', order: 1 }],
}));

// One selected component declaring the field under test.
jest.mock('@/features/components/services/stackComponentCollector', () => ({
    collectStackComponents: () => [
        {
            id: 'headless',
            data: {
                id: 'headless',
                name: 'Headless',
                configuration: { requiredEnvVars: ['FEATURE_ENABLED'], optionalEnvVars: [] },
            },
        },
    ],
}));

jest.mock('@/features/project-creation/ui/hooks/useSelectedStack', () => ({
    getStackById: () => ({ id: 'stack', frontend: 'headless' }),
}));

jest.mock('@/core/ui/utils/componentDataHelpers', () => ({
    findComponentById: jest.fn(),
}));

let useComponentConfig: any;
beforeAll(async () => {
    useComponentConfig = (await import('@/features/components/ui/hooks/useComponentConfig'))
        .useComponentConfig;
});

/** A required env var with no default, so only a stored value can satisfy it. */
const ENV_VARS = {
    FEATURE_ENABLED: {
        key: 'FEATURE_ENABLED',
        label: 'Feature Enabled',
        type: 'text' as const,
        required: true,
        group: 'adobe-commerce',
    },
};

/** Render the hook with a stored value for FEATURE_ENABLED, and report validity. */
async function validityFor(storedValue: unknown) {
    const onValidationChange = jest.fn();
    renderHook(() =>
        useComponentConfig({
            selectedStack: 'stack',
            componentConfigs: { headless: { FEATURE_ENABLED: storedValue } },
            onConfigsChange: jest.fn(),
            onValidationChange,
        })
    );
    await waitFor(() => expect(onValidationChange).toHaveBeenCalled());
    return onValidationChange.mock.calls[onValidationChange.mock.calls.length - 1][0];
}

describe('useComponentConfig — required-field presence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest.mockResolvedValue({
            success: true,
            type: 'components-data',
            data: { frontends: [], backends: [], envVars: ENV_VARS },
        });
    });

    it('treats a stored `false` as PRESENT, not as a missing required field', async () => {
        expect(await validityFor(false)).toBe(true);
    });

    it('treats a stored `0` as PRESENT', async () => {
        expect(await validityFor(0)).toBe(true);
    });

    it('still treats an empty string as MISSING (the control)', async () => {
        expect(await validityFor('')).toBe(false);
    });

    it('still treats an absent value as MISSING (the control)', async () => {
        expect(await validityFor(undefined)).toBe(false);
    });

    it('treats an ordinary value as present (the other control)', async () => {
        expect(await validityFor('yes')).toBe(true);
    });
});
